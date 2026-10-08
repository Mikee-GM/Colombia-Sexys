"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  updateJefeBookingDraft,
  acceptJefeBookingDraft,
} from "@/lib/actions/jefe-panel";
import type { CancellationReason } from "@/lib/cancellation-reasons";
import type { Employee, Service } from "@/lib/types";
import type { JefeConversation } from "./today-model";
import {
  canAssignTransport,
  canBossAuthorizeService,
  operationStateForService,
} from "./today-model";
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
  onTakeover,
}: {
  conversation: JefeConversation | null;
  employees: Employee[];
  onClose?: () => void;
  onRefresh: () => Promise<void>;
  onTakeover?: () => Promise<void> | void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pending, startTransition] = useTransition();
  const draftDirtyRef = useRef(false);
  const draftSessionRef = useRef<string | null>(null);
  const draft = conversation?.bookingDraft;
  const [draftForm, setDraftForm] = useState({
    employeeId: "",
    durationHours: "",
    locationName: "",
    locationAddress: "",
    locationNotes: "",
    locationLat: "",
    locationLng: "",
    paymentMethod: "",
    bossNotes: "",
  });

  useEffect(() => {
    if (!conversation || conversation.service) return;
    if (
      draftDirtyRef.current &&
      draftSessionRef.current === conversation.bookingSessionId
    ) {
      return;
    }
    const booking = conversation.bookingData;
    draftSessionRef.current = conversation.bookingSessionId;
    draftDirtyRef.current = false;
    setDraftForm({
      employeeId: conversation.employeeId,
      durationHours:
        booking?.durationHours != null ? String(booking.durationHours) : "",
      locationName: booking?.locationName ?? "",
      locationAddress: booking?.locationAddress ?? "",
      locationNotes: booking?.locationNotes ?? "",
      locationLat:
        booking?.locationLat != null ? String(booking.locationLat) : "",
      locationLng:
        booking?.locationLng != null ? String(booking.locationLng) : "",
      paymentMethod: booking?.paymentMethod ?? "",
      bossNotes: conversation.bookingDraft?.bossNotes ?? "",
    });
  }, [
    conversation,
    conversation?.id,
    conversation?.bookingSessionId,
    conversation?.bookingData,
    conversation?.bookingDraft?.bossNotes,
    conversation?.employeeId,
  ]);

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
    const editable = conversation.mode === "HUMAN_ACTIVE";
    const draftReady =
      draft?.status === "READY" || booking?.status === "READY";
    const formComplete = Boolean(
      draftForm.employeeId &&
        draftForm.durationHours &&
        draftForm.locationLat &&
        draftForm.locationLng &&
        draftForm.paymentMethod,
    );
    const updateDraftField = <K extends keyof typeof draftForm>(
      field: K,
      value: (typeof draftForm)[K],
    ) => {
      draftDirtyRef.current = true;
      setDraftForm((current) => ({ ...current, [field]: value }));
    };
    const draftPatch = () => ({
      intendedEmployeeId: draftForm.employeeId || undefined,
      durationHours: draftForm.durationHours
        ? Number(draftForm.durationHours)
        : undefined,
      locationName: draftForm.locationName || undefined,
      locationAddress: draftForm.locationAddress || undefined,
      locationNotes: draftForm.locationNotes || undefined,
      bossNotes: draftForm.bossNotes || undefined,
      locationLat: draftForm.locationLat
        ? Number(draftForm.locationLat)
        : undefined,
      locationLng: draftForm.locationLng
        ? Number(draftForm.locationLng)
        : undefined,
      paymentMethod: draftForm.paymentMethod || undefined,
    });
    const saveDraft = () => {
      if (!conversation.bookingSessionId) return;
      if (!editable) return;
      startTransition(async () => {
        const result = await updateJefeBookingDraft({
          bookingSessionId: conversation.bookingSessionId!,
          patch: draftPatch(),
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        draftDirtyRef.current = false;
        toast.success("Borrador actualizado");
        await onRefresh();
      });
    };

    const acceptDraft = () => {
      if (!conversation.bookingSessionId) return;
      if (!editable || !formComplete) return;
      startTransition(async () => {
        const saved = await updateJefeBookingDraft({
          bookingSessionId: conversation.bookingSessionId!,
          patch: draftPatch(),
        });
        if (!saved.success) {
          toast.error(saved.error);
          return;
        }
        draftDirtyRef.current = false;
        const result = await acceptJefeBookingDraft(
          conversation.bookingSessionId!,
        );
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Servicio confirmado y enviado a la empleada");
        await onRefresh();
      });
    };

    return (
      <aside className="flex h-full min-h-0 flex-col bg-black">
        <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b border-zinc-800 bg-black px-3 py-2.5">
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
          {!editable && (
            <section className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
              <p className="text-xs font-semibold text-sky-200">Control IA activo</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Toma la conversación para editar la reserva y confirmarla.
              </p>
              <button
                type="button"
                onClick={() => void onTakeover?.()}
                disabled={!onTakeover || pending}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-sky-400/50 px-3 text-xs font-bold uppercase tracking-wider text-sky-200 disabled:opacity-50"
              >
                TOMAR CONVERSACIÓN
              </button>
            </section>
          )}
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
          <section className="mt-4 space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Datos de la reserva
            </p>
            <label className="block text-xs text-zinc-500">
              Empleada
              <select
                value={draftForm.employeeId}
                onChange={(event) => updateDraftField("employeeId", event.target.value)}
                disabled={!editable}
                className="mt-1 h-10 w-full rounded border border-zinc-700 bg-black px-2 text-sm text-white"
              >
                <option value="">Selecciona una empleada</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.nombreArtistico}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              Duración (horas)
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={draftForm.durationHours}
                onChange={(event) => updateDraftField("durationHours", event.target.value)}
                disabled={!editable}
                className="mt-1 h-10 w-full rounded border border-zinc-700 bg-black px-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Lugar / nombre
              <input
                value={draftForm.locationName}
                onChange={(event) => updateDraftField("locationName", event.target.value)}
                disabled={!editable}
                className="mt-1 h-10 w-full rounded border border-zinc-700 bg-black px-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Dirección
              <input
                value={draftForm.locationAddress}
                onChange={(event) => updateDraftField("locationAddress", event.target.value)}
                disabled={!editable}
                className="mt-1 h-10 w-full rounded border border-zinc-700 bg-black px-2 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Pago
              <select
                value={draftForm.paymentMethod}
                onChange={(event) => updateDraftField("paymentMethod", event.target.value)}
                disabled={!editable}
                className="mt-1 h-10 w-full rounded border border-zinc-700 bg-black px-2 text-sm capitalize text-white"
              >
                <option value="">Selecciona un método</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
                <option value="mixto">Mixto</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              Notas para la empleada (opcionales)
              <textarea
                value={draftForm.bossNotes}
                onChange={(event) => updateDraftField("bossNotes", event.target.value)}
                maxLength={2000}
                rows={3}
                disabled={!editable}
                placeholder="Indicaciones operativas para la empleada"
                className="mt-1 min-h-20 w-full resize-none rounded border border-zinc-700 bg-black px-2 py-2 text-sm text-white disabled:opacity-60"
              />
            </label>
            <details className="rounded border border-zinc-800 px-2 py-1">
              <summary className="cursor-pointer py-1 text-xs text-zinc-500">Coordenadas avanzadas</summary>
            <div className="grid grid-cols-2 gap-2 pb-2 pt-2">
              <label className="block text-xs text-zinc-500">
                Latitud
                <input
                  type="number"
                  step="any"
                  value={draftForm.locationLat}
                  onChange={(event) => updateDraftField("locationLat", event.target.value)}
                  disabled={!editable}
                  className="mt-1 h-10 w-full rounded border border-zinc-700 bg-black px-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Longitud
                <input
                  type="number"
                  step="any"
                  value={draftForm.locationLng}
                  onChange={(event) => updateDraftField("locationLng", event.target.value)}
                  disabled={!editable}
                  className="mt-1 h-10 w-full rounded border border-zinc-700 bg-black px-2 text-sm text-white"
                />
              </label>
            </div>
            </details>
            <div className="sticky bottom-0 flex gap-2 border-t border-zinc-800 bg-zinc-950 py-3">
              <button
                type="button"
                onClick={saveDraft}
                disabled={pending || !editable}
                className="h-10 flex-1 rounded border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 disabled:opacity-50"
              >
                Guardar cambios
              </button>
              <button
                type="button"
                onClick={acceptDraft}
                disabled={pending || !editable || !draftReady || !formComplete}
                className="h-10 flex-1 rounded bg-[#C5A55A] px-3 text-xs font-bold text-black disabled:opacity-50"
              >
                CONFIRMAR Y ENVIAR A EMPLEADA
              </button>
            </div>
          </section>
        </div>
      </aside>
    );
  }
  const serviceId = service.id;
  const state = operationStateForService(service);
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
      <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b border-zinc-800 bg-black px-3 py-2.5">
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
          {canBossAuthorizeService(service) ? (
            <button
              type="button"
              onClick={() => setAccepting(true)}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-[#C5A55A] px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-black"
            >
              CONFIRMAR Y ENVIAR A EMPLEADA
            </button>
          ) : canAssignTransport(service) ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-lg border border-[#C5A55A] px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#C5A55A]"
            >
              ASIGNAR TRANSPORTE
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
              {canBossAuthorizeService(service) && (
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

            {(canManageTransport ||
              service.viajes?.length ||
              service.estadoLiquidacion === "transporte_pendiente") && (
              <TransportPanel service={service} onRefresh={onRefresh} />
            )}
          </div>
        )}
      </div>

      {accepting && canBossAuthorizeService(service) && (
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
