"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarRange, LayoutGrid, Percent, Users, X } from "lucide-react";

import {
  Empty,
  ErpPageHeader,
  ErpTable,
  KpiCard,
  KpiGrid,
  Panel,
  StatusBadge,
  Td,
  TFootRow,
  Th,
} from "@/components/erp/primitives";
import type {
  ApiUser,
  DriverShiftCandidates,
  DriverShiftDetail,
  DriverShiftSummary,
} from "@/lib/types";
import {
  assignDriverToShift,
  createDriverShift,
  deactivateDriverShift,
  getDriverShift,
  getDriverShiftCandidates,
  unassignDriverFromShift,
} from "@/app/admin/turnos/actions";

/**
 * Malla de turnos de choferes.
 *
 * El despacho automatico solo ofrece viajes a quien tiene un turno activo, asi
 * que un cupo sin cubrir es un viaje que nadie va a aceptar. La malla muestra
 * donde estan esos huecos; la definicion y las asignaciones siguen operandose
 * desde aqui, con las mismas acciones de antes.
 */

/** Orden de la semana operativa: lunes primero, como el resto del ERP. */
const SEMANA = [
  { dia: 1, label: "Lunes", corto: "Lun" },
  { dia: 2, label: "Martes", corto: "Mar" },
  { dia: 3, label: "Miercoles", corto: "Mie" },
  { dia: 4, label: "Jueves", corto: "Jue" },
  { dia: 5, label: "Viernes", corto: "Vie" },
  { dia: 6, label: "Sabado", corto: "Sab" },
  { dia: 0, label: "Domingo", corto: "Dom" },
] as const;

/** Los dias llegan como en Date.getDay(): 0 es domingo. */
const DAY_LABELS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function formatDays(daysOfWeek: number[]) {
  if (daysOfWeek.length === 7) return "Todos los dias";
  return [...daysOfWeek]
    .sort((a, b) => (a || 7) - (b || 7))
    .map((day) => DAY_LABELS[day])
    .join(", ");
}

export default function TurnosClient({
  initialShifts,
  users,
}: {
  initialShifts: DriverShiftSummary[];
  /** Para resolver quien creo cada turno sin mostrar un UUID. */
  users: ApiUser[];
}) {
  const [shifts, setShifts] = useState(initialShifts);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<DriverShiftDetail | null>(null);
  const [candidates, setCandidates] = useState<DriverShiftCandidates | null>(
    null,
  );
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("16:00");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [capacity, setCapacity] = useState("");

  const nombreUsuario = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const user of users) {
      const nombre = [user.nombre, user.apellido].filter(Boolean).join(" ");
      mapa.set(user.id, nombre || user.email);
    }
    return mapa;
  }, [users]);

  const activos = useMemo(
    () => shifts.filter((shift) => shift.active),
    [shifts],
  );

  /**
   * Cupos de la semana.
   *
   * Un turno ocupa un cupo por cada dia en que corre, asi que la capacidad
   * semanal es capacidad por dias. Los turnos sin capacidad declarada no
   * limitan a nadie: cuentan sus asignados pero no aportan cupos libres, y por
   * eso se informan aparte en lugar de inflar la cobertura.
   */
  const cupos = useMemo(() => {
    let capacidad = 0;
    let asignados = 0;
    let sinLimite = 0;

    for (const shift of activos) {
      const dias = shift.daysOfWeek.length;
      asignados += shift.assignedCount * dias;
      if (shift.capacity == null) sinLimite += 1;
      else capacidad += shift.capacity * dias;
    }

    /* Un turno sobreasignado no puede restar huecos de los demas. */
    const libres = activos.reduce((sum, shift) => {
      if (shift.capacity == null) return sum;
      const hueco = shift.capacity - shift.assignedCount;
      return sum + Math.max(0, hueco) * shift.daysOfWeek.length;
    }, 0);

    return {
      capacidad,
      asignados,
      libres,
      sinLimite,
      cobertura: capacidad ? Math.min(1, asignados / capacidad) : null,
    };
  }, [activos]);

  /** Dias con al menos un cupo libre, para senalar donde falta gente. */
  const diasFlojos = useMemo(() => {
    const huecos = new Map<number, number>();

    for (const shift of activos) {
      if (shift.capacity == null) continue;
      const hueco = Math.max(0, shift.capacity - shift.assignedCount);
      if (!hueco) continue;
      for (const dia of shift.daysOfWeek) {
        huecos.set(dia, (huecos.get(dia) ?? 0) + hueco);
      }
    }

    return SEMANA.filter(({ dia }) => (huecos.get(dia) ?? 0) > 0).map(
      ({ dia, label }) => ({ label, huecos: huecos.get(dia) ?? 0 }),
    );
  }, [activos]);

  const toggleDay = (day: number) => {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day],
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
      toast.error("Ponle un titulo al turno (minimo 3 caracteres)");
      return;
    }
    if (selectedDays.length === 0) {
      toast.error("Selecciona al menos un dia de la semana");
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
      setShifts((current) => [{ ...created, assignedCount: 0 }, ...current]);
      toast.success("Turno creado");
      resetForm();
      setShowForm(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No fue posible crear el turno",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (
      !confirm(
        "Desactivar este turno? Los choferes asignados dejaran de ser elegibles por este turno para el despacho automatico.",
      )
    ) {
      return;
    }

    try {
      await deactivateDriverShift(id);
      setShifts((current) =>
        current.map((shift) =>
          shift.id === id ? { ...shift, active: false } : shift,
        ),
      );
      if (detail?.id === id) setDetail({ ...detail, active: false });
      toast.success("Turno desactivado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible desactivar el turno",
      );
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
      toast.error(
        error instanceof Error ? error.message : "No fue posible cargar el turno",
      );
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
        shift.id === id
          ? { ...shift, assignedCount: shiftDetail.assignedDrivers.length }
          : shift,
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
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible asignar al chofer",
      );
    }
  };

  const handleUnassign = async (driverId: string) => {
    if (!detail) return;
    try {
      await unassignDriverFromShift(detail.id, driverId);
      toast.success("Chofer retirado del turno");
      await refreshDetail(detail.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible retirar al chofer",
      );
    }
  };

  const isFull =
    candidates?.capacity != null && candidates.assignedCount >= candidates.capacity;

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Turnos"
        description="Malla de choferes - el despacho automatico solo ofrece viajes a quien tiene turno activo"
        actions={
          <button
            type="button"
            onClick={() => setShowForm((visible) => !visible)}
            className="rounded-xl border border-[#C5A55A] bg-transparent px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black"
          >
            {showForm ? "Cerrar" : "Nuevo turno"}
          </button>
        }
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Turnos definidos"
          icon={LayoutGrid}
          value={shifts.length}
          footnote={`${activos.length} ${
            activos.length === 1 ? "activo" : "activos"
          } - ${shifts.length - activos.length} inactivos`}
        />
        <KpiCard
          label="Cupos de la semana"
          icon={Users}
          value={cupos.capacidad || "--"}
          footnote={
            cupos.capacidad
              ? `${cupos.asignados} asignados - ${cupos.libres} libres`
              : "Ningun turno activo declara capacidad"
          }
        />
        <KpiCard
          label="Cobertura"
          icon={Percent}
          value={
            cupos.cobertura === null
              ? "--"
              : `${Math.round(cupos.cobertura * 100)} %`
          }
          footnote={
            cupos.sinLimite
              ? `${cupos.sinLimite} ${
                  cupos.sinLimite === 1 ? "turno" : "turnos"
                } sin limite, fuera del calculo`
              : "Sobre los turnos con capacidad"
          }
        />
        <KpiCard
          label="Cupos sin cubrir"
          icon={CalendarRange}
          value={cupos.libres}
          footnote={
            diasFlojos.length
              ? `Sobre todo ${diasFlojos
                  .slice(0, 3)
                  .map((item) => item.label.toLowerCase())
                  .join(", ")}`
              : "Todos los turnos completos"
          }
        />
      </KpiGrid>

      {showForm ? (
        <Panel title="Nuevo turno" subtitle="turnos_chofer">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-xs text-zinc-400">
              <span className="mb-1.5 block">Titulo del turno</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej. Turno matutino"
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A]"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              <span className="mb-1.5 block">Hora de inicio</span>
              <input
                type="time"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none focus:border-[#C5A55A]"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              <span className="mb-1.5 block">Hora de fin</span>
              <input
                type="time"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none focus:border-[#C5A55A]"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-2 block text-xs text-zinc-400">
                Dias de la semana
              </span>
              <div className="flex flex-wrap gap-2">
                {SEMANA.map(({ dia, corto }) => (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDay(dia)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] transition-colors ${
                      selectedDays.includes(dia)
                        ? "border-[#C5A55A] bg-[#C5A55A] text-black"
                        : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {corto}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-xs text-zinc-400">
              <span className="mb-1.5 block">Capacidad (opcional)</span>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                placeholder="Sin limite"
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A]"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={submitting}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              className="rounded-xl bg-[#C5A55A] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-black transition-colors hover:bg-[#d8b769] disabled:opacity-50"
            >
              {submitting ? "Creando..." : "Crear turno"}
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Malla semanal"
        subtitle="asignados sobre capacidad - un chofer se asigna al turno, asi que cubre todos los dias en que ese turno corre"
        flush
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Turno</Th>
              {SEMANA.map(({ dia, label }) => (
                <Th key={dia} numeric>
                  {label}
                </Th>
              ))}
            </tr>
          </thead>

          <tbody>
            {activos.length === 0 ? (
              <tr>
                <Td colSpan={8} className="py-10 text-center text-zinc-500">
                  No hay turnos activos. Crea uno para armar la malla.
                </Td>
              </tr>
            ) : (
              activos.map((shift) => (
                <tr key={shift.id}>
                  <Td>
                    <span className="font-semibold text-white">
                      {shift.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      {`${shift.startsAt} - ${shift.endsAt}`}
                    </span>
                  </Td>

                  {SEMANA.map(({ dia }) => {
                    const corre = shift.daysOfWeek.includes(dia);
                    if (!corre) {
                      return (
                        <Td key={dia} numeric>
                          <Empty />
                        </Td>
                      );
                    }

                    const completo =
                      shift.capacity != null &&
                      shift.assignedCount >= shift.capacity;

                    return (
                      <Td key={dia} numeric>
                        <span
                          className={
                            completo ? "text-green-400" : "text-amber-400"
                          }
                        >
                          {shift.capacity == null
                            ? shift.assignedCount
                            : `${shift.assignedCount} / ${shift.capacity}`}
                        </span>
                      </Td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>

          {activos.length ? (
            <tfoot>
              <TFootRow>
                <Td>Cupos libres</Td>
                {SEMANA.map(({ dia }) => {
                  const huecos = activos.reduce((sum, shift) => {
                    if (shift.capacity == null) return sum;
                    if (!shift.daysOfWeek.includes(dia)) return sum;
                    return sum + Math.max(0, shift.capacity - shift.assignedCount);
                  }, 0);

                  return (
                    <Td key={dia} numeric>
                      {huecos || <Empty />}
                    </Td>
                  );
                })}
              </TFootRow>
            </tfoot>
          ) : null}
        </ErpTable>
      </Panel>

      <Panel title="Definicion de turnos" subtitle="turnos_chofer" flush>
        <ErpTable>
          <thead>
            <tr>
              <Th>Turno</Th>
              <Th>Horario</Th>
              <Th>Dias</Th>
              <Th numeric>Asignados</Th>
              <Th numeric>Capacidad</Th>
              <Th>Creado por</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>

          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <Td colSpan={8} className="py-10 text-center text-zinc-500">
                  Todavia no hay turnos creados.
                </Td>
              </tr>
            ) : (
              shifts.map((shift) => (
                <tr key={shift.id}>
                  <Td>
                    <span className="font-semibold text-white">
                      {shift.title}
                    </span>
                  </Td>

                  <Td>{`${shift.startsAt} - ${shift.endsAt}`}</Td>

                  <Td>{formatDays(shift.daysOfWeek)}</Td>

                  <Td numeric>{shift.assignedCount}</Td>

                  <Td numeric>
                    {shift.capacity ?? (
                      <span className="text-zinc-500">Sin limite</span>
                    )}
                  </Td>

                  <Td>
                    {nombreUsuario.get(shift.createdByUserId) ?? <Empty />}
                  </Td>

                  <Td>
                    <StatusBadge tone={shift.active ? "green" : "zinc"}>
                      {shift.active ? "Activo" : "Inactivo"}
                    </StatusBadge>
                  </Td>

                  <Td>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openDetail(shift.id)}
                        disabled={loadingDetailId === shift.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-50"
                      >
                        {loadingDetailId === shift.id
                          ? "Cargando..."
                          : "Gestionar"}
                      </button>

                      {shift.active ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(shift.id)}
                          className="rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-red-400 transition-colors hover:bg-red-400/20"
                        >
                          Desactivar
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </ErpTable>
      </Panel>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-6">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-800 bg-[#050505] p-5 sm:rounded-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-heading text-xl font-semibold text-[#E8D5A3]">
                  {detail.title}
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {`${detail.startsAt} - ${detail.endsAt} - ${formatDays(
                    detail.daysOfWeek,
                  )}`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  setCandidates(null);
                }}
                className="rounded-xl p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              {`Choferes asignados (${detail.assignedDrivers.length}${
                detail.capacity != null ? ` / ${detail.capacity}` : ""
              })`}
            </h4>

            <div className="mb-6 flex flex-col gap-2">
              {detail.assignedDrivers.length === 0 ? (
                <p className="text-[13px] text-zinc-500">
                  Sin choferes asignados.
                </p>
              ) : (
                detail.assignedDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-zinc-200">
                      {driver.nombre}
                    </span>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold tabular-nums text-zinc-500">
                        {driver.score}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleUnassign(driver.id)}
                        className="text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-500 transition-colors hover:text-red-400"
                      >
                        Retirar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              Candidatos disponibles, ordenados por desempeno
            </h4>

            {isFull ? (
              <p className="mb-2.5 text-[11px] text-amber-400">
                Turno en capacidad maxima. Retira a un chofer de menor desempeno
                antes de agregar a otro.
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              {candidates?.candidates.length === 0 ? (
                <p className="text-[13px] text-zinc-500">
                  No hay mas choferes elegibles.
                </p>
              ) : (
                candidates?.candidates.map((driver) => (
                  <div
                    key={driver.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/60 px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-zinc-300">
                      {driver.nombre}
                    </span>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-semibold tabular-nums text-zinc-500">
                        {driver.score}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleAssign(driver.id)}
                        disabled={isFull}
                        className="rounded-xl border border-[#C5A55A] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-40"
                      >
                        Asignar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
