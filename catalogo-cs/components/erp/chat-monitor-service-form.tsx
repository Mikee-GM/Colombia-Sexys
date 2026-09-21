"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, CalendarClock, Clock, CreditCard, DollarSign } from "lucide-react";
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
  const [precio, setPrecio] = useState(service.precioBaseHoraPactado.toString());
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
    setPrecio(service.precioBaseHoraPactado.toString());
    setMetodoPago(service.metodoPago);
    setFecha(
      paraInputDeFechaHora(
        service.fechaProgramada
          ? new Date(service.fechaProgramada)
          : new Date(Date.now() + 60 * 60_000)
      )
    );
  }, [service]);

  const handleBlurText = async () => {
    const d = parseFloat(duracion);
    const p = parseFloat(precio);
    if (isNaN(d) || isNaN(p) || d < 1 || p < 0) return;

    if (
      d !== Number(service.duracionPactadaHoras) ||
      p !== Number(service.precioBaseHoraPactado)
    ) {
      setIsSaving(true);
      const res = await updateServiceAction(service.id, {
        duracionPactadaHoras: d,
        precioBaseHoraPactado: p,
      });
      setIsSaving(false);
      if (res.success) {
        toast.success("Detalles actualizados");
        onRefresh();
      } else {
        toast.error(res.error || "Error al actualizar detalles");
        // Revertir a lo que tiene el servicio
        setDuracion(service.duracionPactadaHoras.toString());
        setPrecio(service.precioBaseHoraPactado.toString());
      }
    }
  };

  const handleChangePago = async (val: string) => {
    setMetodoPago(val as any);
    if (val !== service.metodoPago) {
      setIsSaving(true);
      const res = await updateServiceAction(service.id, {
        metodoPago: val as any,
      });
      setIsSaving(false);
      if (res.success) {
        toast.success("Método de pago actualizado");
        onRefresh();
      } else {
        toast.error(res.error || "Error al actualizar método de pago");
        setMetodoPago(service.metodoPago);
      }
    }
  };

  const handleBlurFecha = async () => {
    if (service.tipoAgenda !== "programado") return;
    
    const nuevaFecha = desdeHoraDelNegocio(fecha);
    const nuevaFechaISO = nuevaFecha ? nuevaFecha.toISOString() : null;
    const fechaActualISO = service.fechaProgramada
      ? new Date(service.fechaProgramada).toISOString()
      : null;

    if (nuevaFechaISO !== fechaActualISO) {
      if (!nuevaFecha || nuevaFecha.getTime() <= Date.now()) {
        toast.error("La nueva hora tiene que estar en el futuro");
        // Revertir
        setFecha(
          paraInputDeFechaHora(
            service.fechaProgramada
              ? new Date(service.fechaProgramada)
              : new Date(Date.now() + 60 * 60_000)
          )
        );
      } else {
        setIsSaving(true);
        const res = await rescheduleServiceAction(service.id, nuevaFecha.toISOString(), false);
        setIsSaving(false);
        if (res.success) {
          toast.success("Fecha y hora actualizadas");
          onRefresh();
        } else {
          toast.error(res.error || "Error al reprogramar la fecha");
          setFecha(
            paraInputDeFechaHora(
              service.fechaProgramada
                ? new Date(service.fechaProgramada)
                : new Date(Date.now() + 60 * 60_000)
            )
          );
        }
      }
    }
  };

  const ubicacionTexto =
    service.locationNameSnapshot || service.locationAddressSnapshot || "Sin ubicación";

  return (
    <div className="space-y-4 relative">
      {/* Loading overlay for quick auto-saves */}
      {isSaving && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 rounded-xl backdrop-blur-[1px]">
          <Loader2 className="animate-spin text-[#C5A55A]" />
        </div>
      )}

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
            className="text-xs font-medium text-[#C5A55A] hover:text-[#d8b769] transition-colors whitespace-nowrap bg-[#C5A55A]/10 px-2 py-1 rounded-lg cursor-pointer"
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
            onBlur={handleBlurText}
            className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A] transition-colors"
          />
        </div>

        {/* Precio por hora */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A55A] flex items-center gap-1.5">
            <DollarSign size={12} />
            Precio x Hora
          </label>
          <input
            type="number"
            step="100"
            min="0"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            onBlur={handleBlurText}
            className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A] transition-colors"
          />
        </div>
      </div>

      {/* Método de Pago */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A55A] flex items-center gap-1.5">
          <CreditCard size={12} />
          Método de Pago
        </label>
        <select
          value={metodoPago}
          onChange={(e) => handleChangePago(e.target.value)}
          className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A] transition-colors appearance-none cursor-pointer"
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="mixto">Mixto</option>
        </select>
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
            onBlur={handleBlurFecha}
            className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A] transition-colors cursor-pointer"
          />
        </div>
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
