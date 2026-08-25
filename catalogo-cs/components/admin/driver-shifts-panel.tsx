"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Clock, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  assignDriverToShift,
  getShiftsForDriver,
  unassignDriverFromShift,
} from "@/app/admin/turnos/actions";
import { formatDays, formatOccupancy } from "@/lib/driver-shifts";
import type { DriverShiftSummary } from "@/lib/types";

/**
 * Turnos de un chofer, operables desde su propia ficha.
 *
 * La malla de /admin/turnos parte del turno: para darle uno a un chofer habia
 * que abrir el turno y buscarlo entre los candidatos. Cuando lo que tienes
 * delante es al chofer, la vista natural es la contraria.
 *
 * Solo se listan turnos que se pueden tomar de verdad -- activos y con hueco --
 * porque ofrecer uno lleno solo sirve para que la asignacion falle.
 */
export default function DriverShiftsPanel({
  driverId,
  driverName,
}: {
  driverId: string;
  driverName: string;
}) {
  const [assigned, setAssigned] = useState<DriverShiftSummary[]>([]);
  const [available, setAvailable] = useState<DriverShiftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const cargar = async () => {
    const data = await getShiftsForDriver(driverId);
    setAssigned(data.assigned);
    setAvailable(data.available);
  };

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    getShiftsForDriver(driverId)
      .then((data) => {
        if (!vigente) return;
        setAssigned(data.assigned);
        setAvailable(data.available);
      })
      .catch(() => toast.error("No se pudieron cargar los turnos"))
      .finally(() => vigente && setLoading(false));

    return () => {
      vigente = false;
    };
  }, [driverId]);

  const asignar = (shift: DriverShiftSummary) => {
    if (pending) return;
    startTransition(async () => {
      try {
        await assignDriverToShift(shift.id, driverId);
        await cargar();
        toast.success(`${driverName} entra al turno ${shift.title}`);
      } catch (err: any) {
        toast.error(err?.message || "No se pudo asignar el turno");
        await cargar();
      }
    });
  };

  const retirar = (shift: DriverShiftSummary) => {
    if (pending) return;
    startTransition(async () => {
      try {
        await unassignDriverFromShift(shift.id, driverId);
        await cargar();
        toast.success(`${driverName} sale del turno ${shift.title}`);
      } catch (err: any) {
        toast.error(err?.message || "No se pudo retirar del turno");
        await cargar();
      }
    });
  };

  return (
    <div className="border border-zinc-800 bg-black/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock size={14} className="text-[#C5A55A]" />
        <h4 className="text-xs font-bold uppercase tracking-widest text-[#C5A55A]">
          Turnos asignados
        </h4>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Cargando turnos...</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {assigned.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Este chofer no tiene ningun turno asignado.
              </p>
            ) : (
              assigned.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between gap-3 border border-zinc-800/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-white">
                      {shift.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {shift.startsAt}-{shift.endsAt} · {formatDays(shift.daysOfWeek)} ·{" "}
                      {formatOccupancy(shift.assignedCount, shift.capacity)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => retirar(shift)}
                    className="inline-flex shrink-0 items-center gap-1.5 border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <X size={12} />
                    Retirar
                  </button>
                </div>
              ))
            )}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Turnos disponibles
            </p>

            {available.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No hay turnos con cupo libre. Crea uno o libera espacio desde la
                pantalla de turnos.
              </p>
            ) : (
              <div className="space-y-2">
                {available.map((shift) => (
                  <div
                    key={shift.id}
                    className="flex items-center justify-between gap-3 border border-zinc-800/60 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-zinc-300">
                        {shift.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {shift.startsAt}-{shift.endsAt} ·{" "}
                        {formatDays(shift.daysOfWeek)} ·{" "}
                        {formatOccupancy(shift.assignedCount, shift.capacity)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => asignar(shift)}
                      className="inline-flex shrink-0 items-center gap-1.5 border border-[#C5A55A]/40 bg-[#C5A55A]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20 disabled:opacity-50"
                    >
                      <Plus size={12} />
                      Asignar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {assigned.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Check size={11} />
              El despacho automatico solo considera a los choferes con turno
              vigente.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
