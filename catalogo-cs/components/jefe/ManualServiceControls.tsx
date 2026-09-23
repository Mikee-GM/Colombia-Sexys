"use client";

import { useState } from "react";
import {
  Loader2,
  Bot,
  Plus,
  Clock,
  MapPin,
  CheckSquare,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import {
  marcarEmpleadaListaManual,
  updateUberStatusManual,
  finishServiceManual,
  pedirProrrogaManual,
  extendServiceManual,
  addExtraManual,
} from "@/lib/actions/jefe-panel";
import type { Service } from "@/lib/types";

export default function ManualServiceControls({
  service,
  onRefresh,
}: {
  service: Service;
  onRefresh: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const wrapAction = async (
    action: () => Promise<{ success: boolean; error?: string }>,
    successMsg: string,
  ) => {
    setIsLoading(true);
    const result = await action();
    setIsLoading(false);
    if (result.success) {
      toast.success(successMsg);
      onRefresh();
      setIsOpen(false);
    } else {
      toast.error(result.error);
    }
  };

  const trips = service.viajes || [];
  const currentTrip = trips.length > 0 ? trips[trips.length - 1] : null;
  const isEnCurso = service.estado === "en_curso";

  // Show section if any action is theoretically possible
  const canShow =
    isEnCurso || (currentTrip && currentTrip.estado === "en_camino");

  if (!canShow) return null;

  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-3 text-sm font-semibold text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#C5A55A]" />
          Acciones Manuales (Por Modelo)
        </span>
        <span className="text-xs text-zinc-500">
          {isOpen ? "Ocultar" : "Mostrar"}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-zinc-800 p-3 pt-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {isEnCurso &&
              service.transporteAgendado === "uber" &&
              !service.empleadaListaAt && (
                <button
                  disabled={isLoading}
                  onClick={() =>
                    wrapAction(
                      () => marcarEmpleadaListaManual(service.id),
                      "Modelo marcada como lista",
                    )
                  }
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-left hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Marcar Lista</span>
                </button>
              )}

            {currentTrip?.estado === "en_camino" &&
              currentTrip.proveedorTransporte === "uber" && (
                <button
                  disabled={isLoading}
                  onClick={() =>
                    wrapAction(
                      () => updateUberStatusManual(currentTrip.id, "llegado"),
                      "Llegada marcada",
                    )
                  }
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-left hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5 text-sky-400" />
                  <span>Marcar Llegada</span>
                </button>
              )}

            {isEnCurso && (
              <>
                <button
                  disabled={isLoading}
                  onClick={() => {
                    if (
                      confirm(
                        "¿Finalizar el servicio de forma estándar? (Esto cierra el servicio sin dejar un motivo como cierre por oficina)",
                      )
                    ) {
                      wrapAction(
                        () => finishServiceManual(service.id),
                        "Servicio finalizado",
                      );
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-left hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-red-400" />
                  <span>Finalizar (Std)</span>
                </button>

                <button
                  disabled={isLoading}
                  onClick={() => {
                    if (
                      confirm(
                        "¿Pedir una prórroga de 10 minutos para este servicio?",
                      )
                    ) {
                      wrapAction(
                        () => pedirProrrogaManual(service.id),
                        "Prórroga solicitada",
                      );
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-left hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  <span>Prórroga</span>
                </button>

                <button
                  disabled={isLoading}
                  onClick={() => {
                    const hrs = prompt("¿Cuántas horas quieres extender?");
                    if (hrs && !isNaN(Number(hrs)) && Number(hrs) > 0) {
                      wrapAction(
                        () => extendServiceManual(service.id, Number(hrs)),
                        "Servicio extendido",
                      );
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-left hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-[#C5A55A]" />
                  <span>Extender Horas</span>
                </button>

                <button
                  disabled={isLoading}
                  onClick={() => {
                    const monto = prompt(
                      "¿Monto del extra a cobrar en efectivo? (Sin extra de catálogo)",
                    );
                    if (monto && !isNaN(Number(monto)) && Number(monto) > 0) {
                      wrapAction(
                        () =>
                          addExtraManual(
                            service.id,
                            "efectivo",
                            undefined,
                            Number(monto),
                          ),
                        "Extra agregado",
                      );
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-left hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Cobrar Extra</span>
                </button>
              </>
            )}
          </div>
          {isLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Procesando...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
