"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  CreditCard,
  DollarSign,
  Loader2,
  MapPin,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createManualServiceAction,
  getActiveLocationsAction,
  getClientsAction,
} from "@/lib/data/services";
import type { Client, Employee, PresetServiceLocation, Service } from "@/lib/types";
import { formatCurrency } from "@/lib/calculations";

interface CreateServiceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (newService: Service) => void;
  initialEmployees?: Employee[];
  preselectedClientId?: string;
  preselectedEmployeeId?: string;
}

export default function CreateServiceDialog({
  open,
  onClose,
  onCreated,
  initialEmployees = [],
  preselectedClientId,
  preselectedEmployeeId,
}: CreateServiceDialogProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [locations, setLocations] = useState<PresetServiceLocation[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [clientMode, setClientMode] = useState<"registered" | "custom" | "anonymous">(
    preselectedClientId ? "registered" : "registered",
  );
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || "");
  const [clientFreeName, setClientFreeName] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(preselectedEmployeeId || "");
  const [durationHours, setDurationHours] = useState<number>(1);
  /**
   * Duracion abierta. Las horas pactadas siguen viajando al backend porque se
   * usan para reservar la agenda; lo que cambia es que al finalizar se cuentan
   * las reales en vez de darlas por cerradas.
   */
  const [openEnded, setOpenEnded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "tarjeta" | "transferencia">("efectivo");
  const [locationType, setLocationType] = useState<"preset" | "custom">("preset");
  const [presetLocationId, setPresetLocationId] = useState<string>("");
  const [customAddress, setCustomAddress] = useState<string>("");
  const [customLat, setCustomLat] = useState<number>(19.432608);
  const [customLng, setCustomLng] = useState<number>(-99.133209);
  const [agendaType, setAgendaType] = useState<"inmediato" | "programado">("inmediato");
  const [scheduledDateTime, setScheduledDateTime] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [clientSearch, setClientSearch] = useState<string>("");

  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    async function loadData() {
      setLoadingInitial(true);
      try {
        const [clientsRes, locsRes] = await Promise.all([
          getClientsAction(),
          getActiveLocationsAction(),
        ]);

        if (isMounted) {
          // Las acciones pueden devolver un objeto paginado o un error: nunca
          // asumimos que `data` es un array, o el render revienta con .map.
          const clientList = Array.isArray(clientsRes.data) ? clientsRes.data : [];
          const locationList = Array.isArray(locsRes.data) ? locsRes.data : [];

          setClients(clientList);
          if (preselectedClientId) {
            setSelectedClientId(preselectedClientId);
          }

          setLocations(locationList);
          if (locationList.length > 0 && !presetLocationId) {
            setPresetLocationId(locationList[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading create service data:", err);
      } finally {
        if (isMounted) setLoadingInitial(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [open, preselectedClientId, presetLocationId]);

  useEffect(() => {
    if (initialEmployees && initialEmployees.length > 0) {
      setEmployees(initialEmployees);
      if (!selectedEmployeeId) {
        setSelectedEmployeeId(preselectedEmployeeId || initialEmployees[0].id);
      }
    }
  }, [initialEmployees, preselectedEmployeeId, selectedEmployeeId]);

  const selectedEmployee = useMemo(() => {
    return employees.find((e) => e.id === selectedEmployeeId);
  }, [employees, selectedEmployeeId]);

  const hourlyRate = Number(selectedEmployee?.precioBaseHora) || 1200;
  const totalBase = hourlyRate * durationHours;

  const filteredClients = useMemo(() => {
    if (!Array.isArray(clients)) return [];
    if (!clientSearch.trim()) return clients;
    const term = clientSearch.toLowerCase();
    return clients.filter(
      (c) =>
        (c.nombreTelegram || "").toLowerCase().includes(term) ||
        (c.telegramChatId || "").includes(term) ||
        (c.telefono || "").includes(term),
    );
  }, [clients, clientSearch]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (clientMode === "registered" && !selectedClientId) {
      toast.error("Debes seleccionar un cliente registrado o cambiar la opción");
      return;
    }
    if (clientMode === "custom" && !clientFreeName.trim()) {
      toast.error("Ingresa el nombre o alias del cliente");
      return;
    }
    if (!selectedEmployeeId) {
      toast.error("Debes seleccionar una empleada");
      return;
    }

    let lat = customLat;
    let lng = customLng;
    let locationNote = customAddress.trim();

    if (locationType === "preset") {
      const preset = locations.find((l) => l.id === presetLocationId);
      if (!preset) {
        toast.error("Selecciona una ubicación predeterminada válida");
        return;
      }
      lat = Number(preset.latitude);
      lng = Number(preset.longitude);
      locationNote = preset.name + (preset.address ? ` (${preset.address})` : "");
    }

    if (agendaType === "programado" && !scheduledDateTime) {
      toast.error("Especifica la fecha y hora de la cita programada");
      return;
    }

    setSubmitting(true);
    try {
      const client = clientMode === "registered" ? clients.find((c) => c.id === selectedClientId) : undefined;

      const payload = {
        clienteId: clientMode === "registered" ? selectedClientId || undefined : undefined,
        clienteNombreLibre: clientMode === "custom" ? clientFreeName.trim() : undefined,
        empleadaId: selectedEmployeeId,
        duracionPactadaHoras: durationHours,
        duracionIndefinida: openEnded,
        metodoPago: paymentMethod,
        ubicacionClienteLat: lat,
        ubicacionClienteLng: lng,
        precioBaseHoraPactado: hourlyRate,
        notas: [locationNote, notes.trim()].filter(Boolean).join(" - "),
        tipoAgenda: agendaType,
        fechaProgramada: agendaType === "programado" ? new Date(scheduledDateTime).toISOString() : undefined,
        presetLocationId: locationType === "preset" ? presetLocationId : undefined,
        clienteTelegramId: clientMode === "registered" ? client?.telegramChatId || undefined : undefined,
      };

      const res = await createManualServiceAction(payload);
      if (res.success && res.data) {
        toast.success("¡Servicio creado exitosamente!");
        if (onCreated) onCreated(res.data);
        onClose();
      } else {
        toast.error(res.error || "No se pudo crear el servicio");
      }
    } catch (err) {
      console.error("Error creating service:", err);
      toast.error("Ocurrió un error inesperado al crear el servicio");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-[#C5A55A] border border-[#C5A55A]/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Crear Servicio Manual
              </h2>
              <p className="text-xs text-zinc-400">
                Registra un servicio nuevo para despacho o agenda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {loadingInitial ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 size={24} className="animate-spin text-[#C5A55A]" />
              <span className="text-xs">Cargando clientes y ubicaciones...</span>
            </div>
          ) : (
            <>
              {/* Cliente */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={14} className="text-[#C5A55A]" /> Cliente
                </label>

                {/* Modos de cliente: Registrado, Nombre Libre, Anónimo */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setClientMode("registered")}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-xl transition-all ${
                      clientMode === "registered"
                        ? "bg-[#C5A55A] text-zinc-950 shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    Registrado
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientMode("custom")}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-xl transition-all ${
                      clientMode === "custom"
                        ? "bg-[#C5A55A] text-zinc-950 shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    Nombre libre
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientMode("anonymous")}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-xl transition-all ${
                      clientMode === "anonymous"
                        ? "bg-[#C5A55A] text-zinc-950 shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    Sin cliente
                  </button>
                </div>

                {clientMode === "registered" && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Filtrar por nombre o ID de Telegram..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="w-full px-3.5 py-2 bg-zinc-900/90 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:border-[#C5A55A] outline-none"
                    />
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:border-[#C5A55A] outline-none"
                      required={clientMode === "registered"}
                    >
                      <option value="">-- Selecciona un cliente --</option>
                      {filteredClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombreTelegram || "Cliente sin nombre"} (Telegram: {c.telegramChatId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {clientMode === "custom" && (
                  <div className="space-y-1">
                    <input
                      type="text"
                      placeholder="Nombre o alias del cliente (ej. Juan Pérez)..."
                      value={clientFreeName}
                      onChange={(e) => setClientFreeName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:border-[#C5A55A] outline-none"
                      required={clientMode === "custom"}
                    />
                    <p className="text-[11px] text-zinc-500">
                      Se guardará con este nombre sin vincular a una cuenta de Telegram.
                    </p>
                  </div>
                )}

                {clientMode === "anonymous" && (
                  <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-400">
                    El servicio se creará como anónimo (sin cliente registrado).
                  </div>
                )}
              </div>

              {/* Empleada */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#C5A55A]" /> Empleada
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:border-[#C5A55A] outline-none"
                  required
                >
                  {(Array.isArray(employees) ? employees : []).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombreArtistico} - ${emp.precioBaseHora}/hr {emp.disponible ? "(🟢 Disponible)" : "(🔴 Ocupada)"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Duración y Método de Pago */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Duración: atajos frecuentes, campo libre e indefinido */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={14} className="text-[#C5A55A]" /> Duración
                  </label>

                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          setOpenEnded(false);
                          setDurationHours(h);
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                          !openEnded && durationHours === h
                            ? "bg-[#C5A55A] text-zinc-950 shadow-md shadow-amber-500/20"
                            : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        {h} {h === 1 ? "hr" : "hrs"}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={openEnded ? "" : durationHours}
                      disabled={openEnded}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value)) setDurationHours(value);
                      }}
                      placeholder="Otra cantidad"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-[#C5A55A] disabled:text-zinc-600"
                    />
                    <span className="text-xs text-zinc-500">horas</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenEnded(!openEnded)}
                    className={`w-full rounded-xl py-2 text-xs font-bold transition-all ${
                      openEnded
                        ? "bg-[#C5A55A] text-zinc-950 shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    Tiempo indefinido
                  </button>

                  {openEnded && (
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      Las horas se cuentan al finalizar el servicio y se
                      redondean hacia arriba a partir de los 15 minutos. Se
                      reservan {durationHours}{" "}
                      {durationHours === 1 ? "hora" : "horas"} en la agenda como
                      estimacion inicial.
                    </p>
                  )}
                </div>

                {/* Método de Pago */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard size={14} className="text-[#C5A55A]" /> Método de Pago
                  </label>
                  <div className="flex gap-2">
                    {(
                      [
                        ["efectivo", "Efectivo"],
                        ["transferencia", "Transferencia"],
                        ["tarjeta", "Tarjeta"],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPaymentMethod(val)}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                          paymentMethod === val
                            ? "bg-[#C5A55A] text-zinc-950 shadow-md shadow-amber-500/20"
                            : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Ubicación */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={14} className="text-[#C5A55A]" /> Ubicación del Servicio
                  </label>
                  <div className="flex gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setLocationType("preset")}
                      className={`px-3 py-1 rounded-lg font-medium transition-all ${
                        locationType === "preset"
                          ? "bg-[#C5A55A] text-zinc-950 font-bold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      Motel del Sistema
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocationType("custom")}
                      className={`px-3 py-1 rounded-lg font-medium transition-all ${
                        locationType === "custom"
                          ? "bg-[#C5A55A] text-zinc-950 font-bold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      Domicilio / Externa
                    </button>
                  </div>
                </div>

                {locationType === "preset" ? (
                  <select
                    value={presetLocationId}
                    onChange={(e) => setPresetLocationId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:border-[#C5A55A] outline-none"
                    required
                  >
                    {(Array.isArray(locations) ? locations : []).map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        🏨 {loc.name} {loc.address ? `(${loc.address})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Dirección o punto de encuentro..."
                      value={customAddress}
                      onChange={(e) => setCustomAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:border-[#C5A55A] outline-none"
                      required
                    />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <input
                        type="number"
                        step="any"
                        placeholder="Latitud"
                        value={customLat}
                        onChange={(e) => setCustomLat(parseFloat(e.target.value) || 0)}
                        className="px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg text-zinc-300 outline-none"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="Longitud"
                        value={customLng}
                        onChange={(e) => setCustomLng(parseFloat(e.target.value) || 0)}
                        className="px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg text-zinc-300 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Agenda (Inmediato vs Programado) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-[#C5A55A]" /> Tipo de Agenda
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAgendaType("inmediato")}
                    className={`py-2.5 px-3 text-xs font-bold rounded-xl border transition-all ${
                      agendaType === "inmediato"
                        ? "bg-[#C5A55A] text-zinc-950 border-[#C5A55A]"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    ⚡ Inmediato (Para Ya)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgendaType("programado")}
                    className={`py-2.5 px-3 text-xs font-bold rounded-xl border transition-all ${
                      agendaType === "programado"
                        ? "bg-[#C5A55A] text-zinc-950 border-[#C5A55A]"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    📅 Cita Programada
                  </button>
                </div>

                {agendaType === "programado" && (
                  <div className="pt-2 animate-in fade-in duration-150">
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:border-[#C5A55A] outline-none"
                      required={agendaType === "programado"}
                    />
                  </div>
                )}
              </div>

              {/* Notas */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Notas / Observaciones
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales, referencias de llegada o peticiones especiales..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:border-[#C5A55A] outline-none resize-none"
                />
              </div>

              {/* Resumen de Total */}
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-400">
                    {openEnded ? "Estimado inicial:" : "Total Base del Servicio:"}
                  </span>
                  <p className="text-xs text-zinc-300">
                    {formatCurrency(hourlyRate)}/hr × {durationHours}{" "}
                    {durationHours === 1 ? "hora" : "horas"}
                  </p>
                  {openEnded && (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      El total definitivo sale de las horas reales al cerrar.
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-[#C5A55A]">
                    {formatCurrency(totalBase)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || loadingInitial || !selectedClientId || !selectedEmployeeId}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-zinc-950 bg-[#C5A55A] hover:bg-[#d8b769] shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Creando servicio...</span>
                </>
              ) : (
                <>
                  <DollarSign size={14} />
                  <span>Confirmar y Crear Servicio</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
