"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, CalendarClock, Clock, CreditCard, Save } from "lucide-react";
import { toast } from "sonner";
import { updateServiceAction, rescheduleServiceAction } from "@/lib/data/services";
import { desdeHoraDelNegocio, paraInputDeFechaHora } from "@/lib/locale";
import type { Service } from "@/lib/types";
import ServiceLocationDialog from "@/components/services/service-location-dialog";

export default function ChatMonitorServiceForm({
  service,
  onRefresh,
}: {
  service: Service;
  onRefresh: () => void;
}) {
  const [duracion, setDuracion] = useState(service.duracionPactadaHoras.toString());
  const [metodoPago, setMetodoPago] = useState(service.metodoPago);
  const [fecha, setFecha] = useState(() =>
    paraInputDeFechaHora(
      service.fechaProgramada
        ? new Date(service.fechaProgramada)
        : new Date(Date.now() + 60 * 60_000)
    )
  );

  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sincronizar estado local si el servicio cambia desde afuera (ej. bot auto-rellena)
  useEffect(() => {
    setDuracion(service.duracionPactadaHoras.toString());
    setMetodoPago(service.metodoPago);
    setFecha(
      paraInputDeFechaHora(
        service.fechaProgramada
          ? new Date(service.fechaProgramada)
          : new Date(Date.now() + 60 * 60_000)
      )
    );
  }, [service]);

  // Verificar si hay cambios reales para habilitar el botón de guardar
  const fechaActualISO = service.fechaProgramada
    ? new Date(service.fechaProgramada).toISOString()
    : null;
  const nuevaFecha = desdeHoraDelNegocio(fecha);
  const nuevaFechaISO = nuevaFecha ? nuevaFecha.toISOString() : null;

  const hasChanges =
    duracion !== service.duracionPactadaHoras.toString() ||
    metodoPago !== service.metodoPago ||
    (nuevaFechaISO !== fechaActualISO && service.tipoAgenda === "programado");

  const handleSave = async () => {
    setIsSaving(true);
    let success = true;

    // 1. Actualizar duración y método de pago
    if (
      duracion !== service.duracionPactadaHoras.toString() ||
      metodoPago !== service.metodoPago
    ) {
      const res = await updateServiceAction(service.id, {
        duracionPactadaHoras: parseFloat(duracion),
        metodoPago: metodoPago as any,
      });
      if (!res.success) {
        toast.error(res.error || "Error al actualizar detalles");
        success = false;
      }
    }

    // 2. Reprogramar si la fecha cambió y es un servicio programado
    if (service.tipoAgenda === "programado" && nuevaFechaISO !== fechaActualISO) {
      if (!nuevaFecha || nuevaFecha.getTime() <= Date.now()) {
        toast.error("La nueva hora tiene que estar en el futuro");
        success = false;
      } else {
        const res = await rescheduleServiceAction(service.id, nuevaFecha.toISOString(), false);
        if (!res.success) {
          toast.error(res.error || "Error al reprogramar la fecha");
          success = false;
        }
      }
    }

    setIsSaving(false);
    if (success) {
      toast.success("Servicio actualizado correctamente");
      onRefresh();
    }
  };

  const ubicacionTexto =
    service.locationNameSnapshot || service.locationAddressSnapshot || "Sin ubicación";

  return (
    <div className="space-y-4">
      {/* Lugar */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A55A] flex items-center gap-1.5">
          <MapPin size={12} />
          Ubicación
        </label>
        <div className="flex items-center justify-between gap-2 bg-black border border-zinc-800 rounded-xl px-3 py-2">
          <span className="text-sm text-zinc-300 truncate" title={ubicacionTexto}>
            {ubicacionTexto}
          </span>
          <button
            onClick={() => setIsLocationOpen(true)}
            className="text-xs font-medium text-[#C5A55A] hover:text-[#d8b769] transition-colors whitespace-nowrap bg-[#C5A55A]/10 px-2 py-1 rounded-lg"
          >
            Editar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Duración */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A55A] flex items-center gap-1.5">
            <Clock size={12} />
            Duración (hrs)
          </label>
          <input
            type="number"
            step="0.5"
            min="1"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A] transition-colors"
          />
        </div>

        {/* Método de Pago */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A55A] flex items-center gap-1.5">
            <CreditCard size={12} />
            Método de Pago
          </label>
          <select
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value as any)}
            className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A] transition-colors appearance-none"
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="mixto">Mixto</option>
          </select>
        </div>
      </div>

      {/* Fecha y Hora (solo si es programado) */}
      {service.tipoAgenda === "programado" && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A55A] flex items-center gap-1.5">
            <CalendarClock size={12} />
            Fecha y Hora
          </label>
          <input
            type="datetime-local"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A] transition-colors"
          />
        </div>
      )}

      {/* Botón Guardar */}
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#C5A55A] hover:bg-[#d8b769] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-black transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar Cambios
        </button>
      )}

      {/* Modal de Ubicación */}
      {isLocationOpen && (
        <ServiceLocationDialog
          serviceId={service.id}
          ubicacionActual={ubicacionTexto}
          latitudActual={Number(service.ubicacionClienteLat)}
          longitudActual={Number(service.ubicacionClienteLng)}
          presetLocationIdActual={service.presetLocationId ?? null}
          onClose={() => setIsLocationOpen(false)}
          onChanged={() => {
            setIsLocationOpen(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
