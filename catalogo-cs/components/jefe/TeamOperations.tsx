"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ButtonHTMLAttributes, Dispatch, ReactNode, SetStateAction } from "react";
import { Award, Banknote, Ban, CalendarClock, Camera, Car, Check, CircleDollarSign, ExternalLink, FileCheck2, MapPin, MessageCircle, Pencil, Plus, Repeat2, Search, Send, Smartphone, Star, Trash2, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import { uploadImagesAction } from "@/lib/actions/upload";
import { formatCurrency } from "@/lib/calculations";
import EvaluationHistorySheet from "@/components/admin/evaluations/evaluation-history-sheet";
import CreateServiceDialog from "@/components/services/create-service-dialog";
import ServiceStatusBadge from "@/components/services/service-status-badge";
import CancelServiceDialog from "@/components/services/cancel-service-dialog";
import GaleriaFotos from "@/components/erp/galeria-fotos";
import CerrarPorOficina from "@/components/jefe/CerrarPorOficina";
import { type CancellationReason } from "@/lib/cancellation-reasons";
import {
  cancelJefeService,
  chooseReturnTransport,
  changeTripTransport,
  confirmUberFare,
  decidePendingService,
  getGroupServiceRequests,
  getServiceMessages,
  getJefeCashObligations,
  getJefeEmployees,
  closeJefeCashObligation,
  registerJefeCashPayment,
  refreshJefeServices,
  sendServiceMessage,
  setEmployeeAvailability,
  updatePendingServiceAction,
} from "@/lib/actions/jefe-panel";
import type { CashObligationSummary, ConversationMessage, Employee, Service, Trip } from "@/lib/types";
import { formatAvailabilityTime } from "@/lib/availability";
import GroupServiceOrganizer from "@/components/jefe/GroupServiceOrganizer";
import UberScreenshotUploader from "@/components/jefe/uber-screenshot-uploader";
import type { GroupServiceRequest } from "@/lib/types";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

export default function TeamOperations({ initialEmployees, initialServices, initialCashSummary, initialGroupRequests, tabInicial }: { initialEmployees: Employee[]; initialServices: Service[]; initialCashSummary: CashObligationSummary; initialGroupRequests: GroupServiceRequest[]; tabInicial?: "grupos" }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [services, setServices] = useState(initialServices);
  const [groupRequests, setGroupRequests] = useState(
    initialGroupRequests.filter(
      (request) => request.status !== "cancelada" && request.service?.estado !== "cancelado",
    ),
  );
  const [query, setQuery] = useState("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState("all");
  const [tab, setTab] = useState<"equipo" | "grupos" | "activos" | "historial" | "efectivo">(tabInicial ?? "equipo");
  const [cashSummary, setCashSummary] = useState(initialCashSummary);
  const [chatService, setChatService] = useState<Service | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [acceptingService, setAcceptingService] = useState<Service | null>(null);
  const [cancellingService, setCancellingService] = useState<Service | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [selectedEvaluationUser, setSelectedEvaluationUser] = useState<{ id: string; name: string } | null>(null);
  const [photosEmployee, setPhotosEmployee] = useState<Employee | null>(null);
  // Se guarda el id y no la empleada: si se guardara el objeto, al cambiar la
  // disponibilidad desde la propia hoja esta seguiria mostrando el estado
  // anterior, porque la lista se actualiza pero la copia de la hoja no.
  const [detalleEmpleadaId, setDetalleEmpleadaId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chatServiceRef = useRef<Service | null>(null);
  useEffect(() => {
    chatServiceRef.current = chatService;
  }, [chatService]);

  const visibleEmployees = useMemo(() => employees.filter((employee) => employee.nombreArtistico.toLowerCase().includes(query.toLowerCase())), [employees, query]);
  const detalleEmpleada = detalleEmpleadaId ? employees.find((employee) => employee.id === detalleEmpleadaId) ?? null : null;
  const active = services.filter(
    (service) =>
      ["pendiente", "agendado", "en_curso"].includes(service.estado) ||
      (service.estado === "finalizado" &&
        (service.estadoLiquidacion === "transporte_pendiente" ||
          (service.viajes ?? []).some(
            (trip) =>
              trip.proveedorTransporte === "uber" &&
              (!trip.uberScreenshotUrl || !trip.fareConfirmedAt),
          ))),
  );
  const history = services.filter((service) => ["finalizado", "cancelado"].includes(service.estado));
  const filteredHistory = historyEmployeeId === "all" ? history : history.filter((service) => service.empleadaId === historyEmployeeId);

  async function reloadServices() {
    try {
      setServices(await refreshJefeServices());
    } catch {
      // ignore
    }
  }

  function handleSaveServiceEdit(updatedService: Service) {
    setServices((prev) => prev.map((s) => (s.id === updatedService.id ? updatedService : s)));
    setEditingService(null);
    toast.success("Servicio actualizado correctamente.");
  }

  async function reloadEmployees() {
    try { setEmployees(await getJefeEmployees()); } catch { toast.error("No se pudo actualizar la disponibilidad"); }
  }

  async function reloadGroupRequests() {
    try {
      const next = await getGroupServiceRequests();
      setGroupRequests(next.filter((request) => request.status !== "cancelada" && request.service?.estado !== "cancelado"));
    } catch { /* silenciar error en refresco secundario */ }
  }

  async function reloadCashSummary() {
    try { setCashSummary(await getJefeCashObligations()); } catch { /* silenciar error en refresco secundario */ }
  }

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      source = new EventSource("/api/realtime/sse", {
        withCredentials: true,
      });

      source.onopen = () => {
        window.dispatchEvent(new Event("jefe-realtime-open"));
        void reloadServices();
        void reloadEmployees();
        void reloadGroupRequests();
        void reloadCashSummary();
        if (chatServiceRef.current) {
          void getServiceMessages(chatServiceRef.current.id)
            .then(setMessages)
            .catch(() => {
              /* El siguiente evento o apertura manual volverá a reconciliar. */
            });
        }
      };

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          window.dispatchEvent(
            new CustomEvent("jefe-realtime-event", { detail: payload }),
          );
          if (payload.type === "heartbeat") return;

          if (payload.type === "chat_message") {
            const message = payload.data as ConversationMessage;
            if (chatServiceRef.current?.id === message.servicioId) {
              setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
            }
            void reloadServices();
          } else {
            void reloadServices();
            void reloadEmployees();
            void reloadGroupRequests();
            void reloadCashSummary();
          }
        } catch { /* La siguiente actualización válida reconciliará el estado. */ }
      };

      source.onerror = () => {
        window.dispatchEvent(new Event("jefe-realtime-reconnecting"));
        if (source) {
          source.close();
          source = null;
        }
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3000);
        }
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (source) source.close();
    };
  }, []);

  function toggleAvailability(employee: Employee) {
    startTransition(async () => {
      const next = !employee.disponible;
      const result = await setEmployeeAvailability(employee.id, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEmployees((current) => current.map((item) => item.id === employee.id ? { ...item, disponible: next } : item));
      toast.success(next ? "Empleada marcada como disponible" : "Empleada marcada como no disponible");
    });
  }

  function decide(service: Service, decision: "aceptar" | "rechazar", transport: "chofer" | "uber" = "chofer", bossNotes?: string) {
    startTransition(async () => {
      const result = await decidePendingService(service.id, decision, transport, bossNotes);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await reloadServices();
      setAcceptingService(null);
      toast.success(decision === "aceptar" ? "Servicio aceptado" : "Servicio rechazado");
    });
  }

  function cancelService(service: Service, reason: CancellationReason, note: string) {
    startTransition(async () => {
      const result = await cancelJefeService(service.id, reason, note);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setServices((current) => current.filter((item) => item.id !== service.id));
      setCancellingService(null);
      toast.success("Servicio cancelado");
    });
  }

  async function openChat(service: Service) {
    setChatService(service);
    try { setMessages(await getServiceMessages(service.id)); } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cargar el chat"); }
  }

  return <>
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#C5A55A]">Operación diaria</p>
        <h1 className="font-heading text-4xl font-semibold sm:text-5xl">Mi equipo</h1>
        <p className="mt-2 text-sm text-zinc-500">Disponibilidad, servicios, transporte y conversaciones de tu equipo.</p>
      </div>
      <button
        type="button"
        onClick={() => setCreatingService(true)}
        className="flex items-center gap-2 rounded-2xl bg-[#C5A55A] px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-[#d8b769]"
      >
        <Plus size={16} />
        <span>Crear Servicio Manual</span>
      </button>
    </header>
    {/*
     * Una sola tira que se desliza, en vez de una rejilla de dos columnas.
     *
     * Con cinco pestañas en dos columnas salian tres filas y la ultima coja,
     * y se comian 130px antes de que empezara el contenido. `tabs-scroll`
     * esconde la barra de desplazamiento y ya existia en globals.css.
     *
     * Los contadores van como distintivo y no entre parentesis: asi el numero
     * se lee de un vistazo y la etiqueta no cambia de ancho al actualizarse.
     */}
    <div className="tabs-scroll mb-5 flex items-center gap-2 overflow-x-auto">
      {([['equipo', 'Disponibilidad', null], ['grupos', 'Grupos', groupRequests.length], ['activos', 'Activos', active.length], ['historial', 'Historial', null], ['efectivo', 'Efectivo', null]] as const).map(([value, label, count]) => (
        <button
          key={value}
          onClick={() => setTab(value)}
          aria-pressed={tab === value}
          className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors ${tab === value ? "border-[#C5A55A] bg-[#C5A55A] text-black" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white"}`}
        >
          {label}
          {count !== null && count > 0 && <span className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${tab === value ? "bg-black/20 text-black" : "bg-[#C5A55A]/15 text-[#E8D5A3]"}`}>{count}</span>}
        </button>
      ))}
    </div>
    {tab === "historial" && <label className="mb-5 block"><span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">Filtrar por empleada</span><select value={historyEmployeeId} onChange={(event) => setHistoryEmployeeId(event.target.value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A] sm:max-w-sm"><option value="all">Todas las empleadas</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombreArtistico}</option>)}</select></label>}
    {tab === "equipo" ? <section>
      <label className="mb-4 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 focus-within:border-[#C5A55A]/70"><Search size={18} className="text-[#C5A55A]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empleada" className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-zinc-600" /></label>
      <EmployeeList employees={visibleEmployees} disabled={pending} onToggle={toggleAvailability} onOpen={(employee) => setDetalleEmpleadaId(employee.id)} />
    </section> : tab === "grupos" ? <GroupServiceOrganizer initialRequests={groupRequests} /> : tab === "efectivo" ? <CashDeliveryPanel summary={cashSummary} pending={pending} run={(action) => startTransition(async () => { const result = await action(); if (!result.success) { toast.error(result.error); return; } setCashSummary(await getJefeCashObligations()); toast.success("Entrega de efectivo registrada"); })} /> : <ServiceList services={tab === "activos" ? active : filteredHistory} allServices={services} active={tab === "activos"} disabled={pending} onDecide={decide} onRequestAccept={setAcceptingService} onRequestEdit={setEditingService} onCancel={setCancellingService} onChat={openChat} onRefresh={reloadServices} />}

    {chatService && <ChatPanel service={chatService} messages={messages} setMessages={setMessages} onClose={() => setChatService(null)} />}
    {acceptingService && <AcceptServiceDialog service={acceptingService} previousService={services.find((item) => item.id === acceptingService.servicioPrevioId)} disabled={pending} onClose={() => setAcceptingService(null)} onAccept={(transport, notes) => decide(acceptingService, "aceptar", transport, notes)} />}
    {editingService && <EditPendingServiceDialog service={editingService} onClose={() => setEditingService(null)} onSaved={handleSaveServiceEdit} />}
    <CreateServiceDialog open={creatingService} onClose={() => setCreatingService(false)} initialEmployees={employees} onCreated={() => { reloadServices(); }} />
    {cancellingService && <CancelServiceDialog serviceLabel={cancellingService.empleada?.nombreArtistico || "este servicio"} disabled={pending} onConfirm={(reason, note) => cancelService(cancellingService, reason, note)} onCancel={() => setCancellingService(null)} />}
    <EvaluationHistorySheet userId={selectedEvaluationUser?.id ?? null} workerName={selectedEvaluationUser?.name} open={Boolean(selectedEvaluationUser)} onOpenChange={(open) => !open && setSelectedEvaluationUser(null)} />
    {detalleEmpleada && <EmployeeSheet
      employee={detalleEmpleada}
      disabled={pending}
      onToggle={toggleAvailability}
      /* Las dos abren su propio panel, asi que la hoja se cierra antes: si no,
         quedaria una capa debajo de la otra y cerrar la de arriba dejaria al
         jefe en una pantalla que no pidio. */
      onPhotos={() => { setDetalleEmpleadaId(null); setPhotosEmployee(detalleEmpleada); }}
      onExams={() => { setDetalleEmpleadaId(null); setSelectedEvaluationUser({ id: detalleEmpleada.usuarioId || detalleEmpleada.id, name: detalleEmpleada.nombreArtistico }); }}
      onClose={() => setDetalleEmpleadaId(null)}
    />}
    {photosEmployee && <ExclusivePhotosPanel employee={photosEmployee} onClose={() => setPhotosEmployee(null)} />}
  </>;
}

function CashDeliveryPanel({ summary, pending, run }: { summary: CashObligationSummary; pending: boolean; run: (action: () => Promise<{ success: boolean; error?: string }>) => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const money = formatCurrency;
  const groups = Object.values(summary.obligations.filter((item) => item.status === "pending").reduce<Record<string, typeof summary.obligations>>((result, item) => { (result[item.employeeId] ??= []).push(item); return result; }, {}));
  if (!groups.length) return <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">No hay entregas de efectivo pendientes.</div>;

  const servicios = groups.reduce((total, obligations) => total + obligations.length, 0);

  return (
    <section className="flex flex-col gap-3">
      {/* El total es la cifra que el jefe viene a ver: va solo y arriba, no
          escondido dentro del titulo de la seccion. */}
      <header className="flex items-center justify-between gap-4 rounded-2xl border border-[#C5A55A]/40 bg-[#C5A55A]/[0.07] px-4 py-3.5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8B7635]">Pendiente por entregar</p>
          <p className="mt-1 font-heading text-3xl font-semibold tabular-nums text-[#E8D5A3]">{money(summary.total)}</p>
          <p className="mt-1.5 text-[11px] text-zinc-500">{groups.length} {groups.length === 1 ? "empleada" : "empleadas"} · {servicios} {servicios === 1 ? "servicio" : "servicios"}</p>
        </div>
        <Banknote size={26} className="shrink-0 text-[#8B7635]" />
      </header>

      {groups.map((obligations) => {
        const employeeId = obligations[0].employeeId;
        const employeeName = summary.employees.find((item) => item.id === employeeId)?.name || "Empleada";
        const balance = obligations.reduce((sum, item) => sum + Number(item.amount) - Number(item.paidAmount), 0);
        const hasProvisional = obligations.some((item) => item.calculationStatus === "provisional");
        return (
          <article key={employeeId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-heading text-xl font-semibold">{employeeName}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{obligations.length} {obligations.length === 1 ? "servicio pendiente" : "servicios pendientes"}</p>
              </div>
              <span className="shrink-0 font-heading text-xl font-semibold tabular-nums text-[#E8D5A3]">{money(balance)}</span>
            </div>

            {/* Cada servicio en dos lineas. Antes eran tres columnas a 12px que
                en el telefono se aplastaban unas contra otras. */}
            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-900 bg-black/50">
              {obligations.map((item) => (
                <div key={item.id} className="border-b border-zinc-900 px-3 py-2.5 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tabular-nums text-zinc-200">Servicio {item.serviceId.slice(-6).toUpperCase()}</p>
                      <p className="mt-1 truncate text-[10px] tabular-nums text-zinc-500">Cobrado {money(Number(item.customerTotal))} · Ubers -{money(Number(item.uberDeduction))}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="text-sm font-bold tabular-nums text-white">{money(Number(item.amount) - Number(item.paidAmount))}</span>
                      <button
                        type="button"
                        disabled={pending || item.calculationStatus !== "ready"}
                        onClick={() => run(() => closeJefeCashObligation(item.id))}
                        aria-label={`Marcar el servicio ${item.serviceId.slice(-6).toUpperCase()} como entregado`}
                        title="Marcar como entregado"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#C5A55A]/50 text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:border-zinc-800 disabled:text-zinc-700 disabled:hover:bg-transparent"
                      >
                        <Check size={17} />
                      </button>
                    </div>
                  </div>
                  {item.calculationStatus === "provisional" && <p className="mt-2 text-[11px] text-[#E8D5A3]">Provisional: {item.pendingReason}</p>}
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                disabled={hasProvisional}
                value={amounts[employeeId] || ""}
                onChange={(event) => setAmounts({ ...amounts, [employeeId]: event.target.value })}
                inputMode="decimal"
                placeholder={hasProvisional ? "Confirma los Ubers pendientes" : "Monto recibido"}
                className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-3 text-sm outline-none focus:border-[#C5A55A] disabled:text-zinc-700"
              />
              <button
                type="button"
                disabled={pending || hasProvisional}
                onClick={() => {
                  const amount = Number(amounts[employeeId]);
                  if (!Number.isFinite(amount) || amount <= 0) return toast.error("Ingresa un monto válido");
                  run(() => registerJefeCashPayment(employeeId, amount));
                }}
                className="h-12 shrink-0 rounded-xl border border-[#C5A55A] px-4 text-xs font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
              >
                Abonar
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ServiceList({ services, allServices, active, disabled, onDecide, onRequestAccept, onRequestEdit, onCancel, onChat, onRefresh }: { services: Service[]; allServices: Service[]; active: boolean; disabled: boolean; onDecide: (service: Service, decision: "aceptar" | "rechazar", transport?: "chofer" | "uber", bossNotes?: string) => void; onRequestAccept: (service: Service) => void; onRequestEdit?: (service: Service) => void; onCancel: (service: Service) => void; onChat: (service: Service) => void; onRefresh: () => Promise<void> }) {
  if (!services.length) return <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">No hay servicios en esta sección.</div>;
  // Un servicio cerrado se consulta, no se opera: el historial es una lista
  // para repasar y solo despliega el detalle el que se toca.
  if (!active) return <HistoryList services={services} onChat={onChat} />;
  return <div className="space-y-3">{services.map((service) => <ServiceCard key={service.id} service={service} previous={allServices.find((item) => item.id === service.servicioPrevioId)} disabled={disabled} onRequestAccept={onRequestAccept} onRequestEdit={onRequestEdit} onCancel={onCancel} onChat={onChat} onRefresh={onRefresh} />)}</div>;
}

/**
 * Un servicio en marcha.
 *
 * Los datos iban antes en un parrafo corrido separado por puntos, que en el
 * telefono se partia por donde caia; ahora son filas de clave y valor. Y las
 * acciones van en rejilla fija: con `flex-wrap` la ultima fila quedaba coja
 * segun lo que midieran los textos, cosa que en una pantalla estrecha pasaba
 * siempre.
 */
function ServiceCard({ service, previous, disabled, onRequestAccept, onRequestEdit, onCancel, onChat, onRefresh }: { service: Service; previous?: Service; disabled: boolean; onRequestAccept: (service: Service) => void; onRequestEdit?: (service: Service) => void; onCancel: (service: Service) => void; onChat: (service: Service) => void; onRefresh: () => Promise<void> }) {
  const programado = service.tipoAgenda === "programado";
  const pendiente = service.estado === "pendiente";

  const datos: Array<[string, string]> = [
    ["Cliente", service.cliente?.nombreTelegram || "Cliente"],
    ["Duración", `${service.duracionPactadaHoras} horas`],
    ["Pago", service.metodoPago.toUpperCase()],
  ];
  if (service.locationNameSnapshot) datos.push(["Lugar", service.locationNameSnapshot]);
  // `formatAvailabilityTime` devuelve null si la fecha no se puede leer: en ese
  // caso no se pinta la fila, mejor que una fila con un hueco.
  const llegada = service.horaInicioEstimada && !programado ? formatAvailabilityTime(service.horaInicioEstimada) : null;
  if (llegada) datos.push(["Llegada estimada", llegada]);
  if (service.servicioPrevioId) datos.push(["Después de", previous?.id.slice(-6).toUpperCase() || service.servicioPrevioId.slice(-6).toUpperCase()]);

  return (
    <article className={`rounded-2xl border bg-zinc-950 p-4 sm:p-5 ${pendiente ? "border-[#C5A55A]/50" : "border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#8B7635]">Servicio {service.id.slice(-6).toUpperCase()}</p>
          <h2 className="mt-1 truncate font-heading text-xl font-semibold sm:text-2xl">{service.empleada?.nombreArtistico || "Empleada asignada"}</h2>
        </div>
        <ServiceStatusBadge status={service.estado} />
      </div>

      {programado && service.fechaProgramada && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2.5 text-xs font-semibold text-purple-300">
          <CalendarClock size={15} className="shrink-0" />
          Cita pactada: {new Date(service.fechaProgramada).toLocaleString(APP_LOCALE, { dateStyle: "short", timeStyle: "short" })}
        </p>
      )}

      <dl className="mt-3 overflow-hidden rounded-xl border border-zinc-900 bg-black/50">
        {datos.map(([clave, valor]) => (
          <div key={clave} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-3 py-2.5 text-xs last:border-b-0">
            <dt className="shrink-0 text-zinc-500">{clave}</dt>
            <dd className="truncate text-right font-semibold text-zinc-200">{valor}</dd>
          </div>
        ))}
      </dl>

      {service.notasJefe && <div className="mt-3 border-l-2 border-[#C5A55A]/70 bg-black/50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C5A55A]">Notas internas</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{service.notasJefe}</p></div>}
      <ReceiptEvidenceList service={service} />

      {pendiente && (
        <button type="button" disabled={disabled} onClick={() => onRequestAccept(service)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C5A55A] py-3.5 text-xs font-bold uppercase tracking-wider text-black transition-colors hover:bg-[#d8b769] disabled:opacity-50">
          <Check size={16} />Aceptar servicio
        </button>
      )}

      <div className={`mt-2.5 grid gap-2 ${pendiente ? "grid-cols-3" : "grid-cols-2"}`}>
        {pendiente && <SecondaryAction onClick={() => onRequestEdit?.(service)} disabled={disabled} icon={<Pencil size={16} />} label="Editar" />}
        <SecondaryAction onClick={() => onChat(service)} icon={<MessageCircle size={16} />} label="Chat" />
        <SecondaryAction onClick={() => onCancel(service)} disabled={disabled} danger icon={<Ban size={16} />} label="Cancelar" />
      </div>

      {/*
        Solo sobre uno en curso: es cuando puede quedarse colgado porque a ella
        se le murio el telefono. Antes de arrancar se cancela, y despues ya esta
        cerrado.
      */}
      {service.estado === "en_curso" && (
        <div className="mt-2.5">
          <CerrarPorOficina servicioId={service.id} />
        </div>
      )}

      {service.estado !== "agendado" && <TransportPanel service={service} onRefresh={onRefresh} />}
    </article>
  );
}

function SecondaryAction({ onClick, disabled, danger = false, icon, label }: { onClick: () => void; disabled?: boolean; danger?: boolean; icon: ReactNode; label: string }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`flex h-[52px] flex-col items-center justify-center gap-1 rounded-xl border text-[10px] font-semibold transition-colors disabled:opacity-40 ${danger ? "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white" : "border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-[#C5A55A] hover:text-[#C5A55A]"}`}>{icon}{label}</button>;
}

/**
 * El dia de una fecha, en la zona del negocio.
 *
 * Se comparan las fechas ya formateadas en `America/Mexico_City` y no los
 * instantes: a las 23:30 de aqui, un `getDate()` sobre UTC ya habria pasado al
 * dia siguiente y los servicios de esta noche saldrian agrupados bajo manana.
 */
function claveDia(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function etiquetaDia(iso: string) {
  const clave = claveDia(iso);
  if (clave === claveDia(new Date().toISOString())) return "Hoy";
  if (clave === claveDia(new Date(Date.now() - 86_400_000).toISOString())) return "Ayer";
  return new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIME_ZONE, day: "numeric", month: "long" }).format(new Date(iso));
}

/**
 * El historial, agrupado por dia.
 *
 * Cada servicio cerrado era una tarjeta entera con sus botones, asi que
 * repasar la semana era un scroll larguisimo. Aqui cada uno ocupa una fila con
 * lo que se busca al repasar --quien, cuando, cuanto duro y como acabo-- y el
 * detalle completo se despliega solo en el que se toca.
 */
function HistoryList({ services, onChat }: { services: Service[]; onChat: (service: Service) => void }) {
  const [abierto, setAbierto] = useState<string | null>(null);

  const grupos: Array<[string, Service[]]> = [];
  for (const service of services) {
    const dia = etiquetaDia(service.updatedAt);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo[0] === dia) ultimo[1].push(service);
    else grupos.push([dia, [service]]);
  }

  return (
    <div className="flex flex-col gap-5">
      {grupos.map(([dia, delDia]) => (
        <section key={dia} className="flex flex-col gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">{dia}</h3>
          {delDia.map((service) => (
            <article key={service.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <button type="button" onClick={() => setAbierto(abierto === service.id ? null : service.id)} aria-expanded={abierto === service.id} className="flex w-full items-center gap-3 p-2.5 text-left">
                <span className="block h-10 w-10 shrink-0 rounded-lg border border-zinc-800 bg-cover bg-center" style={service.empleada?.fotoPerfilUrl ? { backgroundImage: `url(${service.empleada.fotoPerfilUrl})` } : { background: "linear-gradient(135deg,#3f3a30,#14120e)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-base font-semibold text-white">{service.empleada?.nombreArtistico || "Empleada"}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(service.updatedAt))} · {service.duracionPactadaHoras} h · {service.metodoPago.toUpperCase()}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  {service.calificacion != null && <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-[#E8D5A3]"><Star size={12} className="fill-[#C5A55A] text-[#C5A55A]" />{service.calificacion}</span>}
                  <ServiceStatusBadge status={service.estado} />
                </span>
              </button>
              {abierto === service.id && (
                <div className="border-t border-zinc-900 p-3.5">
                  {service.empleada && <EmployeeRatingSummary employee={service.empleada} />}
                  <p className="mt-2 text-xs text-zinc-500">Cliente: {service.cliente?.nombreTelegram || "Cliente"}</p>
                  {service.notasJefe && <div className="mt-3 border-l-2 border-[#C5A55A]/70 bg-black/50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C5A55A]">Notas internas</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{service.notasJefe}</p></div>}
                  <ServiceRating service={service} />
                  <ReceiptEvidenceList service={service} />
                  <div className="mt-3"><SecondaryAction onClick={() => onChat(service)} icon={<MessageCircle size={16} />} label="Abrir chat" /></div>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function EditPendingServiceDialog({ service, onClose, onSaved }: { service: Service; onClose: () => void; onSaved: (service: Service) => void }) {
  const [duracion, setDuracion] = useState<number | string>(Number(service.duracionPactadaHoras) || 1);
  const [metodoPago, setMetodoPago] = useState(service.metodoPago);
  const [notas, setNotas] = useState(service.notas || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const duracionNum = Math.max(1, Math.min(24, parseInt(String(duracion), 10) || 1));
      const res = await updatePendingServiceAction(service.id, {
        duracionPactadaHoras: duracionNum,
        metodoPago: metodoPago as any,
        notas: notas.trim() || undefined,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || "No se pudo actualizar");
      }
      onSaved(res.data);
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar servicio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#090909] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl text-white">Editar Servicio Pendiente</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">Duración (Horas)</label>
            <input
              type="number"
              min={1}
              max={24}
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              onBlur={() => {
                const val = parseInt(String(duracion), 10);
                if (isNaN(val) || val < 1) setDuracion(1);
                else if (val > 24) setDuracion(24);
                else setDuracion(val);
              }}
              className="w-full bg-black border border-zinc-800 px-4 py-2.5 rounded-xl text-white outline-none focus:border-[#C5A55A]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">Método de Pago</label>
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as any)} className="w-full bg-black border border-zinc-800 px-4 py-2.5 rounded-xl text-white outline-none focus:border-[#C5A55A]">
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="mixto">Mixto</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">Notas / Instrucciones del Cliente</label>
            <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full bg-black border border-zinc-800 px-4 py-2.5 rounded-xl text-white outline-none focus:border-[#C5A55A] resize-none" placeholder="Instrucciones de llegada o notas..." />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-2.5 border border-zinc-800 rounded-xl text-xs font-bold uppercase text-zinc-400 hover:text-white">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#C5A55A] text-black rounded-xl text-xs font-bold uppercase hover:bg-[#D4AF37] disabled:opacity-50">{saving ? "Guardando..." : "Guardar Cambios"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReceiptEvidenceList({ service }: { service: Service }) {
  const receipts = (service.receiptValidations ?? []).filter((item) => item.imageUrl);
  if (!receipts.length) return null;
  return <div className="mt-5 rounded-xl border border-zinc-800 bg-black/60 p-4"><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]"><FileCheck2 size={14} />Comprobantes</p><div className="mt-3 flex flex-wrap gap-2">{receipts.map((receipt, index) => <a key={receipt.id} href={receipt.imageUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-[#C5A55A] hover:text-[#E8D5A3]">Comprobante {index + 1} · {(receipt.estado ?? "sin estado").replaceAll("_", " ")}<ExternalLink size={12} /></a>)}</div></div>;
}

function AcceptServiceDialog({ service, previousService, disabled, onClose, onAccept }: { service: Service; previousService?: Service; disabled: boolean; onClose: () => void; onAccept: (transport: "chofer" | "uber", notes?: string) => void }) {
  const [notes, setNotes] = useState("");
  const sameLocation = Boolean(previousService?.presetLocationId && previousService.presetLocationId === service.presetLocationId);
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section role="dialog" aria-modal="true" aria-labelledby="accept-service-title" className="w-full max-w-lg rounded-2xl border border-[#C5A55A]/50 bg-[#050505] p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">Aceptar servicio</p><h2 id="accept-service-title" className="mt-1 font-heading text-3xl">{service.empleada?.nombreArtistico || "Empleada"}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar diálogo" className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-white"><X size={18} /></button></div><div className="mt-5 rounded-xl border border-zinc-800 bg-black p-4 text-sm text-zinc-400">{sameLocation ? <><p className="font-semibold text-[#E8D5A3]">El siguiente servicio será en la misma ubicación.</p><p className="mt-1 text-xs">No es necesario seleccionar Uber ni chofer.</p></> : <p>Selecciona el transporte después de decidir si deseas agregar instrucciones internas.</p>}</div><label className="mt-5 block"><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">Notas para la empleada, opcionales</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} placeholder="Escribe instrucciones internas o continúa sin notas" className="mt-2 w-full resize-none rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]" /></label><div className="mt-5 grid gap-2 sm:grid-cols-2">{sameLocation ? <button type="button" disabled={disabled} onClick={() => onAccept("chofer", notes)} className="sm:col-span-2 rounded-xl bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-50">Aceptar en la misma ubicación</button> : <><button type="button" disabled={disabled} onClick={() => onAccept("chofer", notes)} className="rounded-xl bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-50"><Car size={15} className="mr-1 inline" />Aceptar con chofer</button><button type="button" disabled={disabled} onClick={() => onAccept("uber", notes)} className="rounded-xl border border-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#C5A55A] disabled:opacity-50"><Smartphone size={15} className="mr-1 inline" />Aceptar con Uber</button></>}</div></section></div>;
}

function EmployeeRatingSummary({ employee }: { employee: Employee }) {
  if (employee.promedioCalificacion == null) return <p className="mt-2 text-xs text-zinc-500">Sin valoraciones</p>;
  return <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400"><Star size={13} className="fill-[#C5A55A] text-[#C5A55A]" /><span className="font-semibold text-[#E8D5A3]">{Number(employee.promedioCalificacion).toFixed(2)}</span><span>{employee.totalServiciosValorados} {employee.totalServiciosValorados === 1 ? "servicio valorado" : "servicios valorados"}</span></p>;
}

/** Estado de la empleada en una linea, para la fila de la lista. */
function resumenEmpleada(employee: Employee) {
  if (employee.availabilityStatus === "ocupada") {
    return `Ocupada${employee.estimatedAvailableAt ? ` hasta ${formatAvailabilityTime(employee.estimatedAvailableAt)}` : ""}`;
  }
  return `${employee.disponible ? "Libre" : "No disponible"} · ${employee.ubicacionLat ? "Ubicación recibida" : "Sin ubicación"}`;
}

function fondoEmpleada(employee: Employee) {
  return employee.fotoPerfilUrl
    ? { backgroundImage: `url(${employee.fotoPerfilUrl})` }
    : { background: "linear-gradient(135deg,#3f3a30,#14120e)" };
}

/**
 * El equipo como lista de filas.
 *
 * Antes cada empleada era una tarjeta con foto de 144px y tres botones
 * apilados a ancho completo: en un telefono se veia una y media por pantalla,
 * y la accion del dia a dia --marcar disponible-- quedaba al mismo nivel que
 * dos consultas que casi nunca se abren. Ahora la fila mide 68px y se ven
 * siete; disponibilidad se cambia desde aqui y el resto vive en la ficha.
 */
function EmployeeList({ employees, disabled, onToggle, onOpen }: { employees: Employee[]; disabled: boolean; onToggle: (employee: Employee) => void; onOpen: (employee: Employee) => void }) {
  if (!employees.length) return <div className="rounded-2xl border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-500">No hay empleadas que coincidan con la búsqueda.</div>;
  return (
    <ul className="flex flex-col gap-2">
      {employees.map((employee) => (
        <li key={employee.id} className={`flex items-center gap-2 rounded-2xl border bg-zinc-950 pr-2 transition-colors ${employee.disponible ? "border-[#C5A55A]/45" : "border-zinc-800"}`}>
          {/* El area de la izquierda abre la ficha; el interruptor es un boton
              aparte, porque un boton no puede anidarse dentro de otro. */}
          <button type="button" onClick={() => onOpen(employee)} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-2xl py-2.5 pl-2.5 text-left">
            <span className="relative shrink-0">
              <span className="block h-12 w-12 rounded-xl border border-zinc-800 bg-cover bg-center" style={fondoEmpleada(employee)} />
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 ${employee.availabilityStatus === "ocupada" ? "bg-[#8B7635]" : employee.disponible ? "bg-emerald-400" : "bg-zinc-700"}`} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-[17px] font-semibold leading-tight text-white">{employee.nombreArtistico}</span>
              <span className={`mt-1 block truncate text-[11px] ${employee.availabilityStatus === "ocupada" ? "text-[#E8D5A3]" : "text-zinc-500"}`}>{resumenEmpleada(employee)}</span>
            </span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(employee)}
            aria-pressed={employee.disponible}
            aria-label={employee.disponible ? `Marcar a ${employee.nombreArtistico} como no disponible` : `Marcar a ${employee.nombreArtistico} como disponible`}
            title={employee.disponible ? "Marcar no disponible" : "Marcar disponible"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${employee.disponible ? "border-[#C5A55A] text-[#C5A55A]" : "border-zinc-800 text-zinc-600 hover:border-[#C5A55A] hover:text-[#C5A55A]"}`}
          >
            {employee.disponible ? <UserRoundX size={18} /> : <UserRoundCheck size={18} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Ficha de la empleada: hoja inferior en movil, dialogo centrado a partir de
 * `sm`. Recoge lo que salio de la tarjeta y no es del dia a dia.
 */
function EmployeeSheet({ employee, disabled, onToggle, onPhotos, onExams, onClose }: { employee: Employee; disabled: boolean; onToggle: (employee: Employee) => void; onPhotos: () => void; onExams: () => void; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-3"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="w-full rounded-t-3xl border border-b-0 border-zinc-800 bg-[#090909] p-5 pb-8 shadow-2xl sm:max-w-md sm:rounded-2xl sm:border-b sm:pb-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="block h-16 w-16 shrink-0 rounded-2xl border border-[#C5A55A]/45 bg-cover bg-center" style={fondoEmpleada(employee)} />
            <div className="min-w-0">
              <h3 className="truncate font-heading text-2xl font-semibold text-white">{employee.nombreArtistico}</h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><MapPin size={12} />{employee.ubicacionLat ? "Ubicación recibida" : "Sin ubicación"}</p>
              <EmployeeRatingSummary employee={employee} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggle(employee)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#C5A55A] bg-[#C5A55A]/10 py-3.5 text-xs font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
        >
          {employee.disponible ? <UserRoundX size={18} /> : <UserRoundCheck size={18} />}
          {employee.disponible ? "Marcar no disponible" : "Marcar disponible"}
        </button>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onPhotos} className="flex h-24 flex-col items-start justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-left transition-colors hover:border-[#C5A55A]">
            <Camera size={20} className="text-[#C5A55A]" />
            <span className="text-xs font-semibold text-zinc-200">Fotos exclusivas</span>
          </button>
          <button type="button" onClick={onExams} className="flex h-24 flex-col items-start justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-left transition-colors hover:border-[#C5A55A]">
            <Award size={20} className="text-[#C5A55A]" />
            <span className="text-xs font-semibold text-zinc-200">Historial de exámenes</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceRating({ service }: { service: Service }) {
  return <div className="mt-5 rounded-xl border border-zinc-800 bg-black/60 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Valoración del cliente</p>{service.calificacion == null ? <p className="mt-2 text-sm text-zinc-500">Sin valoración</p> : <div className="mt-2 flex items-center gap-1" aria-label={`${service.calificacion} de 5 estrellas`}>{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={18} className={value <= service.calificacion! ? "fill-[#C5A55A] text-[#C5A55A]" : "text-zinc-700"} />)}<span className="ml-2 text-sm font-semibold text-[#E8D5A3]">{service.calificacion}/5</span></div>}{service.comentariosCalificacion && <blockquote className="mt-3 border-l-2 border-[#C5A55A]/60 pl-3 text-sm leading-relaxed text-zinc-300">{service.comentariosCalificacion}</blockquote>}</div>;
}

function TransportPanel({ service, onRefresh }: { service: Service; onRefresh: () => Promise<void> }) {
  const trips = service.viajes || [];
  async function run(action: () => Promise<{ success: boolean; error?: string }>, success: string): Promise<void> { const result = await action(); if (!result.success) { toast.error(result.error); return; } toast.success(success); await onRefresh(); }
  return <section className="mt-6 space-y-4 border-t border-zinc-800 pt-6"><header><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">Transporte del servicio</p><p className="mt-1 text-sm text-zinc-500">Gestiona por separado los viajes de ida y regreso.</p></header><div className="grid gap-4 xl:grid-cols-2">{trips.map((trip) => <TripCard key={trip.id} trip={trip} service={service} onRefresh={onRefresh} onRun={run} />)}</div>{service.estadoLiquidacion === "transporte_pendiente" && !trips.some((trip) => trip.tipo === "regreso") && <div className="rounded-xl border border-[#C5A55A]/35 bg-[#C5A55A]/5 p-4"><p className="text-sm font-semibold text-[#E8D5A3]">Transporte de regreso pendiente</p><p className="mt-1 text-xs text-zinc-500">Selecciona cómo regresará la empleada al finalizar el servicio.</p><div className="mt-4 flex flex-wrap gap-2"><ActionButton onClick={() => run(() => chooseReturnTransport(service.id, "chofer"), "Chofer solicitado")}>Regreso con chofer</ActionButton><ActionButton outline onClick={() => run(() => chooseReturnTransport(service.id, "uber"), "Uber seleccionado")}>Regreso con Uber</ActionButton></div></div>}</section>;
}

function getUberDeeplink(trip: Trip, service?: Service): string {
  const isIda = trip.tipo === "ida";
  const pickupLat = isIda ? service?.empleada?.ubicacionLat : service?.ubicacionClienteLat;
  const pickupLng = isIda ? service?.empleada?.ubicacionLng : service?.ubicacionClienteLng;
  const dropoffLat = isIda ? service?.ubicacionClienteLat : service?.empleada?.ubicacionLat;
  const dropoffLng = isIda ? service?.ubicacionClienteLng : service?.empleada?.ubicacionLng;

  let url = "https://m.uber.com/ul/?action=setPickup";
  if (pickupLat && pickupLng) {
    url += `&pickup[latitude]=${pickupLat}&pickup[longitude]=${pickupLng}`;
  } else {
    url += "&pickup=my_location";
  }
  if (dropoffLat && dropoffLng) {
    url += `&dropoff[latitude]=${dropoffLat}&dropoff[longitude]=${dropoffLng}`;
  }
  return url;
}

function TripCard({ trip, service, onRefresh, onRun }: { trip: Trip; service?: Service; onRefresh: () => Promise<void>; onRun: (action: () => Promise<{ success: boolean; error?: string }>, success: string) => Promise<void> }) {
  const canChangeTransport = (!trip.choferId || trip.estado === "notificado") && ["notificado", "aceptado", "llegado"].includes(trip.estado);
  const hasScreenshot = Boolean(trip.uberScreenshotUrl || trip.telegramUberFileId);
  const uberDeeplink = getUberDeeplink(trip, service);
  const changeButton = canChangeTransport && <button type="button" onClick={() => onRun(() => changeTripTransport(trip.id, trip.proveedorTransporte === "uber" ? "chofer" : "uber"), "Método de transporte actualizado")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#C5A55A] px-3 py-3 text-xs font-semibold text-[#C5A55A]"><Repeat2 size={15} />Cambiar a {trip.proveedorTransporte === "uber" ? "chofer" : "Uber"}</button>;
  return <article className="overflow-hidden rounded-xl border border-zinc-800 bg-black"><header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3"><div className="flex items-center gap-2"><span className="rounded-lg bg-[#C5A55A]/10 p-2 text-[#C5A55A]"><Car size={17} /></span><div><p className="text-sm font-semibold capitalize">Viaje de {trip.tipo}</p><p className="text-[10px] uppercase tracking-wider text-zinc-600">{trip.proveedorTransporte}</p></div></div><span className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-400">{trip.estado}</span></header>{trip.proveedorTransporte === "uber" ? <div className="space-y-5 p-4"><a href={uberDeeplink} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black"><Smartphone size={16} />📱 Pedir Uber</a>{hasScreenshot ? <div className="rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/5 p-3 text-xs text-[#E8D5A3]">Captura recibida{trip.uberScreenshotUrl && <a href={trip.uberScreenshotUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-2 font-semibold text-[#C5A55A]">Ver captura <ExternalLink size={12} /></a>}</div> : <UberScreenshotUploader tripId={trip.id} onRefresh={onRefresh} />}<UberFareEditor trip={trip} onRefresh={onRefresh} />{changeButton}</div> : <div className="space-y-4 p-4"><p className="text-sm text-zinc-500">El viaje será gestionado por un chofer interno.</p>{changeButton}</div>}</article>;
}

function UberFareEditor({ trip, onRefresh }: { trip: Trip; onRefresh: () => Promise<void> }) {
  const storedFare = Number(trip.tarifa);
  const hasFare = Number.isFinite(storedFare) && storedFare > 0;
  const canEditFare = trip.estado !== "cancelado" && Boolean(trip.uberScreenshotUrl || trip.telegramUberFileId);
  const [editing, setEditing] = useState(!hasFare && canEditFare);
  const [fare, setFare] = useState(hasFare ? String(storedFare) : "");
  const [saving, setSaving] = useState(false);

  async function saveFare() {
    const amount = Number(fare);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Ingresa una tarifa válida");
    setSaving(true);
    const result = await confirmUberFare(trip.id, amount);
    setSaving(false);
    if (!result.success) return toast.error(result.error);
    setEditing(false);
    toast.success(hasFare ? "Tarifa actualizada" : "Tarifa registrada");
    await onRefresh();
  }

  if (!editing && hasFare) return <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3"><div className="flex items-center gap-2"><CircleDollarSign size={18} className="text-[#C5A55A]" /><div><p className="text-[10px] uppercase tracking-wider text-zinc-500">Tarifa final</p><p className="font-heading text-xl text-[#E8D5A3]">${storedFare.toFixed(2)}</p></div></div>{canEditFare && <button type="button" onClick={() => { setFare(String(storedFare)); setEditing(true); }} className="inline-flex items-center gap-1 rounded-lg border border-[#C5A55A] px-3 py-2 text-xs font-semibold text-[#C5A55A]"><Pencil size={13} />Cambiar tarifa</button>}</div>;

  return <div className="space-y-2 border-t border-zinc-900 pt-4"><label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500" htmlFor={`fare-${trip.id}`}>Tarifa final del viaje de {trip.tipo}</label><div className="flex gap-2"><input id={`fare-${trip.id}`} value={fare} onChange={(event) => setFare(event.target.value)} inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-[#C5A55A]" /><button type="button" disabled={saving} onClick={saveFare} className="rounded-lg bg-[#C5A55A] px-4 py-3 text-xs font-semibold text-black disabled:opacity-50">{saving ? "Guardando" : "Guardar"}</button>{hasFare && <button type="button" disabled={saving} onClick={() => { setFare(String(storedFare)); setEditing(false); }} className="rounded-lg border border-zinc-800 px-3 py-3 text-xs text-zinc-400 disabled:opacity-50">Cancelar</button>}</div></div>;
}

function ChatPanel({ service, messages, setMessages, onClose }: { service: Service; messages: ConversationMessage[]; setMessages: Dispatch<SetStateAction<ConversationMessage[]>>; onClose: () => void }) {
  const [text, setText] = useState("");
  async function send() { const value = text.trim(); if (!value) return; const result = await sendServiceMessage(service.id, value); if (!result.success || !result.data) return toast.error(result.error); setMessages((current) => current.some((item) => item.id === result.data!.id) ? current : [...current, result.data!]); setText(""); }
  const hasPriorContext = messages.some((message) => message.bookingSessionId);
  const senderPresentation: Record<ConversationMessage["emisor"], { label: string; className: string }> = {
    cliente: { label: "Cliente", className: "bg-zinc-900 text-zinc-200" },
    ia: { label: "Asistente IA", className: "ml-auto border border-[#C5A55A]/35 bg-[#C5A55A]/10 text-[#E8D5A3]" },
    sistema: { label: "Sistema", className: "mx-auto border border-zinc-800 bg-black text-zinc-400" },
    jefe: { label: "Jefe", className: "ml-auto bg-[#C5A55A] text-black" },
  };
  return <aside className="fixed inset-x-3 bottom-3 z-50 flex max-h-[75vh] flex-col rounded-2xl border border-[#C5A55A]/60 bg-[#050505] shadow-2xl md:left-auto md:right-6 md:w-[420px]"><header className="flex items-center justify-between border-b border-zinc-800 p-4"><div><p className="font-heading text-xl">Conversación</p><p className="text-xs text-zinc-500">{service.cliente?.nombreTelegram || "Cliente"}</p></div><button onClick={onClose} aria-label="Cerrar"><X size={19} /></button></header>{hasPriorContext && <div className="border-b border-zinc-800 bg-[#C5A55A]/5 px-4 py-3 text-xs leading-relaxed text-[#E8D5A3]">Esta conversación comenzó antes de que el servicio fuera creado. El historial previo se muestra para conservar el contexto.</div>}<div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.length === 0 && <p className="py-10 text-center text-sm text-zinc-600">Todavía no hay mensajes.</p>}{messages.map((message) => { const presentation = senderPresentation[message.emisor]; return <div key={message.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${presentation.className}`}><p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] opacity-60">{presentation.label}</p><p className="whitespace-pre-wrap">{message.mensaje}</p><time className="mt-1 block text-[10px] opacity-60">{new Date(message.enviadoAt).toLocaleTimeString(APP_LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE })}</time></div>; })}</div><div className="flex gap-2 border-t border-zinc-800 p-3"><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} maxLength={4000} placeholder="Escribe un mensaje" className="min-h-11 flex-1 resize-none rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm outline-none focus:border-[#C5A55A]" /><button onClick={send} className="rounded-xl bg-[#C5A55A] px-4 text-black" aria-label="Enviar"><Send size={18} /></button></div></aside>;
}

/**
 * Fotos de una modelo desde el panel del jefe.
 *
 * Antes esta pantalla solo dejaba ver, subir y borrar exclusivas, mientras que
 * el catalogo publico se administraba en otro lado. Ahora monta la misma
 * galeria que el expediente del ERP, asi que se puede hacer lo mismo entrando
 * por donde sea.
 */
function ExclusivePhotosPanel({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#090909] p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">Fotos de la modelo</p>
            <h3 className="mt-1 font-heading text-2xl text-white">{employee.nombreArtistico}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <GaleriaFotos empleadaId={employee.id} nombre={employee.nombreArtistico} compact />

        <div className="mt-6 flex justify-end border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-800 px-6 py-3 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-900"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, outline = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { outline?: boolean }) { return <button {...props} className={`inline-flex items-center gap-1 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-50 ${outline ? "border border-[#C5A55A] text-[#C5A55A]" : "bg-[#C5A55A] text-black"}`}>{children}</button>; }
