"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import type { DriverShiftCandidates, DriverShiftDetail, DriverShiftSummary } from "@/lib/types";
import {
  assignDriverToShift,
  createDriverShift,
  deactivateDriverShift,
  getDriverShift,
  getDriverShiftCandidates,
  unassignDriverFromShift,
} from "@/app/admin/turnos/actions";

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatDays(daysOfWeek: number[]) {
  return [...daysOfWeek]
    .sort((a, b) => a - b)
    .map((day) => DAY_LABELS[day])
    .join(", ");
}

interface Props {
  initialShifts: DriverShiftSummary[];
}

export default function DriverShiftsClient({ initialShifts }: Props) {
  const [shifts, setShifts] = useState(initialShifts);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<DriverShiftDetail | null>(null);
  const [candidates, setCandidates] = useState<DriverShiftCandidates | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("16:00");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [capacity, setCapacity] = useState("");

  const toggleDay = (day: number) => {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  };

  const resetForm = () => {
    setTitle("");
    setStartsAt("08:00");
    setEndsAt("16:00");
    setSelectedDays([1, 2, 3, 4, 5]);
    setCapacity("");
  };

  const handleCreate = async () => {
    if (title.trim().length < 3) {
      toast.error("Ponle un título al turno (mínimo 3 caracteres)");
      return;
    }
    if (selectedDays.length === 0) {
      toast.error("Selecciona al menos un día de la semana");
      return;
    }
    if (startsAt === endsAt) {
      toast.error("La hora de inicio y fin no pueden ser iguales");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createDriverShift({
        title: title.trim(),
        startsAt,
        endsAt,
        daysOfWeek: selectedDays,
        capacity: capacity ? Number(capacity) : undefined,
      });
      setShifts((current) => [
        {
          id: created.id,
          title: created.title,
          startsAt: created.startsAt,
          endsAt: created.endsAt,
          daysOfWeek: created.daysOfWeek,
          capacity: created.capacity,
          active: created.active,
          createdByUserId: created.createdByUserId,
          createdAt: created.createdAt,
          assignedCount: 0,
        },
        ...current,
      ]);
      toast.success("Turno creado");
      resetForm();
      setShowForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible crear el turno");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("¿Desactivar este turno? Los choferes asignados dejarán de ser elegibles por este turno para el despacho automático.")) return;
    try {
      await deactivateDriverShift(id);
      setShifts((current) =>
        current.map((shift) => (shift.id === id ? { ...shift, active: false } : shift)),
      );
      if (detail?.id === id) setDetail({ ...detail, active: false });
      toast.success("Turno desactivado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible desactivar el turno");
    }
  };

  const openDetail = async (id: string) => {
    setLoadingDetailId(id);
    try {
      const [shiftDetail, candidateList] = await Promise.all([
        getDriverShift(id),
        getDriverShiftCandidates(id),
      ]);
      setDetail(shiftDetail);
      setCandidates(candidateList);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cargar el turno");
    } finally {
      setLoadingDetailId(null);
    }
  };

  const refreshDetail = async (id: string) => {
    const [shiftDetail, candidateList] = await Promise.all([
      getDriverShift(id),
      getDriverShiftCandidates(id),
    ]);
    setDetail(shiftDetail);
    setCandidates(candidateList);
    setShifts((current) =>
      current.map((shift) =>
        shift.id === id ? { ...shift, assignedCount: shiftDetail.assignedDrivers.length } : shift,
      ),
    );
  };

  const handleAssign = async (driverId: string) => {
    if (!detail) return;
    try {
      await assignDriverToShift(detail.id, driverId);
      toast.success("Chofer asignado");
      await refreshDetail(detail.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible asignar al chofer");
    }
  };

  const handleUnassign = async (driverId: string) => {
    if (!detail) return;
    try {
      await unassignDriverFromShift(detail.id, driverId);
      toast.success("Chofer retirado del turno");
      await refreshDetail(detail.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible retirar al chofer");
    }
  };

  const isFull =
    candidates?.capacity != null && candidates.assignedCount >= candidates.capacity;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Turnos de choferes"
          description="Define bloques de horario y asigna choferes; el despacho automático solo ofrece viajes a quienes tienen un turno activo, si tienen turnos asignados."
        />
        <Button
          onClick={() => setShowForm((visible) => !visible)}
          className="rounded-full bg-brand-gold text-black hover:bg-brand-gold/80"
        >
          {showForm ? "Cerrar" : "Nuevo turno"}
        </Button>
      </div>

      {showForm && (
        <section className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-xs text-zinc-400 sm:col-span-1">
              <span className="mb-1 block">Título del turno</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej. Turno matutino"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-gold"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block">Hora de inicio</span>
              <input
                type="time"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-gold"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block">Hora de fin</span>
              <input
                type="time"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-gold"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-2 block text-xs text-zinc-400">Días de la semana</span>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
                      selectedDays.includes(day)
                        ? "border-brand-gold bg-brand-gold text-black"
                        : "border-zinc-800 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block">Capacidad (opcional)</span>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                placeholder="Sin límite"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-gold"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creando..." : "Crear turno"}
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        {shifts.length === 0 ? (
          <p className="py-8 text-center text-sm italic text-zinc-600">
            Todavía no hay turnos creados.
          </p>
        ) : (
          shifts.map((shift) => (
            <article
              key={shift.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-semibold text-zinc-100">
                      {shift.title}
                    </h3>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        shift.active
                          ? "border-brand-gold/40 bg-brand-gold/10 text-brand-gold"
                          : "border-zinc-700 bg-zinc-900 text-zinc-500"
                      }`}
                    >
                      {shift.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                    <Clock size={12} /> {shift.startsAt} — {shift.endsAt} · {formatDays(shift.daysOfWeek)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {shift.assignedCount} chofer{shift.assignedCount === 1 ? "" : "es"} asignado
                    {shift.assignedCount === 1 ? "" : "s"}
                    {shift.capacity != null ? ` / ${shift.capacity} cupos` : " (sin límite)"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDetail(shift.id)}
                    disabled={loadingDetailId === shift.id}
                  >
                    {loadingDetailId === shift.id ? "Cargando..." : "Gestionar"}
                  </Button>
                  {shift.active && (
                    <Button size="sm" variant="destructive" onClick={() => handleDeactivate(shift.id)}>
                      Desactivar
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-semibold text-zinc-100">{detail.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {detail.startsAt} — {detail.endsAt} · {formatDays(detail.daysOfWeek)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setCandidates(null);
                }}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-white"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
              Choferes asignados ({detail.assignedDrivers.length}
              {detail.capacity != null ? ` / ${detail.capacity}` : ""})
            </h4>
            <div className="mb-5 space-y-2">
              {detail.assignedDrivers.length === 0 && (
                <p className="text-sm italic text-zinc-600">Sin choferes asignados.</p>
              )}
              {detail.assignedDrivers.map((driver) => (
                <div
                  key={driver.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2.5"
                >
                  <span className="text-sm text-zinc-200">{driver.nombre}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-zinc-400">
                      {driver.score}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUnassign(driver.id)}
                      className="p-1 text-zinc-600 hover:text-red-400"
                      aria-label={`Retirar a ${driver.nombre}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
              Candidatos disponibles (ordenados por desempeño)
            </h4>
            {isFull && (
              <p className="mb-2 text-xs text-amber-400">
                Turno en capacidad máxima — retira a un chofer de menor desempeño antes de agregar a otro.
              </p>
            )}
            <div className="space-y-2">
              {candidates?.candidates.length === 0 && (
                <p className="text-sm italic text-zinc-600">No hay más choferes elegibles.</p>
              )}
              {candidates?.candidates.map((driver) => (
                <div
                  key={driver.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-900 px-4 py-2.5"
                >
                  <span className="text-sm text-zinc-300">{driver.nombre}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-zinc-500">
                      {driver.score}
                    </span>
                    <Button size="sm" onClick={() => handleAssign(driver.id)} disabled={isFull}>
                      Asignar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
