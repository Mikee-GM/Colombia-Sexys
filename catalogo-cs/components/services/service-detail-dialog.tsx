"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  Camera,
  Car,
  Check,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileCheck2,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Pencil,
  Send,
  Smartphone,
  Star,
  Upload,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import ServiceStatusBadge from "./service-status-badge";
import { formatAvailabilityTime } from "@/lib/availability";
import type { ConversationMessage, Service, Trip } from "@/lib/types";
import {
  cancelServiceAction,
  changeTripTransportAction,
  chooseReturnTransportAction,
  confirmUberFareAction,
  decideServiceAction,
  getServiceByIdAction,
  getServiceMessagesAction,
  sendServiceMessageAction,
  updateServiceAction,
  uploadUberScreenshotAction,
} from "@/lib/data/services";

interface ServiceDetailDialogProps {
  service: Service | null;
  allServices?: Service[];
  onClose: () => void;
  onUpdated: () => void;
}

export default function ServiceDetailDialog({
  service: initialService,
  allServices = [],
  onClose,
  onUpdated,
}: ServiceDetailDialogProps) {
  const [service, setService] = useState<Service | null>(initialService);
  const [activeTab, setActiveTab] = useState<"detalles" | "chat" | "transporte">("detalles");
  const [editing, setEditing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);

  // Edit form state
  const [duracion, setDuracion] = useState(1);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | "mixto">("efectivo");
  const [notas, setNotas] = useState("");
  const [notasJefe, setNotasJefe] = useState("");

  // Accept state
  const [bossNotes, setBossNotes] = useState("");

  // Chat state
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [messageText, setMessageText] = useState("");

  useEffect(() => {
    setService(initialService);
  }, [initialService]);

  useEffect(() => {
    if (service) {
      setDuracion(Number(service.duracionPactadaHoras) || 1);
      setMetodoPago(service.metodoPago as any || "efectivo");
      setNotas(service.notas || "");
      setNotasJefe(service.notasJefe || "");
      setEditing(false);
      setAccepting(false);
      setBossNotes("");
    }
  }, [service]);

  useEffect(() => {
    if (service && activeTab === "chat") {
      setChatLoading(true);
      getServiceMessagesAction(service.id)
        .then(setMessages)
        .catch(() => toast.error("No se pudieron cargar los mensajes del chat"))
        .finally(() => setChatLoading(false));
    }
  }, [service, activeTab]);

  if (!service) return null;

  const reloadCurrentService = async () => {
    if (!service?.id) return;
    try {
      const res = await getServiceByIdAction(service.id);
      if (res.success && res.data) {
        setService(res.data);
      }
    } catch (err) {
      console.error("Error reloading service detail:", err);
    }
    onUpdated();
  };

  const previous = allServices.find((item) => item.id === service.servicioPrevioId);
  const receipts = (service.receiptValidations ?? []).filter((item) => item.imageUrl);
  const trips = service.viajes || [];

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPendingAction(true);
    try {
      const res = await updateServiceAction(service.id, {
        duracionPactadaHoras: duracion,
        metodoPago,
        notas: notas.trim() || undefined,
        notasJefe: notasJefe.trim() || undefined,
      });
      if (!res.success) {
        throw new Error(res.error || "Error al actualizar");
      }
      toast.success("Servicio actualizado con éxito");
      setEditing(false);
      await reloadCurrentService();
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar el servicio");
    } finally {
      setPendingAction(false);
    }
  };

  const handleDecide = async (decision: "aceptar" | "rechazar", transportType: "chofer" | "uber" = "chofer") => {
    setPendingAction(true);
    try {
      const res = await decideServiceAction(service.id, decision, transportType, bossNotes);
      if (!res.success) {
        throw new Error(res.error || "Error al procesar acción");
      }
      toast.success(decision === "aceptar" ? "Servicio aceptado" : "Servicio rechazado");
      setAccepting(false);
      await reloadCurrentService();
    } catch (err: any) {
      toast.error(err.message || "Error al procesar");
    } finally {
      setPendingAction(false);
    }
  };

  const handleCancelService = async () => {
    if (!window.confirm("¿Confirmas que deseas cancelar este servicio?")) return;
    setPendingAction(true);
    try {
      const res = await cancelServiceAction(service.id);
      if (!res.success) {
        throw new Error(res.error || "Error al cancelar");
      }
      toast.success("Servicio cancelado");
      await reloadCurrentService();
    } catch (err: any) {
      toast.error(err.message || "No se pudo cancelar el servicio");
    } finally {
      setPendingAction(false);
    }
  };

  const handleSendMessage = async () => {
    const text = messageText.trim();
    if (!text) return;
    try {
      const res = await sendServiceMessageAction(service.id, text);
      if (!res.success || !res.data) {
        throw new Error(res.error || "No se pudo enviar");
      }
      setMessages((prev) => [...prev, res.data!]);
      setMessageText("");
    } catch (err: any) {
      toast.error(err.message || "Error al enviar mensaje");
    }
  };

  const senderPresentation: Record<ConversationMessage["emisor"], { label: string; className: string }> = {
    cliente: { label: "Cliente", className: "bg-zinc-900 text-zinc-200" },
    ia: { label: "Asistente IA", className: "ml-auto border border-[#C5A55A]/35 bg-[#C5A55A]/10 text-[#E8D5A3]" },
    sistema: { label: "Sistema", className: "mx-auto border border-zinc-800 bg-black text-zinc-400" },
    jefe: { label: "Administración / Jefe", className: "ml-auto bg-[#C5A55A] text-black" },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && !pendingAction && onClose()}
    >
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-black/40">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#C5A55A]">
                SERVICIO #{service.id.slice(-6).toUpperCase()}
              </span>
              <ServiceStatusBadge status={service.estado} />
              {service.tipoAgenda === "programado" && (
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  📅 Cita Programada
                </span>
              )}
            </div>
            <h2 className="text-xl font-heading font-semibold text-white mt-1">
              {service.empleada?.nombreArtistico || "Sin empleada asignada"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white rounded-xl hover:bg-zinc-900 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 bg-black/20 px-6 gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("detalles")}
            className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === "detalles"
                ? "border-[#C5A55A] text-[#E8D5A3]"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Detalles & Acciones
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === "chat"
                ? "border-[#C5A55A] text-[#E8D5A3]"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <MessageCircle size={14} />
            Chat Telegram
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("transporte")}
            className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === "transporte"
                ? "border-[#C5A55A] text-[#E8D5A3]"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Car size={14} />
            Transporte ({trips.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "detalles" && (
            <>
              {/* Botonera de acciones rápidas principales */}
              <div className="flex flex-wrap gap-2 p-4 rounded-2xl border border-zinc-800/80 bg-black/40">
                {service.estado === "pendiente" && (
                  <>
                    <button
                      type="button"
                      disabled={pendingAction}
                      onClick={() => setAccepting(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#C5A55A] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-black hover:bg-[#D4AF37] transition-all disabled:opacity-50"
                    >
                      <Check size={16} /> Aceptar Servicio
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction}
                      onClick={() => handleDecide("rechazar")}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                    >
                      <Ban size={16} /> Rechazar Servicio
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={pendingAction}
                  onClick={() => setEditing(!editing)}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:border-[#C5A55A] hover:text-[#E8D5A3] transition-all disabled:opacity-50"
                >
                  <Pencil size={15} /> {editing ? "Cerrar Edición" : "Editar Datos"}
                </button>

                {service.estado !== "cancelado" && service.estado !== "finalizado" && (
                  <button
                    type="button"
                    disabled={pendingAction}
                    onClick={handleCancelService}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-950 bg-red-950/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-900/40 transition-all disabled:opacity-50 ml-auto"
                  >
                    <Ban size={15} /> Cancelar
                  </button>
                )}
              </div>

              {/* Formulario de Aceptación con Selección de Transporte */}
              {accepting && (
                <div className="rounded-2xl border border-[#C5A55A]/50 bg-black/60 p-5 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-lg text-white">Aceptar Servicio</h3>
                    <button
                      type="button"
                      onClick={() => setAccepting(false)}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">
                      Notas Internas para la Empleada (Opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={bossNotes}
                      onChange={(e) => setBossNotes(e.target.value)}
                      placeholder="Instrucciones especiales, código de acceso..."
                      className="w-full bg-black border border-zinc-800 px-4 py-2 rounded-xl text-sm text-white focus:border-[#C5A55A] outline-none resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      disabled={pendingAction}
                      onClick={() => handleDecide("aceptar", "chofer")}
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#C5A55A] py-3 text-xs font-bold uppercase tracking-wider text-black hover:bg-[#D4AF37] transition-all disabled:opacity-50"
                    >
                      <Car size={16} /> Aceptar con Chofer Interno
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction}
                      onClick={() => handleDecide("aceptar", "uber")}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#C5A55A] py-3 text-xs font-bold uppercase tracking-wider text-[#C5A55A] hover:bg-[#C5A55A]/10 transition-all disabled:opacity-50"
                    >
                      <Smartphone size={16} /> Aceptar con Uber
                    </button>
                  </div>
                </div>
              )}

              {/* Formulario de Edición */}
              {editing && (
                <form onSubmit={handleSaveEdit} className="rounded-2xl border border-zinc-800 bg-black/60 p-5 space-y-4 animate-in fade-in">
                  <h3 className="font-heading text-lg text-white">Editar Información del Servicio</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">
                        Duración Pactada (Horas)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={duracion}
                        onChange={(e) => setDuracion(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-black border border-zinc-800 px-4 py-2.5 rounded-xl text-white outline-none focus:border-[#C5A55A]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">
                        Método de Pago
                      </label>
                      <select
                        value={metodoPago}
                        onChange={(e) => setMetodoPago(e.target.value as any)}
                        className="w-full bg-black border border-zinc-800 px-4 py-2.5 rounded-xl text-white outline-none focus:border-[#C5A55A]"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="mixto">Mixto</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">
                      Notas / Instrucciones del Cliente
                    </label>
                    <textarea
                      rows={2}
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Instrucciones del cliente..."
                      className="w-full bg-black border border-zinc-800 px-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-[#C5A55A] resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#C5A55A] mb-1">
                      Notas Internas de Administración / Jefe
                    </label>
                    <textarea
                      rows={2}
                      value={notasJefe}
                      onChange={(e) => setNotasJefe(e.target.value)}
                      placeholder="Notas internas..."
                      className="w-full bg-black border border-zinc-800 px-4 py-2.5 rounded-xl text-sm text-white outline-none focus:border-[#C5A55A] resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      disabled={pendingAction}
                      className="px-4 py-2 border border-zinc-800 rounded-xl text-xs font-bold uppercase text-zinc-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={pendingAction}
                      className="px-6 py-2 bg-[#C5A55A] text-black rounded-xl text-xs font-bold uppercase hover:bg-[#D4AF37] disabled:opacity-50"
                    >
                      {pendingAction ? "Guardando..." : "Guardar Cambios"}
                    </button>
                  </div>
                </form>
              )}

              {/* Grid de Información Detallada */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bloque Cliente & Ubicación */}
                <div className="rounded-2xl border border-zinc-800/80 bg-black/40 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#C5A55A] flex items-center gap-1.5">
                    <User size={14} /> Datos del Cliente & Ubicación
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">Nombre / Telegram:</span>{" "}
                      {service.cliente?.nombreTelegram || "Cliente sin nombre"}
                    </p>
                    {service.cliente?.telefono && (
                      <p className="text-zinc-300">
                        <span className="text-zinc-500">Teléfono:</span> {service.cliente.telefono}
                      </p>
                    )}
                    {service.locationNameSnapshot && (
                      <p className="text-zinc-300 flex items-start gap-1">
                        <MapPin size={14} className="mt-0.5 text-[#C5A55A] shrink-0" />
                        <span>{service.locationNameSnapshot}</span>
                      </p>
                    )}
                    {service.locationAddressSnapshot && (
                      <p className="text-xs text-zinc-400 pl-4">
                        {service.locationAddressSnapshot}
                      </p>
                    )}
                    {service.tipoAgenda === "programado" && service.fechaProgramada && (
                      <p className="text-xs text-purple-300 font-medium flex items-center gap-1">
                        <Clock3 size={13} className="text-purple-400 shrink-0" />
                        Cita pactada: {new Date(service.fechaProgramada).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    )}
                    {service.horaInicioEstimada && service.tipoAgenda !== "programado" && (
                      <p className="text-xs text-zinc-400 flex items-center gap-1">
                        <Clock3 size={13} className="text-zinc-500" />
                        Llegada estimada: {formatAvailabilityTime(service.horaInicioEstimada)}
                      </p>
                    )}
                    {service.servicioPrevioId && (
                      <p className="text-xs text-[#E8D5A3]">
                        Servicio en cadena: después del #{previous?.id.slice(-6).toUpperCase() || service.servicioPrevioId.slice(-6).toUpperCase()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bloque Económico */}
                <div className="rounded-2xl border border-zinc-800/80 bg-black/40 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#C5A55A] flex items-center gap-1.5">
                    <CircleDollarSign size={14} /> Resumen de Cobro & Pago
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Duración:</span>
                      <span className="text-zinc-200 font-semibold">{service.duracionPactadaHoras} horas</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Método de Pago:</span>
                      <span className="text-zinc-200 font-semibold uppercase">{service.metodoPago}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Tarifa Base:</span>
                      <span className="text-zinc-200">${parseFloat(service.totalBase || "0").toLocaleString()}</span>
                    </div>
                    {parseFloat(service.totalExtras || "0") > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Extras:</span>
                        <span className="text-zinc-200">${parseFloat(service.totalExtras || "0").toLocaleString()}</span>
                      </div>
                    )}
                    {parseFloat(service.totalTransporte || "0") > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Transporte Cliente:</span>
                        <span className="text-zinc-200">${parseFloat(service.totalTransporte || "0").toLocaleString()}</span>
                      </div>
                    )}
                    <div className="border-t border-zinc-800 pt-2 flex justify-between items-center">
                      <span className="font-bold text-white">Total Final:</span>
                      <span className="text-base font-bold text-[#E8D5A3]">
                        ${parseFloat(service.totalFinal || "0").toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notas del Servicio */}
              {(service.notas || service.notasJefe) && (
                <div className="space-y-3">
                  {service.notas && (
                    <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Instrucciones del Cliente
                      </p>
                      <p className="mt-1 text-sm text-zinc-200 whitespace-pre-wrap">{service.notas}</p>
                    </div>
                  )}
                  {service.notasJefe && (
                    <div className="rounded-2xl border border-[#C5A55A]/30 bg-[#C5A55A]/5 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C5A55A]">
                        Notas Internas
                      </p>
                      <p className="mt-1 text-sm text-zinc-200 whitespace-pre-wrap">{service.notasJefe}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Sección de Traslados Uber con Capturas y Tarifas */}
              {trips.some((t) => t.proveedorTransporte === "uber") && (
                <div className="rounded-2xl border border-[#C5A55A]/30 bg-black/40 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#C5A55A] flex items-center gap-1.5">
                      <Car size={14} /> Traslados Uber & Capturas
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("transporte")}
                      className="text-[11px] text-[#E8D5A3] hover:underline font-bold"
                    >
                      Ver en pestaña Transporte →
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {trips
                      .filter((t) => t.proveedorTransporte === "uber")
                      .map((trip) => (
                        <AdminTripCard
                          key={trip.id}
                          trip={trip}
                          service={service}
                          onRefresh={reloadCurrentService}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Comprobantes de Transferencia */}
              {receipts.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#C5A55A]">
                    <FileCheck2 size={14} /> Comprobantes de Pago Registrados
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {receipts.map((receipt, idx) => (
                      <a
                        key={receipt.id}
                        href={receipt.imageUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-[#C5A55A] hover:text-[#E8D5A3] transition-colors"
                      >
                        Comprobante {idx + 1} ({receipt.estado || "sin estado"})
                        <ExternalLink size={12} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Calificación del Cliente */}
              {service.calificacion != null && (
                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Valoración del Cliente
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <Star
                        key={val}
                        size={16}
                        className={val <= service.calificacion! ? "fill-[#C5A55A] text-[#C5A55A]" : "text-zinc-700"}
                      />
                    ))}
                    <span className="ml-2 text-sm font-bold text-[#E8D5A3]">{service.calificacion}/5</span>
                  </div>
                  {service.comentariosCalificacion && (
                    <blockquote className="mt-2 text-xs italic text-zinc-300 border-l border-zinc-700 pl-3">
                      &ldquo;{service.comentariosCalificacion}&rdquo;
                    </blockquote>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === "chat" && (
            <div className="flex flex-col h-[450px] rounded-2xl border border-zinc-800 bg-black/50 overflow-hidden">
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {chatLoading ? (
                  <p className="py-12 text-center text-xs text-zinc-500">Cargando mensajes...</p>
                ) : messages.length === 0 ? (
                  <p className="py-12 text-center text-xs text-zinc-600">No hay mensajes en esta conversación.</p>
                ) : (
                  messages.map((msg) => {
                    const pres = senderPresentation[msg.emisor] || senderPresentation.sistema;
                    return (
                      <div key={msg.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs ${pres.className}`}>
                        <p className="mb-1 text-[9px] font-bold uppercase tracking-wider opacity-60">
                          {pres.label}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.mensaje}</p>
                        <p className="mt-1 text-right text-[8px] opacity-40">
                          {new Date(msg.enviadoAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
              {/* Chat Input */}
              <div className="flex gap-2 border-t border-zinc-800 bg-black/40 p-3">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  rows={1}
                  maxLength={4000}
                  placeholder="Escribe una respuesta para enviar a Telegram..."
                  className="min-h-11 flex-1 resize-none rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#C5A55A]"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  className="rounded-xl bg-[#C5A55A] px-4 text-black font-bold hover:bg-[#D4AF37] transition-all"
                  aria-label="Enviar"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          )}

          {activeTab === "transporte" && (
            <div className="space-y-4">
              {trips.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center text-xs text-zinc-500">
                  No hay viajes de transporte generados para este servicio.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {trips.map((trip) => (
                    <AdminTripCard
                      key={trip.id}
                      trip={trip}
                      service={service}
                      onRefresh={reloadCurrentService}
                    />
                  ))}
                </div>
              )}

              {/* Botón para solicitar regreso si está pendiente */}
              {service.estadoLiquidacion === "transporte_pendiente" && !trips.some((t) => t.tipo === "regreso") && (
                <div className="rounded-2xl border border-[#C5A55A]/40 bg-[#C5A55A]/5 p-4 space-y-3">
                  <p className="text-xs font-bold text-[#E8D5A3] uppercase tracking-wider">
                    Transporte de regreso pendiente
                  </p>
                  <p className="text-xs text-zinc-400">
                    El servicio ha finalizado pero no se ha asignado el transporte de retorno de la modelo.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pendingAction}
                      onClick={async () => {
                        setPendingAction(true);
                        const res = await chooseReturnTransportAction(service.id, "chofer");
                        setPendingAction(false);
                        if (!res.success) toast.error(res.error);
                        else {
                          toast.success("Regreso asignado con chofer");
                          await reloadCurrentService();
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-[#C5A55A] text-black font-bold text-xs uppercase"
                    >
                      Regreso con Chofer
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction}
                      onClick={async () => {
                        setPendingAction(true);
                        const res = await chooseReturnTransportAction(service.id, "uber");
                        setPendingAction(false);
                        if (!res.success) toast.error(res.error);
                        else {
                          toast.success("Regreso asignado con Uber");
                          await reloadCurrentService();
                        }
                      }}
                      className="px-4 py-2 rounded-xl border border-[#C5A55A] text-[#C5A55A] font-bold text-xs uppercase"
                    >
                      Regreso con Uber
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-zinc-800 bg-black/40">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-900 hover:text-white transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminTripCard({
  trip,
  service,
  onRefresh,
}: {
  trip: Trip;
  service: Service;
  onRefresh: () => void;
}) {
  const [editingFare, setEditingFare] = useState(false);
  const [fare, setFare] = useState(String(trip.tarifa || ""));
  const [savingFare, setSavingFare] = useState(false);
  const [changingTransport, setChangingTransport] = useState(false);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isIda = trip.tipo === "ida";
  const pickupLat = isIda ? service?.empleada?.ubicacionLat : service?.ubicacionClienteLat;
  const pickupLng = isIda ? service?.empleada?.ubicacionLng : service?.ubicacionClienteLng;
  const dropoffLat = isIda ? service?.ubicacionClienteLat : service?.empleada?.ubicacionLat;
  const dropoffLng = isIda ? service?.ubicacionClienteLng : service?.empleada?.ubicacionLng;

  let uberDeeplink = "https://m.uber.com/ul/?action=setPickup";
  if (pickupLat && pickupLng) {
    uberDeeplink += `&pickup[latitude]=${pickupLat}&pickup[longitude]=${pickupLng}`;
  } else {
    uberDeeplink += "&pickup=my_location";
  }
  if (dropoffLat && dropoffLng) {
    uberDeeplink += `&dropoff[latitude]=${dropoffLat}&dropoff[longitude]=${dropoffLng}`;
  }

  const handleSaveFare = async () => {
    const amount = Number(fare);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Ingresa una tarifa válida");
      return;
    }
    setSavingFare(true);
    const res = await confirmUberFareAction(trip.id, amount);
    setSavingFare(false);
    if (!res.success) {
      toast.error(res.error || "No se pudo guardar la tarifa");
      return;
    }
    setEditingFare(false);
    toast.success("Tarifa confirmada");
    onRefresh();
  };

  const handleUploadScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingScreenshot(true);
    try {
      const formData = new FormData();
      formData.append("tripId", trip.id);
      formData.append("file", file);
      const res = await uploadUberScreenshotAction(formData);
      if (!res.success) {
        throw new Error(res.error || "Error al subir la captura");
      }
      toast.success("Captura de Uber registrada con éxito");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "No se pudo subir la captura");
    } finally {
      setUploadingScreenshot(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleChangeTransport = async () => {
    const target = trip.proveedorTransporte === "uber" ? "chofer" : "uber";
    setChangingTransport(true);
    const res = await changeTripTransportAction(trip.id, target);
    setChangingTransport(false);
    if (!res.success) {
      toast.error(res.error || "No se pudo cambiar transporte");
      return;
    }
    toast.success(`Cambiado a ${target}`);
    onRefresh();
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/60 p-4 space-y-3.5 shadow-md">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="p-2 bg-[#C5A55A]/10 text-[#C5A55A] rounded-xl border border-[#C5A55A]/20">
            <Car size={16} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-100">
              Viaje de {trip.tipo}
            </p>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase">{trip.proveedorTransporte}</p>
          </div>
        </div>
        <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full border border-zinc-700 text-zinc-300">
          {trip.estado}
        </span>
      </div>

      {trip.proveedorTransporte === "uber" ? (
        <div className="space-y-3">
          <a
            href={uberDeeplink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#C5A55A] py-2.5 text-xs font-bold uppercase tracking-wider text-black hover:bg-[#D4AF37] transition-all shadow-sm"
          >
            <Smartphone size={15} /> Abrir / Pedir Uber
          </a>

          {/* Sección de Captura de Pantalla */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={uploadingScreenshot}
              onChange={handleUploadScreenshot}
              className="hidden"
              id={`uber-screenshot-${trip.id}`}
            />

            {trip.uberScreenshotUrl ? (
              <div className="rounded-xl border border-[#C5A55A]/40 bg-[#C5A55A]/5 p-3 text-xs space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#E8D5A3] font-bold flex items-center gap-1.5">
                    <Camera size={14} className="text-[#C5A55A]" /> Captura Registrada
                  </span>
                  <a
                    href={trip.uberScreenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#C5A55A] hover:underline flex items-center gap-1 font-bold bg-[#C5A55A]/10 px-2.5 py-1 rounded-lg border border-[#C5A55A]/30 text-xs"
                  >
                    Ver Captura <ExternalLink size={11} />
                  </a>
                </div>
                <div className="pt-2 border-t border-zinc-800/80 flex justify-end">
                  <label
                    htmlFor={`uber-screenshot-${trip.id}`}
                    className="text-[11px] font-semibold text-zinc-400 hover:text-[#C5A55A] cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <Upload size={12} /> {uploadingScreenshot ? "Subiendo..." : "Reemplazar captura"}
                  </label>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/80 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
                    <Camera size={14} className="text-[#C5A55A]" /> Captura de Uber
                  </span>
                  <span className="text-[10px] text-amber-400 font-bold uppercase bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                    Pendiente
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Sube el comprobante o captura del viaje de Uber.
                </p>
                <label
                  htmlFor={`uber-screenshot-${trip.id}`}
                  className={`flex items-center justify-center gap-2 w-full rounded-xl border border-[#C5A55A]/50 bg-[#C5A55A]/10 py-2 text-xs font-bold uppercase tracking-wider text-[#E8D5A3] hover:bg-[#C5A55A]/20 transition-all cursor-pointer ${
                    uploadingScreenshot ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <Upload size={14} />
                  {uploadingScreenshot ? "Subiendo captura..." : "Subir Captura"}
                </label>
              </div>
            )}
          </div>

          {/* Sección de Tarifa Uber */}
          {editingFare ? (
            <div className="flex gap-2">
              <input
                type="number"
                value={fare}
                onChange={(e) => setFare(e.target.value)}
                placeholder="Monto Uber"
                className="flex-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#C5A55A]"
              />
              <button
                type="button"
                disabled={savingFare}
                onClick={handleSaveFare}
                className="px-3.5 py-2 bg-[#C5A55A] text-black font-bold text-xs rounded-xl hover:bg-[#D4AF37]"
              >
                {savingFare ? "..." : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditingFare(false)}
                className="px-2 py-2 text-zinc-400 text-xs hover:text-white"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-900">
              <span className="text-zinc-400">Tarifa Uber:</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#E8D5A3] text-sm">
                  {Number(trip.tarifa) > 0 ? `$${Number(trip.tarifa).toFixed(2)}` : "Sin registrar"}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingFare(true)}
                  className="text-[#C5A55A] hover:underline text-xs font-bold"
                >
                  {Number(trip.tarifa) > 0 ? "Cambiar" : "+ Registrar Tarifa"}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={changingTransport}
            onClick={handleChangeTransport}
            className="w-full text-center text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-[#C5A55A] pt-1 transition-colors"
          >
            Cambiar a Chofer Interno
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs text-zinc-400">
            Gestionado por Chofer Interno de la flota.
          </p>
          <button
            type="button"
            disabled={changingTransport}
            onClick={handleChangeTransport}
            className="w-full text-center text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-[#C5A55A] pt-1 transition-colors"
          >
            Cambiar a Uber
          </button>
        </div>
      )}
    </div>
  );
}
