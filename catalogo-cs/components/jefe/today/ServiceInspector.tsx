"use client";

import { useState, useTransition } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Car,
  ChevronDown,
  ChevronUp,
  MapPin,
  Pencil,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import CancelServiceDialog from "@/components/services/cancel-service-dialog";
import CerrarPorOficina from "@/components/services/cerrar-por-oficina";
import ManualServiceControls from "@/components/jefe/ManualServiceControls";
import ReasignarModelo from "@/components/services/reasignar-modelo";
import ServiceLocationDialog from "@/components/services/service-location-dialog";
import ServiceRescheduleDialog from "@/components/services/service-reschedule-dialog";
import {
  AcceptServiceDialog,
  EditPendingServiceDialog,
  TransportPanel,
} from "@/components/jefe/TeamOperations";
import {
  cancelJefeService,
  cerrarServicioPorOficina,
  decidePendingService,
  reasignarEmpleadaDeServicio,
} from "@/lib/actions/jefe-panel";
import type { CancellationReason } from "@/lib/cancellation-reasons";
import type { Employee, Service } from "@/lib/types";
import type { JefeConversation } from "./today-model";
import { legacyOperationState } from "./today-model";
import ServiceStateSummary from "./ServiceStateSummary";

function paymentLabel(value: Service["metodoPago"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function transportLabel(service: Service) {
  const trips = service.viajes ?? [];
  const current = [...trips]
    .reverse()
    .find(
      (trip) => !["finalizado", "cancelado", "rechazado"].includes(trip.estado),
    );
  if (!current) return "Sin traslado activo";
  return `${current.tipo === "ida" ? "Ida" : "Regreso"} · ${current.proveedorTransporte} · ${current.estado.replaceAll("_", " ")}`;
}

export default function ServiceInspector({
  conversation,
  employees,
  onClose,
  onRefresh,
}: {
  conversation: JefeConversation | null;
  employees: Employee[];
  onClose?: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!conversation) {
    return (
      <aside className="flex h-full items-center justify-center bg-black px-6 text-center text-sm text-zinc-600">
        Selecciona una conversación para ver el contexto operacional.
      </aside>
    );
  }

  const service = conversation.service;
  if (!service) {
    const booking = conversation.bookingData;
    const location =
      booking?.locationName ??
      booking?.locationAddress ??
      booking?.locationNotes ??
      null;
    return (
      <aside className="flex h-full min-h-0 flex-col bg-black">
        <header className="flex min-h-16 items-center gap-3 border-b border-zinc-800 px-3 py-2.5">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 xl:hidden"
              aria-label="Volver al chat"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
              Conversación previa
            </p>
            <h2 className="truncate text-sm font-semibold text-white">
              {conversation.employeeName}
            </h2>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          <section className="rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/5 p-3">
            <p className="text-xs font-semibold text-[#E8D5A3]">
              Servicio todavía no creado
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              La conversación ya pertenece a esta empleada. Los datos aparecen
              aquí conforme el cliente avanza en la reserva.
            </p>
          </section>
          <dl className="mt-4 divide-y divide-zinc-900 border-y border-zinc-900">
            <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
              <dt className="flex items-center gap-1.5 text-zinc-600">
                <UserRound size={13} /> Cliente
              </dt>
              <dd className="text-right font-medium text-zinc-200">
                {conversation.clientName}
              </dd>
            </div>
            {booking?.durationHours != null && (
              <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
                <dt className="text-zinc-600">Duración</dt>
                <dd className="text-right font-medium text-zinc-200">
                  {booking.durationHours} h
                </dd>
              </div>
            )}
            {booking?.openEndedDuration && booking.durationHours == null && (
              <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
                <dt className="text-zinc-600">Duración</dt>
                <dd className="text-right font-medium text-zinc-200">
                  Por definir
                </dd>
              </div>
            )}
            {location && (
              <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
                <dt className="flex items-center gap-1.5 text-zinc-600">
                  <MapPin size={13} /> Lugar
                </dt>
                <dd className="text-right font-medium leading-relaxed text-zinc-200">
                  {location}
                </dd>
              </div>
            )}
            {booking?.paymentMethod && (
              <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
                <dt className="text-zinc-600">Pago</dt>
                <dd className="text-right font-medium capitalize text-zinc-200">
                  {booking.paymentMethod.replaceAll("_", " ")}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </aside>
    );
  }
  const serviceId = service.id;
  const state = service.operationalState ?? legacyOperationState(service);
  const previousService = conversation.relatedServices.find(
    (item) => item.id === service.servicioPrevioId,
  );
  const canManageTransport = [
    "aceptado",
    "esperando_transporte_ida",
    "transporte_ida_asignado",
    "empleada_en_camino",
    "preparando_regreso",
    "transporte_regreso_asignado",
    "empleada_de_regreso",
  ].includes(state);

  function accept(transport: "chofer" | "uber", notes?: string) {
    startTransition(async () => {
      const result = await decidePendingService(
        serviceId,
        "aceptar",
        transport,
        notes,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setAccepting(false);
      toast.success("Servicio autorizado");
      await onRefresh();
    });
  }

  function cancel(reason: CancellationReason, note: string) {
    startTransition(async () => {
      const result = await cancelJefeService(serviceId, reason, note);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setCancelling(false);
      toast.success("Servicio cancelado");
      await onRefresh();
    });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-black">
      <header className="flex min-h-16 items-center gap-3 border-b border-zinc-800 px-3 py-2.5">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 xl:hidden"
            aria-label="Volver al chat"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
            Servicio
          </p>
          <h2 className="truncate text-sm font-semibold text-white">
            {service.empleada?.nombreArtistico || conversation.employeeName}
          </h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900 lg:flex xl:hidden"
            aria-label="Cerrar inspector"
          >
            <X size={16} />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
        <ServiceStateSummary service={service} />

        <dl className="mt-4 divide-y divide-zinc-900 border-y border-zinc-900">
          <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
            <dt className="flex items-center gap-1.5 text-zinc-600">
              <UserRound size={13} /> Cliente
            </dt>
            <dd className="text-right font-medium text-zinc-200">
              {conversation.clientName}
            </dd>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
            <dt className="text-zinc-600">Duración</dt>
            <dd className="text-right font-medium text-zinc-200">
              {service.duracionPactadaHoras} h
            </dd>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
            <dt className="flex items-center gap-1.5 text-zinc-600">
              <MapPin size={13} /> Lugar
            </dt>
            <dd className="text-right font-medium leading-relaxed text-zinc-200">
              {service.locationNameSnapshot ||
                service.locationAddressSnapshot ||
                "Ubicación compartida"}
              {service.habitacion ? ` · Habitación ${service.habitacion}` : ""}
            </dd>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
            <dt className="text-zinc-600">Pago</dt>
            <dd className="text-right font-medium text-zinc-200">
              {paymentLabel(service.metodoPago)}
            </dd>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-3 py-3 text-xs">
            <dt className="flex items-center gap-1.5 text-zinc-600">
              <Car size={13} /> Transporte
            </dt>
            <dd className="text-right font-medium capitalize text-zinc-200">
              {transportLabel(service)}
            </dd>
          </div>
        </dl>

        <section className="mt-4 border-l-2 border-[#C5A55A] pl-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#C5A55A]">
            Siguiente acción
          </p>
          {service.estado === "pendiente" ? (
            <button
              type="button"
              onClick={() => setAccepting(true)}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-[#C5A55A] px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-black"
            >
              Revisar y autorizar
            </button>
          ) : canManageTransport ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-lg border border-[#C5A55A] px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#C5A55A]"
            >
              Gestionar transporte
            </button>
          ) : state === "esperando_aceptacion_empleada" ? (
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
              Esperar la decisión de la empleada. No hay una acción válida para
              el jefe ahora.
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
              Supervisa el servicio. Los controles excepcionales están en Más
              acciones.
            </p>
          )}
        </section>

        <button
          type="button"
          onClick={() => setMoreOpen((current) => !current)}
          aria-expanded={moreOpen}
          className="mt-5 flex h-10 w-full items-center justify-between border-y border-zinc-900 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-200"
        >
          Más acciones
          {moreOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {moreOpen && (
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-2">
              {service.estado === "pendiente" && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white"
                >
                  <Pencil size={14} /> Editar
                </button>
              )}
              {service.estado !== "en_curso" && (
                <button
                  type="button"
                  onClick={() => setRescheduling(true)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white"
                >
                  <CalendarClock size={14} /> Reprogramar
                </button>
              )}
              <button
                type="button"
                onClick={() => setRelocating(true)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white"
              >
                <MapPin size={14} /> Ubicación
              </button>
              {!["finalizado", "cancelado"].includes(service.estado) && (
                <button
                  type="button"
                  onClick={() => setCancelling(true)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-900/50 text-xs text-red-400"
                >
                  <X size={14} /> Cancelar
                </button>
              )}
            </div>

            {["pendiente", "agendado", "en_curso"].includes(service.estado) && (
              <ReasignarModelo
                servicioId={service.id}
                empleadaActualId={service.empleadaId}
                modelos={employees}
                reasignar={reasignarEmpleadaDeServicio}
                onReasignado={onRefresh}
              />
            )}

            <ManualServiceControls service={service} onRefresh={onRefresh} />

            {service.estado === "en_curso" && (
              <CerrarPorOficina
                servicioId={service.id}
                cerrar={cerrarServicioPorOficina}
              />
            )}

            {(service.viajes?.length ||
              service.estadoLiquidacion === "transporte_pendiente") && (
              <TransportPanel service={service} onRefresh={onRefresh} />
            )}
          </div>
        )}
      </div>

      {accepting && (
        <AcceptServiceDialog
          service={service}
          previousService={previousService}
          disabled={pending}
          onClose={() => setAccepting(false)}
          onAccept={accept}
        />
      )}
      {editing && (
        <EditPendingServiceDialog
          service={service}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await onRefresh();
          }}
        />
      )}
      {rescheduling && (
        <ServiceRescheduleDialog
          serviceId={service.id}
          fechaActual={service.fechaProgramada ?? null}
          nombreEmpleada={service.empleada?.nombreArtistico || "Este servicio"}
          onClose={() => setRescheduling(false)}
          onRescheduled={onRefresh}
        />
      )}
      {relocating && (
        <ServiceLocationDialog
          serviceId={service.id}
          ubicacionActual={
            service.locationNameSnapshot ??
            service.locationAddressSnapshot ??
            null
          }
          latitudActual={
            service.ubicacionClienteLat != null
              ? Number(service.ubicacionClienteLat)
              : null
          }
          longitudActual={
            service.ubicacionClienteLng != null
              ? Number(service.ubicacionClienteLng)
              : null
          }
          presetLocationIdActual={service.presetLocationId ?? null}
          onClose={() => setRelocating(false)}
          onChanged={onRefresh}
        />
      )}
      {cancelling && (
        <CancelServiceDialog
          serviceLabel={service.empleada?.nombreArtistico || "este servicio"}
          disabled={pending}
          onConfirm={cancel}
          onCancel={() => setCancelling(false)}
        />
      )}
    </aside>
  );
}
