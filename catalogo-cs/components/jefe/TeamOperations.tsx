"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ButtonHTMLAttributes, Dispatch, SetStateAction } from "react";
import { Award, Banknote, Ban, Camera, Car, Check, CircleDollarSign, Clock3, ExternalLink, FileCheck2, MapPin, MessageCircle, Pencil, Plus, Repeat2, Search, Send, Smartphone, Star, Trash2, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import { getPrivatePhotosAction, addPrivatePhotoAction, deletePrivatePhotoAction } from "@/lib/actions/modelos";
import { uploadImagesAction } from "@/lib/actions/upload";
import { formatCurrency } from "@/lib/calculations";
import EvaluationHistorySheet from "@/components/admin/evaluations/evaluation-history-sheet";
import CreateServiceDialog from "@/components/services/create-service-dialog";
import ServiceStatusBadge from "@/components/services/service-status-badge";
import CancelServiceDialog from "@/components/services/cancel-service-dialog";
import GaleriaFotos from "@/components/erp/galeria-fotos";
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

export default function TeamOperations({ initialEmployees, initialServices, initialCashSummary, initialGroupRequests }: { initialEmployees: Employee[]; initialServices: Service[]; initialCashSummary: CashObligationSummary; initialGroupRequests: GroupServiceRequest[] }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [services, setServices] = useState(initialServices);
  const [groupRequests, setGroupRequests] = useState(
    initialGroupRequests.filter(
      (request) => request.status !== "cancelada" && request.service?.estado !== "cancelado",
    ),
  );
  const [query, setQuery] = useState("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState("all");
  const [tab, setTab] = useState<"equipo" | "grupos" | "activos" | "historial" | "efectivo">("equipo");
  const [cashSummary, setCashSummary] = useState(initialCashSummary);
  const [chatService, setChatService] = useState<Service | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [acceptingService, setAcceptingService] = useState<Service | null>(null);
  const [cancellingService, setCancellingService] = useState<Service | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [selectedEvaluationUser, setSelectedEvaluationUser] = useState<{ id: string; name: string } | null>(null);
  const [photosEmployee, setPhotosEmployee] = useState<Employee | null>(null);
  const [pending, startTransition] = useTransition();

  const chatServiceRef = useRef<Service | null>(null);
  useEffect(() => {
    chatServiceRef.current = chatService;
  }, [chatService]);

  const visibleEmployees = useMemo(() => employees.filter((employee) => employee.nombreArtistico.toLowerCase().includes(query.toLowerCase())), [employees, query]);
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
    <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 sm:grid-cols-5">{([['equipo', 'Disponibilidad'], ['grupos', `Grupos (${groupRequests.length})`], ['activos', `Activos (${active.length})`], ['historial', 'Historial'], ['efectivo', 'Efectivo']] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`rounded-lg px-2 py-3 text-[10px] font-semibold uppercase tracking-wider ${tab === value ? "bg-[#C5A55A] text-black" : "text-zinc-500 hover:text-white"}`}>{label}</button>)}</div>
    {tab === "historial" && <label className="mb-5 block"><span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">Filtrar por empleada</span><select value={historyEmployeeId} onChange={(event) => setHistoryEmployeeId(event.target.value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A] sm:max-w-sm"><option value="all">Todas las empleadas</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombreArtistico}</option>)}</select></label>}
    {tab === "equipo" ? <section><label className="mb-5 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 focus-within:border-[#C5A55A]/70"><Search size={18} className="text-[#C5A55A]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empleada" className="w-full bg-transparent py-4 text-sm text-white outline-none placeholder:text-zinc-600" /></label><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleEmployees.map((employee) => <article key={employee.id} className={`overflow-hidden rounded-2xl border bg-zinc-950 ${employee.disponible ? "border-[#C5A55A]/55" : "border-zinc-800"}`}><div className="h-36 bg-cover bg-center" style={employee.fotoPerfilUrl ? { backgroundImage: `linear-gradient(to top, #090909, transparent), url(${employee.fotoPerfilUrl})` } : { background: "linear-gradient(135deg,#18181b,#050505)" }} /><div className="p-5"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-heading text-2xl font-semibold">{employee.nombreArtistico}</h2><p className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><MapPin size={12} />{employee.ubicacionLat ? "Ubicación recibida" : "Sin ubicación"}</p>{employee.availabilityStatus === "ocupada" && <p className="mt-2 text-xs text-[#E8D5A3]">Ocupada{employee.estimatedAvailableAt ? ` hasta ${formatAvailabilityTime(employee.estimatedAvailableAt)}` : ""}</p>}<EmployeeRatingSummary employee={employee} /></div><span className={`h-3 w-3 rounded-full ${employee.disponible ? "bg-emerald-400" : "bg-zinc-700"}`} /></div><div className="space-y-2"><button disabled={pending} onClick={() => toggleAvailability(employee)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#C5A55A] py-3 text-xs font-bold uppercase tracking-wider text-[#C5A55A] disabled:opacity-50">{employee.disponible ? <UserRoundX size={18} /> : <UserRoundCheck size={18} />}{employee.disponible ? "Marcar no disponible" : "Marcar disponible"}</button><button type="button" onClick={() => setPhotosEmployee(employee)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:border-[#C5A55A] hover:text-[#C5A55A] transition-all"><Camera size={16} />Fotos Exclusivas</button><button type="button" onClick={() => setSelectedEvaluationUser({ id: employee.usuarioId || employee.id, name: employee.nombreArtistico })} className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:border-[#C5A55A] hover:text-[#C5A55A] transition-all"><Award size={16} />Historial de Exámenes</button></div></div></article>)}</div></section> : tab === "grupos" ? <GroupServiceOrganizer initialRequests={groupRequests} /> : tab === "efectivo" ? <CashDeliveryPanel summary={cashSummary} pending={pending} run={(action) => startTransition(async () => { const result = await action(); if (!result.success) { toast.error(result.error); return; } setCashSummary(await getJefeCashObligations()); toast.success("Entrega de efectivo registrada"); })} /> : <ServiceList services={tab === "activos" ? active : filteredHistory} allServices={services} active={tab === "activos"} disabled={pending} onDecide={decide} onRequestAccept={setAcceptingService} onRequestEdit={setEditingService} onCancel={setCancellingService} onChat={openChat} onRefresh={reloadServices} />}

    {chatService && <ChatPanel service={chatService} messages={messages} setMessages={setMessages} onClose={() => setChatService(null)} />}
    {acceptingService && <AcceptServiceDialog service={acceptingService} previousService={services.find((item) => item.id === acceptingService.servicioPrevioId)} disabled={pending} onClose={() => setAcceptingService(null)} onAccept={(transport, notes) => decide(acceptingService, "aceptar", transport, notes)} />}
    {editingService && <EditPendingServiceDialog service={editingService} onClose={() => setEditingService(null)} onSaved={handleSaveServiceEdit} />}
    <CreateServiceDialog open={creatingService} onClose={() => setCreatingService(false)} initialEmployees={employees} onCreated={() => { reloadServices(); }} />
    {cancellingService && <CancelServiceDialog serviceLabel={cancellingService.empleada?.nombreArtistico || "este servicio"} disabled={pending} onConfirm={(reason, note) => cancelService(cancellingService, reason, note)} onCancel={() => setCancellingService(null)} />}
    <EvaluationHistorySheet userId={selectedEvaluationUser?.id ?? null} workerName={selectedEvaluationUser?.name} open={Boolean(selectedEvaluationUser)} onOpenChange={(open) => !open && setSelectedEvaluationUser(null)} />
    {photosEmployee && <ExclusivePhotosPanel employee={photosEmployee} onClose={() => setPhotosEmployee(null)} />}
  </>;
}

function CashDeliveryPanel({ summary, pending, run }: { summary: CashObligationSummary; pending: boolean; run: (action: () => Promise<{ success: boolean; error?: string }>) => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const money = formatCurrency;
  const groups = Object.values(summary.obligations.filter((item) => item.status === "pending").reduce<Record<string, typeof summary.obligations>>((result, item) => { (result[item.employeeId] ??= []).push(item); return result; }, {}));
  if (!groups.length) return <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">No hay entregas de efectivo pendientes.</div>;
  return <section><header className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">Control de efectivo</p><h2 className="mt-1 font-heading text-3xl">Pendiente por entregar: {money(summary.total)}</h2></header><div className="grid gap-4 lg:grid-cols-2">{groups.map((obligations) => { const employeeId = obligations[0].employeeId; const employeeName = summary.employees.find((item) => item.id === employeeId)?.name || "Empleada"; const balance = obligations.reduce((sum, item) => sum + Number(item.amount) - Number(item.paidAmount), 0); const hasProvisional = obligations.some((item) => item.calculationStatus === "provisional"); return <article key={employeeId} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><div className="flex items-center justify-between gap-4"><div><p className="font-heading text-2xl">{employeeName}</p><p className="mt-1 text-xs text-zinc-500">{obligations.length} servicios pendientes</p></div><div className="flex items-center gap-2 text-[#E8D5A3]"><Banknote size={19}/><span className="font-heading text-2xl">{money(balance)}</span></div></div><div className="mt-4 space-y-2">{obligations.map((item) => <div key={item.id} className="rounded-xl border border-zinc-900 p-3 text-xs"><div className="grid grid-cols-[1fr_auto_auto] items-center gap-3"><span>Servicio {item.serviceId.slice(-6).toUpperCase()}</span><span>{money(Number(item.amount) - Number(item.paidAmount))}</span><button disabled={pending || item.calculationStatus !== "ready"} onClick={() => run(() => closeJefeCashObligation(item.id))} className="font-semibold text-[#C5A55A] disabled:text-zinc-700">Entregado</button></div><div className="mt-2 flex justify-between text-zinc-500"><span>Total cobrado: {money(Number(item.customerTotal))}</span><span>Ubers: -{money(Number(item.uberDeduction))}</span></div>{item.calculationStatus === "provisional" && <p className="mt-2 text-amber-400">Provisional: {item.pendingReason}</p>}</div>)}</div><div className="mt-4 flex gap-2"><input disabled={hasProvisional} value={amounts[employeeId] || ""} onChange={(event) => setAmounts({...amounts, [employeeId]: event.target.value})} inputMode="decimal" placeholder={hasProvisional ? "Confirma los Ubers pendientes" : "Monto recibido"} className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm outline-none focus:border-[#C5A55A] disabled:text-zinc-700"/><button disabled={pending || hasProvisional} onClick={() => { const amount = Number(amounts[employeeId]); if (!Number.isFinite(amount) || amount <= 0) return toast.error("Ingresa un monto válido"); run(() => registerJefeCashPayment(employeeId, amount)); }} className="rounded-xl border border-[#C5A55A] px-4 text-xs font-semibold text-[#C5A55A] disabled:opacity-50">Registrar abono</button></div></article>; })}</div></section>;
}

function ServiceList({ services, allServices, active, disabled, onDecide, onRequestAccept, onRequestEdit, onCancel, onChat, onRefresh }: { services: Service[]; allServices: Service[]; active: boolean; disabled: boolean; onDecide: (service: Service, decision: "aceptar" | "rechazar", transport?: "chofer" | "uber", bossNotes?: string) => void; onRequestAccept: (service: Service) => void; onRequestEdit?: (service: Service) => void; onCancel: (service: Service) => void; onChat: (service: Service) => void; onRefresh: () => Promise<void> }) {
  if (!services.length) return <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">No hay servicios en esta sección.</div>;
  return <div className="space-y-4">{services.map((service) => { const previous = allServices.find((item) => item.id === service.servicioPrevioId); return <article key={service.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-[10px] uppercase tracking-widest text-[#C5A55A]">Servicio {service.id.slice(-6).toUpperCase()}</p>{service.tipoAgenda === "programado" && <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-300">📅 Cita Programada</span>}</div><h2 className="mt-1 font-heading text-2xl">{service.empleada?.nombreArtistico || "Empleada asignada"}</h2>{!active && service.empleada && <EmployeeRatingSummary employee={service.empleada} />}<p className="mt-1 text-xs text-zinc-500">{service.cliente?.nombreTelegram || "Cliente"} · {service.duracionPactadaHoras} horas · {service.metodoPago.toUpperCase()}</p>{service.tipoAgenda === "programado" && service.fechaProgramada && <p className="mt-1.5 text-xs font-semibold text-purple-300">📅 Cita pactada: {new Date(service.fechaProgramada).toLocaleString(APP_LOCALE, { dateStyle: "short", timeStyle: "short" })}</p>}{service.servicioPrevioId && <p className="mt-2 text-xs text-[#E8D5A3]">Después del servicio {previous?.id.slice(-6).toUpperCase() || service.servicioPrevioId.slice(-6).toUpperCase()}</p>}{service.horaInicioEstimada && service.tipoAgenda !== "programado" && <p className="mt-1 text-xs text-zinc-400">Llegada estimada: {formatAvailabilityTime(service.horaInicioEstimada)}</p>}{service.locationNameSnapshot && <p className="mt-1 text-xs text-zinc-500">Ubicación: {service.locationNameSnapshot}</p>}</div><ServiceStatusBadge status={service.estado} /></div>{service.notasJefe && <div className="mt-4 border-l-2 border-[#C5A55A]/70 bg-black/50 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C5A55A]">Notas internas</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{service.notasJefe}</p></div>}{!active && <ServiceRating service={service} />}<ReceiptEvidenceList service={service} /><div className="mt-5 flex flex-wrap gap-2">{active && service.estado === "pendiente" && <><ActionButton disabled={disabled} onClick={() => onRequestAccept(service)}><Check size={15} />Aceptar servicio</ActionButton><ActionButton outline disabled={disabled} onClick={() => onRequestEdit?.(service)}><Pencil size={15} />Editar servicio</ActionButton></>}{!active && <span className="flex items-center gap-1 text-xs text-zinc-500"><Clock3 size={14} />{new Date(service.updatedAt).toLocaleString(APP_LOCALE)}</span>}<ActionButton outline onClick={() => onChat(service)}><MessageCircle size={15} />Abrir chat</ActionButton>{active && <button type="button" disabled={disabled} onClick={() => onCancel(service)} className="flex items-center gap-2 rounded-xl border border-red-500/80 bg-red-500/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-40"><Ban size={16} />Cancelar servicio</button>}</div>{active && service.estado !== "agendado" && <TransportPanel service={service} onRefresh={onRefresh} />}</article>; })}</div>;
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
