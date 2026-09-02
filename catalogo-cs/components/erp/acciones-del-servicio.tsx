"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, X } from "lucide-react";
import { toast } from "sonner";

import CerrarPorOficina from "@/components/services/cerrar-por-oficina";
import ReasignarModelo, {
  type ModeloDisponible,
} from "@/components/services/reasignar-modelo";
import CancelServiceDialog from "@/components/services/cancel-service-dialog";
import {
  cancelServiceAction,
  cerrarPorOficinaAction,
  decideServiceAction,
  reasignarEmpleadaAction,
} from "@/lib/data/services";
import { type CancellationReason } from "@/lib/cancellation-reasons";

/**
 * Lo que se puede hacer con este servicio desde el panel de admin.
 *
 * La ficha de un servicio era de solo lectura: 651 lineas sin un boton. El
 * admin veia mas que nadie y podia hacer menos que un jefe, asi que cuando algo
 * se torcia el sitio natural donde ir a arreglarlo era justo el que no dejaba
 * arreglar nada.
 *
 * Las acciones son las mismas del panel del jefe y llaman a los mismos
 * endpoints; lo unico que cambia es que el jefe comprueba ademas que el
 * servicio sea de su equipo. Cada una aparece solo cuando tiene sentido para el
 * estado en el que esta: un servicio cerrado se consulta, no se opera.
 */

/** Los estados sobre los que todavia se puede actuar. */
const VIVOS = ["pendiente", "agendado", "en_curso"];

export default function AccionesDelServicio({
  servicioId,
  estado,
  empleadaId,
  etiqueta,
  modelos,
}: {
  servicioId: string;
  estado: string;
  empleadaId: string;
  /** Nombre de la modelo, solo para el encabezado del dialogo de cancelacion. */
  etiqueta: string;
  /** Para reasignar. Vacio si no se pudieron cargar: el bloque no aparece. */
  modelos: ModeloDisponible[];
}) {
  const router = useRouter();
  const [cancelando, setCancelando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  // Un servicio cerrado se consulta, no se opera. Sin esto la ficha ofreceria
  // botones que el backend rechaza, que es peor que no ofrecerlos.
  if (!VIVOS.includes(estado)) return null;

  const porAutorizar = estado === "pendiente";
  const enCurso = estado === "en_curso";

  function decidir(decision: "aceptar" | "rechazar") {
    startTransition(async () => {
      const resultado = await decideServiceAction(servicioId, decision);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success(
        decision === "aceptar" ? "Servicio autorizado" : "Servicio rechazado",
      );
      router.refresh();
    });
  }

  function cancelar(reason: CancellationReason, note: string) {
    startTransition(async () => {
      const resultado = await cancelServiceAction(servicioId, reason, note);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Servicio cancelado");
      setCancelando(false);
      router.refresh();
    });
  }

  return (
    <>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-300">
          Acciones
        </h2>
        <p className="mb-4 text-[11px] text-zinc-500">
          Lo mismo que puede hacer el jefe desde su panel.
        </p>

        <div className="flex flex-col gap-2.5">
          {porAutorizar && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pendiente}
                onClick={() => decidir("aceptar")}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#C5A55A] py-3 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-[#d8b769] disabled:opacity-50"
              >
                <Check size={16} />
                Autorizar
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => decidir("rechazar")}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-3 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50"
              >
                <X size={16} />
                Rechazar
              </button>
            </div>
          )}

          {/* Reasignar va antes que cerrar y que cancelar: cuando algo se
              tuerce, lo primero es intentar que el servicio siga en pie. */}
          {modelos.length > 0 && (
            <ReasignarModelo
              servicioId={servicioId}
              empleadaActualId={empleadaId}
              modelos={modelos}
              reasignar={reasignarEmpleadaAction}
            />
          )}

          {enCurso && (
            <CerrarPorOficina
              servicioId={servicioId}
              cerrar={cerrarPorOficinaAction}
            />
          )}

          <button
            type="button"
            disabled={pendiente}
            onClick={() => setCancelando(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-900/40 py-3 text-xs font-semibold uppercase tracking-wider text-red-400/80 transition-colors hover:border-red-800 hover:text-red-300 disabled:opacity-50"
          >
            <Ban size={16} />
            Cancelar servicio
          </button>
        </div>
      </section>

      {cancelando && (
        <CancelServiceDialog
          serviceLabel={etiqueta}
          disabled={pendiente}
          onConfirm={cancelar}
          onCancel={() => setCancelando(false)}
        />
      )}
    </>
  );
}
