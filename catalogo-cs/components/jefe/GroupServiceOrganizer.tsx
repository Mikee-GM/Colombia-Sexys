"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Ban, Car, Clock3, ExternalLink, FileCheck2, ImageIcon, MapPin, Plus, Send, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  addGroupManualTransportCharge,
  addGroupParticipant,
  cancelGroupRequest,
  cancelGroupService,
  changeGroupDuration,
  changeGroupResponsible,
  configureGroupTransports,
  confirmGroupQuote,
  extendGroupHold,
  getGroupCandidates,
  getGroupRequestMessages,
  getGroupServiceRequests,
  removeGroupParticipant,
  requestGroupLocation,
  reserveGroupEmployees,
  sendGroupCatalog,
  sendGroupRequestMessage,
  startGroupService,
  updateGroupRequest,
  type GroupTransportUnitInput,
} from "@/lib/actions/jefe-panel";
import type { ConversationMessage, Employee, GroupServiceRequest } from "@/lib/types";

const LocationMap = dynamic(
  () => import("@/components/admin/transport-location-map"),
  { ssr: false },
);

const inputClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#C5A55A]";
const buttonClass =
  "rounded-xl border border-[#C5A55A] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#C5A55A] disabled:opacity-40";
const clientActionButtonClass =
  "flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black shadow-[0_0_24px_rgba(197,165,90,0.12)] transition hover:bg-[#D8BA72] disabled:opacity-40";

export default function GroupServiceOrganizer({
  initialRequests,
}: {
  initialRequests: GroupServiceRequest[];
}) {
  const visibleInitialRequests = initialRequests.filter(
    (item) => item.status !== "cancelada" && item.service?.estado !== "cancelado",
  );
  const [requests, setRequests] = useState(visibleInitialRequests);
  const [selectedId, setSelectedId] = useState(visibleInitialRequests[0]?.id ?? "");
  const [candidates, setCandidates] = useState<Employee[]>([]);
  const [pending, startTransition] = useTransition();
  const selected = requests.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    const visible = initialRequests.filter(
      (item) => item.status !== "cancelada" && item.service?.estado !== "cancelado",
    );
    setRequests(visible);
    setSelectedId((current) =>
      visible.some((item) => item.id === current)
        ? current
        : visible[0]?.id ?? "",
    );
  }, [initialRequests]);

  async function reload(preferredId?: string) {
    const next = (await getGroupServiceRequests()).filter(
      (item) => item.status !== "cancelada" && item.service?.estado !== "cancelado",
    );
    setRequests(next);
    if (preferredId && next.some((item) => item.id === preferredId))
      setSelectedId(preferredId);
    else if (!next.some((item) => item.id === selectedId))
      setSelectedId(next[0]?.id ?? "");
  }

  useEffect(() => {
    void getGroupCandidates()
      .then(setCandidates)
      .catch(() => toast.error("No se pudieron cargar las empleadas disponibles"));
  }, []);

  function run(
    action: () => Promise<{ success: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await reload(selectedId);
      setCandidates(await getGroupCandidates());
      toast.success(success);
    });
  }

  return (
    <section className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
            Solicitudes grupales
          </p>
          <h2 className="mt-1 font-heading text-3xl">{requests.length}</h2>
        </header>
        {requests.map((request) => (
          <button
            key={request.id}
            type="button"
            onClick={() => setSelectedId(request.id)}
            className={`w-full rounded-2xl border p-4 text-left ${
              request.id === selectedId
                ? "border-[#C5A55A] bg-[#C5A55A]/5"
                : "border-zinc-800 bg-zinc-950"
            }`}
          >
            <p className="font-heading text-xl text-white">
              {request.client?.nombreTelegram || "Cliente"}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{request.status.replaceAll("_", " ")}</span>
              <span>{activeSelectionIds(request).length} seleccionadas</span>
            </div>
          </button>
        ))}
        {!requests.length && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
            No hay solicitudes grupales.
          </div>
        )}
      </aside>
      {selected ? (
        <GroupRequestEditor
          key={selected.id}
          request={selected}
          candidates={candidates}
          pending={pending}
          run={run}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center text-sm text-zinc-500">
          Selecciona una solicitud para organizarla.
        </div>
      )}
    </section>
  );
}

function GroupRequestEditor({
  request,
  candidates,
  pending,
  run,
}: {
  request: GroupServiceRequest;
  candidates: Employee[];
  pending: boolean;
  run: (
    action: () => Promise<{ success: boolean; error?: string }>,
    success: string,
  ) => void;
}) {
  const initialIds = activeSelectionIds(request);
  const [employeeIds, setEmployeeIds] = useState<string[]>(initialIds);
  const [responsibleId, setResponsibleId] = useState(
    request.service?.participantes?.find((item) => item.role === "responsable")
      ?.employeeId ??
      initialIds[0] ??
      "",
  );
  const [duration, setDuration] = useState(
    String(request.service?.duracionPactadaHoras ?? request.durationHours ?? 1),
  );
  const [paymentMethod, setPaymentMethod] = useState<
    "efectivo" | "tarjeta" | "transferencia" | "mixto"
  >(request.paymentMethod ?? "transferencia");
  const [latitude, setLatitude] = useState(
    Number(request.locationLat ?? 19.432608),
  );
  const [longitude, setLongitude] = useState(
    Number(request.locationLng ?? -99.133209),
  );
  const [reference, setReference] = useState(
    request.locationReference ?? "",
  );
  const [units, setUnits] = useState<GroupTransportUnitInput[]>(() => [
    {
      unitNumber: 1,
      direction: "ida",
      provider: "chofer",
      employeeIds: initialIds,
    },
  ]);

  useEffect(() => {
    if (request.locationLat !== null && request.locationLat !== undefined)
      setLatitude(Number(request.locationLat));
    if (request.locationLng !== null && request.locationLng !== undefined)
      setLongitude(Number(request.locationLng));
    setReference(request.locationReference ?? "");
  }, [
    request.locationLat,
    request.locationLng,
    request.locationReference,
  ]);

  useEffect(() => {
    const onRealtimeEvent = (event: Event) => {
      const payload = (event as CustomEvent<{
        type?: string;
        data?: {
          requestId?: string;
          latitude?: number;
          longitude?: number;
        };
      }>).detail;
      if (
        payload?.type !== "group_location_received" ||
        payload.data?.requestId !== request.id
      )
        return;
      if (payload.data.latitude !== undefined)
        setLatitude(Number(payload.data.latitude));
      if (payload.data.longitude !== undefined)
        setLongitude(Number(payload.data.longitude));
      toast.success("Ubicación del cliente recibida");
    };
    window.addEventListener("jefe-realtime-event", onRealtimeEvent);
    return () =>
      window.removeEventListener("jefe-realtime-event", onRealtimeEvent);
  }, [request.id]);

  const allEmployees = useMemo(() => {
    const related =
      request.selections.map((selection) => selection.employee).filter(Boolean) as Employee[];
    const participantEmployees =
      request.service?.participantes
        ?.map((participant) => participant.employee)
        .filter(Boolean) as Employee[] | undefined;
    return [...related, ...(participantEmployees ?? []), ...candidates].filter(
      (employee, index, rows) =>
        rows.findIndex((item) => item.id === employee.id) === index,
    );
  }, [request, candidates]);

  function toggleEmployee(employeeId: string) {
    setEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  }

  function addUnit() {
    const nextNumber =
      Math.max(0, ...units.filter((unit) => unit.direction === "ida").map((unit) => unit.unitNumber)) + 1;
    setUnits((current) => [
      ...current,
      {
        unitNumber: nextNumber,
        direction: "ida",
        provider: "chofer",
        employeeIds: [],
      },
    ]);
  }

  function togglePassenger(unitNumber: number, employeeId: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.direction === "ida" && unit.unitNumber === unitNumber
          ? {
              ...unit,
              employeeIds: unit.employeeIds.includes(employeeId)
                ? unit.employeeIds.filter((id) => id !== employeeId)
                : [...unit.employeeIds, employeeId],
            }
          : unit,
      ),
    );
  }

  const service = request.service;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
              Organizador grupal
            </p>
            <h2 className="mt-1 font-heading text-3xl">
              {request.client?.nombreTelegram || "Cliente"}
            </h2>
          </div>
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs uppercase text-zinc-400">
            {request.status.replaceAll("_", " ")}
          </span>
        </div>
        {request.holdExpiresAt && (
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <Clock3 size={14} />
            Reserva hasta{" "}
            {new Date(request.holdExpiresAt).toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
      {!service ? (
        <>
          <section className="rounded-2xl border border-[#C5A55A]/45 bg-gradient-to-br from-[#C5A55A]/10 to-zinc-950 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-[#C5A55A]/15 p-2.5 text-[#E8D5A3]">
                <Send size={19} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
                  Acciones hacia Telegram
                </p>
                <h3 className="mt-1 font-heading text-2xl">
                  Comunicación con el cliente
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Estas opciones enviarán inmediatamente un mensaje al cliente.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                className={clientActionButtonClass}
                disabled={pending}
                onClick={() =>
                  run(
                    () => requestGroupLocation(request.id),
                    "Solicitud de ubicación enviada",
                  )
                }
              >
                <MapPin size={16} />
                Pedir pin de ubicación
              </button>
              <button
                className={clientActionButtonClass}
                disabled={pending}
                onClick={() =>
                  run(
                    () => sendGroupCatalog(request.id),
                    "Catálogo enviado",
                  )
                }
              >
                <Send size={16} />
                Enviar catálogo
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
            <h3 className="font-heading text-2xl">Datos y ubicación</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-500">
                Horas comunes
                <input
                  className={`${inputClass} mt-2`}
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </label>
              <label className="text-xs text-zinc-500">
                Método de pago
                <select
                  className={`${inputClass} mt-2`}
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as typeof paymentMethod)
                  }
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="mixto">Mixto</option>
                </select>
              </label>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800">
              <LocationMap
                latitude={latitude}
                longitude={longitude}
                onChange={(lat, lng) => {
                  setLatitude(lat);
                  setLongitude(lng);
                }}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                className={inputClass}
                value={latitude}
                onChange={(event) => setLatitude(Number(event.target.value))}
                aria-label="Latitud"
              />
              <input
                className={inputClass}
                value={longitude}
                onChange={(event) => setLongitude(Number(event.target.value))}
                aria-label="Longitud"
              />
            </div>
            <input
              className={`${inputClass} mt-3`}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Referencia de ubicación"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={buttonClass}
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      updateGroupRequest(request.id, {
                        durationHours: Number(duration),
                        paymentMethod,
                        locationLat: latitude,
                        locationLng: longitude,
                        locationReference: reference,
                      }),
                    "Datos guardados",
                  )
                }
              >
                Guardar datos
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-heading text-2xl">Participantes</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Disponibles en toda la agencia
                </p>
              </div>
              <UsersRound className="text-[#C5A55A]" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {allEmployees.map((employee) => (
                <label
                  key={employee.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-800 bg-black p-3"
                >
                  <input
                    type="checkbox"
                    checked={employeeIds.includes(employee.id)}
                    onChange={() => toggleEmployee(employee.id)}
                    className="accent-[#C5A55A]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">
                      {employee.nombreArtistico}
                    </span>
                    <span className="text-xs text-zinc-500">
                      ${Number(employee.precioBaseHora).toFixed(2)} por hora
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={buttonClass}
                disabled={pending || employeeIds.length < 2}
                onClick={() =>
                  run(
                    () => reserveGroupEmployees(request.id, employeeIds),
                    "Lista reservada",
                  )
                }
              >
                Guardar lista
              </button>
              <button
                className={buttonClass}
                disabled={pending}
                onClick={() =>
                  run(
                    () => extendGroupHold(request.id),
                    "Reserva extendida por 30 minutos",
                  )
                }
              >
                Extender reserva
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
            <h3 className="font-heading text-2xl">Responsable y transporte</h3>
            <select
              className={`${inputClass} mt-4`}
              value={responsibleId}
              onChange={(event) => setResponsibleId(event.target.value)}
            >
              <option value="">Selecciona responsable</option>
              {allEmployees
                .filter((employee) => employeeIds.includes(employee.id))
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.nombreArtistico}
                  </option>
                ))}
            </select>
            <div className="mt-4 space-y-3">
              {units.map((unit) => (
                <article
                  key={`${unit.direction}-${unit.unitNumber}`}
                  className="rounded-xl border border-zinc-800 bg-black p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">
                      Unidad de ida {unit.unitNumber}
                    </p>
                    <div className="flex gap-2">
                      <select
                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs"
                        value={unit.provider}
                        onChange={(event) =>
                          setUnits((current) =>
                            current.map((item) =>
                              item === unit
                                ? {
                                    ...item,
                                    provider: event.target.value as
                                      | "chofer"
                                      | "uber",
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="chofer">Chofer</option>
                        <option value="uber">Uber</option>
                      </select>
                      {units.length > 1 && (
                        <button
                          type="button"
                          aria-label="Eliminar unidad"
                          onClick={() =>
                            setUnits((current) =>
                              current.filter((item) => item !== unit),
                            )
                          }
                          className="text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {allEmployees
                      .filter((employee) => employeeIds.includes(employee.id))
                      .map((employee) => (
                        <label
                          key={employee.id}
                          className="flex items-center gap-2 rounded-lg border border-zinc-800 px-2 py-2 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={unit.employeeIds.includes(employee.id)}
                            onChange={() =>
                              togglePassenger(unit.unitNumber, employee.id)
                            }
                            className="accent-[#C5A55A]"
                          />
                          {employee.nombreArtistico}
                        </label>
                      ))}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={buttonClass} onClick={addUnit}>
                <Plus size={14} className="mr-1 inline" />
                Agregar unidad
              </button>
              <button
                className="rounded-xl bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-40"
                disabled={
                  pending ||
                  employeeIds.length < 2 ||
                  !responsibleId ||
                  units.some((unit) => unit.employeeIds.length === 0)
                }
                onClick={() =>
                  run(
                    () =>
                      confirmGroupQuote(request.id, responsibleId, units),
                    "Cotización confirmada",
                  )
                }
              >
                Confirmar cotización
              </button>
            </div>
          </section>
        </>
      ) : (
        <ActiveGroupEditor
          request={request}
          candidates={candidates}
          duration={duration}
          setDuration={setDuration}
          pending={pending}
          run={run}
        />
      )}
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/80 bg-red-500/10 px-4 py-4 text-xs font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-40"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("¿Confirmas que deseas cancelar este servicio grupal? Se quitará del panel operativo.")) return;
            run(
              () => service ? cancelGroupService(service.id) : cancelGroupRequest(request.id),
              "Servicio grupal cancelado",
            );
          }}
        >
          <Ban size={17} />
          Cancelar servicio grupal
        </button>
        </div>
        <aside className="order-first xl:order-last xl:sticky xl:top-4">
          <GroupRequestChat requestId={request.id} />
        </aside>
      </div>
    </div>
  );
}

function GroupRequestChat({ requestId }: { requestId: string }) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const reconcile = () =>
      getGroupRequestMessages(requestId)
        .then((next) => {
          if (active) setMessages(next);
        })
        .catch(() => {
          if (active)
            toast.error("No se pudo cargar la conversación grupal");
        });
    const onRealtimeEvent = (event: Event) => {
      const payload = (event as CustomEvent<{
        type?: string;
        data?: ConversationMessage;
      }>).detail;
      setConnected(true);
      if (
        payload?.type !== "group_chat_message" ||
        payload.data?.groupRequestId !== requestId
      )
        return;
      setMessages((current) =>
        current.some((item) => item.id === payload.data!.id)
          ? current
          : [...current, payload.data!],
      );
    };
    const onOpen = () => {
      setConnected(true);
      void reconcile();
    };
    const onReconnecting = () => setConnected(false);

    void reconcile();
    window.addEventListener("jefe-realtime-event", onRealtimeEvent);
    window.addEventListener("jefe-realtime-open", onOpen);
    window.addEventListener(
      "jefe-realtime-reconnecting",
      onReconnecting,
    );
    return () => {
      active = false;
      window.removeEventListener("jefe-realtime-event", onRealtimeEvent);
      window.removeEventListener("jefe-realtime-open", onOpen);
      window.removeEventListener(
        "jefe-realtime-reconnecting",
        onReconnecting,
      );
    };
  }, [requestId]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  async function send() {
    const message = text.trim();
    if (!message) return;
    setSending(true);
    const result = await sendGroupRequestMessage(requestId, message);
    setSending(false);
    if (!result.success || !result.data) return toast.error(result.error);
    setMessages((current) =>
      current.some((item) => item.id === result.data!.id)
        ? current
        : [...current, result.data!],
    );
    setText("");
  }

  return (
    <section className="flex h-[min(72vh,720px)] min-h-[520px] flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-2xl">Conversación</h3>
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          {connected ? "En tiempo real" : "Reconectando"}
        </span>
      </div>
      <div
        ref={messagesContainerRef}
        className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-zinc-900 bg-black p-3"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              message.emisor === "cliente"
                ? "bg-zinc-900 text-zinc-200"
                : message.emisor === "jefe"
                  ? "ml-auto bg-[#C5A55A] text-black"
                  : "mx-auto border border-zinc-800 text-zinc-400"
            }`}
          >
            <p className="text-[9px] font-semibold uppercase opacity-60">
              {message.emisor}
            </p>
            <p className="whitespace-pre-wrap">{message.mensaje}</p>
          </div>
        ))}
        {!messages.length && (
          <p className="py-8 text-center text-xs text-zinc-600">
            Todavía no hay mensajes.
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <textarea
          className={`${inputClass} min-h-12 resize-none`}
          maxLength={4000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escribe al cliente"
        />
        <button
          type="button"
          disabled={sending || !text.trim()}
          onClick={() => void send()}
          className="rounded-xl bg-[#C5A55A] px-4 text-black disabled:opacity-40"
          aria-label="Enviar mensaje"
        >
          <Send size={17} />
        </button>
      </div>
    </section>
  );
}

function ActiveGroupEditor({
  request,
  candidates,
  duration,
  setDuration,
  pending,
  run,
}: {
  request: GroupServiceRequest;
  candidates: Employee[];
  duration: string;
  setDuration: (value: string) => void;
  pending: boolean;
  run: (
    action: () => Promise<{ success: boolean; error?: string }>,
    success: string,
  ) => void;
}) {
  const service = request.service!;
  const active = service.participantes?.filter(
    (item) => !["retirada", "cancelada"].includes(item.status),
  ) ?? [];
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [needsTransport, setNeedsTransport] = useState(true);
  const [provider, setProvider] = useState<"chofer" | "uber">("chofer");
  const [charge, setCharge] = useState("");
  const [chargeReason, setChargeReason] = useState("");
  const [returnUnits, setReturnUnits] = useState<GroupTransportUnitInput[]>(
    () => {
      const existing = (service.viajes ?? [])
        .filter((trip) => trip.tipo === "regreso")
        .map((trip) => ({
          unitNumber: trip.unitNumber ?? 1,
          direction: "regreso" as const,
          provider:
            trip.proveedorTransporte === "interno"
              ? ("chofer" as const)
              : ("uber" as const),
          employeeIds:
            trip.passengers?.map((passenger) => passenger.employeeId) ?? [],
        }));
      return existing.length
        ? existing
        : [{
            unitNumber: 1,
            direction: "regreso",
            provider: "chofer",
            employeeIds: active.map((item) => item.employeeId),
          }];
    },
  );
  const money = (value: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(value);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Base", money(Number(service.totalBase))],
          ["Transporte", money(Number(service.customerTransportCharge ?? 0))],
          ["Total", money(Number(service.totalFinal))],
          ["Saldo", money(Number(service.pendingBalance ?? 0))],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
          >
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {label}
            </p>
            <p className="mt-1 font-heading text-2xl text-[#E8D5A3]">
              {value}
            </p>
          </div>
        ))}
      </section>

      {((service.receiptValidations ?? []).some((item) => item.imageUrl) ||
        (service.viajes ?? []).some((trip) => trip.uberScreenshotUrl)) && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h3 className="font-heading text-2xl">Evidencias</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {(service.receiptValidations ?? []).filter((item) => item.imageUrl).map((receipt, index) => (
              <a key={receipt.id} href={receipt.imageUrl!} target="_blank" rel="noopener noreferrer" className={buttonClass}>
                <FileCheck2 size={14} className="mr-1 inline" />
                Comprobante {index + 1} · {(receipt.estado ?? "sin estado").replaceAll("_", " ")}
                <ExternalLink size={12} className="ml-1 inline" />
              </a>
            ))}
            {(service.viajes ?? []).filter((trip) => trip.uberScreenshotUrl).map((trip) => (
              <a key={trip.id} href={trip.uberScreenshotUrl!} target="_blank" rel="noopener noreferrer" className={buttonClass}>
                <ImageIcon size={14} className="mr-1 inline" />
                Uber de {trip.tipo}
                <ExternalLink size={12} className="ml-1 inline" />
              </a>
            ))}
          </div>
        </section>
      )}

      {service.estado === "pendiente" && (
        <button
          className="w-full rounded-xl bg-[#C5A55A] px-4 py-4 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-40"
          disabled={
            pending ||
            (service.metodoPago === "transferencia" &&
              Number(service.pendingBalance) > 0)
          }
          onClick={() =>
            run(
              () => startGroupService(service.id),
              "Servicio grupal iniciado",
            )
          }
        >
          Iniciar servicio grupal
        </button>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <h3 className="font-heading text-2xl">Plantilla activa</h3>
        <div className="mt-4 space-y-2">
          {active.map((participant) => (
            <div
              key={participant.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black p-3"
            >
              <div>
                <p className="text-sm text-white">
                  {participant.employee?.nombreArtistico || "Empleada"}
                </p>
                <p className="text-xs text-zinc-500">
                  {participant.role} · {participant.billableHours} horas ·{" "}
                  {money(Number(participant.confirmedSubtotal))}
                </p>
              </div>
              <div className="flex gap-2">
                {participant.role !== "responsable" && (
                  <>
                    <button
                      className={buttonClass}
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            changeGroupResponsible(
                              service.id,
                              participant.employeeId,
                            ),
                          "Responsable actualizada",
                        )
                      }
                    >
                      Hacer responsable
                    </button>
                    <button
                      className="rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-500 hover:border-red-900 hover:text-red-400"
                      disabled={pending}
                      onClick={() => {
                        const reason = window.prompt(
                          "Motivo para retirar a la empleada",
                        );
                        if (!reason) return;
                        const amount = window.prompt(
                          "Cargo manual de transporte, si aplica",
                          "0",
                        );
                        run(
                          () =>
                            removeGroupParticipant(
                              service.id,
                              participant.employeeId,
                              reason,
                              Number(amount || 0) || undefined,
                            ),
                          "Participante retirada",
                        );
                      }}
                    >
                      Retirar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h3 className="font-heading text-2xl">Horas comunes</h3>
          <div className="mt-4 flex gap-2">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
            <button
              className={buttonClass}
              disabled={pending}
              onClick={() =>
                run(
                  () => changeGroupDuration(service.id, Number(duration)),
                  "Duración actualizada",
                )
              }
            >
              Guardar
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h3 className="font-heading text-2xl">Agregar participante</h3>
          <select
            className={`${inputClass} mt-4`}
            value={newEmployeeId}
            onChange={(event) => setNewEmployeeId(event.target.value)}
          >
            <option value="">Selecciona empleada</option>
            {candidates
              .filter(
                (candidate) =>
                  !active.some(
                    (participant) => participant.employeeId === candidate.id,
                  ),
              )
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.nombreArtistico}
                </option>
              ))}
          </select>
          <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={needsTransport}
              onChange={(event) => setNeedsTransport(event.target.checked)}
              className="accent-[#C5A55A]"
            />
            Requiere una nueva unidad para llegar
          </label>
          {needsTransport && (
            <select
              className={`${inputClass} mt-3`}
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as "chofer" | "uber")
              }
            >
              <option value="chofer">Chofer</option>
              <option value="uber">Uber</option>
            </select>
          )}
          <button
            className={`${buttonClass} mt-3`}
            disabled={pending || !newEmployeeId}
            onClick={() =>
              run(
                () =>
                  addGroupParticipant(
                    service.id,
                    newEmployeeId,
                    needsTransport,
                    provider,
                  ),
                "Participante agregada",
              )
            }
          >
            <Plus size={14} className="mr-1 inline" />
            Agregar
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <h3 className="flex items-center gap-2 font-heading text-2xl">
          <Car size={20} className="text-[#C5A55A]" />
          Unidades de regreso
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Asigna cada participante a una unidad. Puedes combinar choferes y
          Ubers.
        </p>
        <div className="mt-4 space-y-3">
          {returnUnits.map((unit) => (
            <div key={unit.unitNumber} className="rounded-xl border border-zinc-800 bg-black p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#E8D5A3]">
                  Unidad {unit.unitNumber}
                </span>
                <select
                  className={`${inputClass} ml-auto max-w-36`}
                  value={unit.provider}
                  onChange={(event) =>
                    setReturnUnits((current) =>
                      current.map((item) =>
                        item.unitNumber === unit.unitNumber
                          ? { ...item, provider: event.target.value as "chofer" | "uber" }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="chofer">Chofer</option>
                  <option value="uber">Uber</option>
                </select>
                {returnUnits.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Eliminar unidad ${unit.unitNumber}`}
                    onClick={() =>
                      setReturnUnits((current) =>
                        current.filter((item) => item.unitNumber !== unit.unitNumber),
                      )
                    }
                    className="rounded-lg border border-zinc-800 p-3 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {active.map((participant) => (
                  <label key={participant.employeeId} className="flex items-center gap-2 rounded-lg border border-zinc-900 px-3 py-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      className="accent-[#C5A55A]"
                      checked={unit.employeeIds.includes(participant.employeeId)}
                      onChange={() =>
                        setReturnUnits((current) =>
                          current.map((item) => ({
                            ...item,
                            employeeIds:
                              item.unitNumber === unit.unitNumber
                                ? item.employeeIds.includes(participant.employeeId)
                                  ? item.employeeIds.filter((id) => id !== participant.employeeId)
                                  : [...item.employeeIds, participant.employeeId]
                                : item.employeeIds.filter((id) => id !== participant.employeeId),
                          })),
                        )
                      }
                    />
                    {participant.employee?.nombreArtistico || "Empleada"}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className={buttonClass}
            type="button"
            onClick={() =>
              setReturnUnits((current) => [
                ...current,
                {
                  unitNumber: Math.max(0, ...current.map((item) => item.unitNumber)) + 1,
                  direction: "regreso",
                  provider: "chofer",
                  employeeIds: [],
                },
              ])
            }
          >
            <Plus size={14} className="mr-1 inline" />
            Agregar unidad
          </button>
          <button
            className="rounded-xl bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-40"
            disabled={
              pending ||
              active.some(
                (participant) =>
                  !returnUnits.some((unit) => unit.employeeIds.includes(participant.employeeId)),
              ) ||
              returnUnits.some((unit) => !unit.employeeIds.length)
            }
            onClick={() =>
              run(
                () => configureGroupTransports(service.id, returnUnits),
                "Transportes de regreso actualizados",
              )
            }
          >
            Guardar transportes
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <h3 className="flex items-center gap-2 font-heading text-2xl">
          <Car size={20} className="text-[#C5A55A]" />
          Cargo manual de transporte
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
          <input
            className={inputClass}
            inputMode="decimal"
            value={charge}
            onChange={(event) => setCharge(event.target.value)}
            placeholder="Monto"
          />
          <input
            className={inputClass}
            value={chargeReason}
            onChange={(event) => setChargeReason(event.target.value)}
            placeholder="Motivo obligatorio"
          />
          <button
            className={buttonClass}
            disabled={
              pending || Number(charge) <= 0 || !chargeReason.trim()
            }
            onClick={() =>
              run(
                () =>
                  addGroupManualTransportCharge(
                    service.id,
                    Number(charge),
                    chargeReason,
                  ),
                "Cargo agregado",
              )
            }
          >
            Registrar
          </button>
        </div>
      </section>
    </>
  );
}

function activeSelectionIds(request: GroupServiceRequest): string[] {
  if (request.service?.participantes?.length)
    return request.service.participantes
      .filter((item) => !["retirada", "cancelada"].includes(item.status))
      .map((item) => item.employeeId);
  return request.selections
    .filter((item) =>
      ["seleccionada", "reservada", "confirmada"].includes(item.status),
    )
    .map((item) => item.employeeId);
}
