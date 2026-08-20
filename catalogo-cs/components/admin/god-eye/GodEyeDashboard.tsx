"use client";

import {
  Activity,
  AlertTriangle,
  Award,
  Banknote,
  Briefcase,
  Calendar,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Coins,
  CreditCard,
  DollarSign,
  Eye,
  FileCheck,
  Flame,
  GraduationCap,
  HelpCircle,
  Layers,
  MapPin,
  MessageSquare,
  PauseCircle,
  Percent,
  Phone,
  PlayCircle,
  Radio,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import {
  getGodEyeOverviewAction,
  getGodEyeActorsAction,
  getGodEyeActorDossierAction,
  getIncidentRootCauseAction,
  pauseServiceAiAction,
  resumeServiceAiAction,
  sendAdminChatMessageAction,
  updateActorQuickSettingsAction,
  type GodEyeOverview,
  type GodEyeActorSummary,
  type GodEyeActorDossier,
  type IncidentRootCause,
} from "@/lib/actions/god-eye";
import {
  createSanction,
  revokeSanction,
  resolveAppeal,
  getPendingAppeals,
  type RatingAppeal,
} from "@/lib/actions/discipline";

interface Props {
  initialOverview: GodEyeOverview;
  initialActors: GodEyeActorSummary;
  initialAppeals: RatingAppeal[];
}

export default function GodEyeDashboard({
  initialOverview,
  initialActors,
  initialAppeals,
}: Props) {
  const [overview, setOverview] = useState<GodEyeOverview>(initialOverview);
  const [actors, setActors] = useState<GodEyeActorSummary>(initialActors);
  const [appeals, setAppeals] = useState<RatingAppeal[]>(initialAppeals);

  // Actor seleccionado
  const [actorTab, setActorTab] = useState<"employee" | "driver" | "boss">(
    "employee",
  );
  const [actorSearchQuery, setActorSearchQuery] = useState("");
  const [selectedActorId, setSelectedActorId] = useState<string | null>(
    initialActors.employees[0]?.id || null,
  );
  const [dossier, setDossier] = useState<GodEyeActorDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  // Sub-pestaña para expediente 360°
  const [dossierSection, setDossierSection] = useState<
    "services" | "finances" | "onboarding" | "photos_challenges" | "reputation"
  >("services");
  const [serviceStatusFilter, setServiceStatusFilter] = useState<
    "all" | "active" | "completed" | "cancelled"
  >("all");

  const cleanSearch = actorSearchQuery.trim().toLowerCase();
  const filteredEmployees = actors.employees.filter(
    (emp) =>
      !cleanSearch ||
      emp.name.toLowerCase().includes(cleanSearch) ||
      (emp.jefeEmail && emp.jefeEmail.toLowerCase().includes(cleanSearch)),
  );
  const filteredDrivers = actors.drivers.filter(
    (drv) =>
      !cleanSearch ||
      drv.name.toLowerCase().includes(cleanSearch) ||
      (drv.telefono && drv.telefono.toLowerCase().includes(cleanSearch)) ||
      (drv.vehiculoModelo && drv.vehiculoModelo.toLowerCase().includes(cleanSearch)),
  );
  const filteredBosses = actors.bosses.filter(
    (boss) =>
      !cleanSearch ||
      boss.name.toLowerCase().includes(cleanSearch) ||
      (boss.email && boss.email.toLowerCase().includes(cleanSearch)) ||
      (boss.rol && boss.rol.toLowerCase().includes(cleanSearch)),
  );

  // Servicio / Incidente seleccionado para investigación causal
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    initialOverview.activeServices[0]?.id || null,
  );
  const [incidentData, setIncidentData] = useState<IncidentRootCause | null>(
    null,
  );
  const [loadingIncident, setLoadingIncident] = useState(false);

  // Chat Interceptor
  const [adminMessage, setAdminMessage] = useState("");
  const [asIdentity, setAsIdentity] = useState<"empleada" | "jefe" | "ia">(
    "jefe",
  );

  // Modal de sanción
  const [showSanctionModal, setShowSanctionModal] = useState(false);
  const [sanctionType, setSanctionType] = useState<
    "suspension" | "permanent_ban" | "fine"
  >("suspension");
  const [sanctionReason, setSanctionReason] = useState("");
  const [sanctionHours, setSanctionHours] = useState(24);
  const [sanctionFineAmount, setSanctionFineAmount] = useState<number | "">(500);

  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const notify = (msg: string, type: "success" | "error" = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Cargar expediente del actor
  const loadDossier = async (
    type: "employee" | "driver" | "boss",
    id: string,
  ) => {
    setSelectedActorId(id);
    setLoadingDossier(true);
    try {
      const data = await getGodEyeActorDossierAction(type, id);
      setDossier(data);
    } catch (err: any) {
      notify(err.message || "Error al cargar expediente", "error");
    } finally {
      setLoadingDossier(false);
    }
  };

  // Cargar análisis causal de servicio
  const loadIncident = async (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setLoadingIncident(true);
    try {
      const data = await getIncidentRootCauseAction(serviceId);
      setIncidentData(data);
    } catch (err: any) {
      notify(err.message || "Error al analizar incidente", "error");
    } finally {
      setLoadingIncident(false);
    }
  };

  // Refrescar métricas globales
  const refreshAll = async () => {
    startTransition(async () => {
      try {
        const [newOverview, newActors, newAppeals] = await Promise.all([
          getGodEyeOverviewAction(),
          getGodEyeActorsAction(),
          getPendingAppeals(),
        ]);
        setOverview(newOverview);
        setActors(newActors);
        setAppeals(newAppeals);
        if (selectedServiceId) {
          loadIncident(selectedServiceId);
        }
        if (selectedActorId) {
          loadDossier(actorTab, selectedActorId);
        }
        notify("Datos del Ojo de Dios actualizados");
      } catch {
        notify("Error al refrescar datos", "error");
      }
    });
  };

  useEffect(() => {
    if (initialActors.employees[0]?.id) {
      loadDossier("employee", initialActors.employees[0].id);
    }
  }, []);

  // Control IA de chat
  const handleToggleAi = async (pause: boolean) => {
    if (!selectedServiceId) return;
    try {
      if (pause) {
        await pauseServiceAiAction(selectedServiceId);
        notify("IA pausada indefinidamente para este servicio");
      } else {
        await resumeServiceAiAction(selectedServiceId);
        notify("IA reanudada con éxito");
      }
      refreshAll();
    } catch (err: any) {
      notify(err.message || "Error al modificar estado de IA", "error");
    }
  };

  // Enviar mensaje manual de admin
  const handleSendAdminMessage = async () => {
    if (!selectedServiceId || !adminMessage.trim()) return;
    try {
      await sendAdminChatMessageAction(
        selectedServiceId,
        adminMessage.trim(),
        asIdentity,
      );
      setAdminMessage("");
      notify(`Mensaje enviado como ${asIdentity}`);
      if (selectedServiceId) loadIncident(selectedServiceId);
    } catch (err: any) {
      notify(err.message || "Error al enviar mensaje", "error");
    }
  };

  // Aplicar sanción rápida
  const handleApplySanction = async () => {
    if (!selectedActorId || !sanctionReason.trim()) return;
    if (sanctionType === "fine" && (!sanctionFineAmount || Number(sanctionFineAmount) <= 0)) {
      notify("El monto de la multa debe ser mayor a 0", "error");
      return;
    }
    try {
      const startsAt = new Date().toISOString();
      const endsAt =
        sanctionType === "suspension"
          ? new Date(Date.now() + sanctionHours * 3600000).toISOString()
          : undefined;

      await createSanction({
        subjectType: actorTab as any,
        subjectId: selectedActorId,
        type: sanctionType,
        reason: sanctionReason,
        fineAmount: sanctionType === "fine" ? Number(sanctionFineAmount) : undefined,
        startsAt,
        endsAt,
      });

      setShowSanctionModal(false);
      setSanctionReason("");
      notify(
        sanctionType === "fine"
          ? `Multa de $${sanctionFineAmount} aplicada y vinculada a la liquidación`
          : "Sanción aplicada y notificada al usuario",
      );
      refreshAll();
    } catch (err: any) {
      notify(err.message || "Error al aplicar sanción", "error");
    }
  };

  // Revocar sanción manualmente
  const [revokingSanctionId, setRevokingSanctionId] = useState<string | null>(null);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevokeSanction = async () => {
    if (!revokingSanctionId || !revokeReason.trim()) return;
    setIsRevoking(true);
    try {
      await revokeSanction(revokingSanctionId, revokeReason);
      notify("Sanción revocada con éxito");
      setShowRevokeModal(false);
      setRevokeReason("");
      setRevokingSanctionId(null);
      refreshAll();
    } catch (err: any) {
      notify(err.message || "Error al revocar sanción", "error");
    } finally {
      setIsRevoking(false);
    }
  };

  // Resolver apelación
  const handleResolveAppeal = async (
    appealId: string,
    decision: "upheld" | "overturned",
  ) => {
    try {
      await resolveAppeal(appealId, decision);
      notify(
        decision === "overturned"
          ? "Apelación aprobada (calificación anulada)"
          : "Apelación rechazada (sanción mantenida)",
      );
      refreshAll();
    } catch (err: any) {
      notify(err.message || "Error al resolver apelación", "error");
    }
  };

  const { metrics } = overview;

  return (
    <div className="flex flex-col gap-6 font-body text-white">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-semibold shadow-2xl transition-all ${
            notification.type === "success"
              ? "border border-[#C5A55A] bg-zinc-950 text-[#C5A55A]"
              : "border border-red-500 bg-red-950/90 text-red-200"
          }`}
        >
          {notification.msg}
        </div>
      )}

      {/* 🟢 BARRA SUPERIOR: KPIs EN TIEMPO REAL */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Servicios Activos
            </span>
            <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            {metrics.activeServices}
          </p>
          <span className="text-[10px] text-zinc-500">En curso & pendientes</span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Empleadas
            </span>
            <Users className="h-4 w-4 text-[#C5A55A]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            <span className="text-emerald-400">{metrics.employeesAvailable}</span>
            <span className="text-zinc-500"> / {metrics.employeesTotal}</span>
          </p>
          <span className="text-[10px] text-zinc-500">Disponibles ahora</span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Choferes
            </span>
            <Car className="h-4 w-4 text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            <span className="text-blue-400">{metrics.driversActive}</span>
            <span className="text-zinc-500"> / {metrics.driversTotal}</span>
          </p>
          <span className="text-[10px] text-zinc-500">En turno operativo</span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Comprobantes
            </span>
            <CreditCard className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">
            {metrics.pendingReceipts}
          </p>
          <span className="text-[10px] text-zinc-500">Pendientes de validar</span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Quejas 24h
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${
                metrics.recentNegativeRatings > 0
                  ? "animate-bounce text-red-500"
                  : "text-zinc-500"
              }`}
            />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-400">
            {metrics.recentNegativeRatings}
          </p>
          <span className="text-[10px] text-zinc-500">⭐ 1-2 estrellas</span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">
              Efectivo Calle
            </span>
            <Banknote className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-400">
            ${metrics.cashInStreet.toLocaleString()}
          </p>
          <span className="text-[10px] text-zinc-500">Por liquidar</span>
        </div>
      </div>

      {/* 🚀 BOTÓN REFRESH RÁPIDO */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500">
            <div className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-200" />
          </div>
          <h2 className="text-sm font-bold tracking-[0.2em] text-[#C5A55A] uppercase">
            Centro de Mando · Ojo de Dios
          </h2>
        </div>
        <button
          onClick={refreshAll}
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-[#C5A55A] hover:text-white"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
          />
          Sincronizar Todo
        </button>
      </div>

      {/* 🎛️ CUADRÍCULA PRINCIPAL TÁCTICA (3 COLUMNAS INTERACTIVAS) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* COLUMNA 1: SELECTOR & EXPEDIENTE 360° (4 Cols) */}
        <div className="flex flex-col gap-4 xl:col-span-4">
          <div className="rounded-3xl border border-zinc-800 bg-[#080808] p-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                1. Actores del Sistema
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-900 p-1 text-xs">
                <button
                  onClick={() => {
                    setActorTab("employee");
                    const firstId = filteredEmployees[0]?.id || actors.employees[0]?.id || null;
                    setSelectedActorId(firstId);
                    if (firstId) {
                      loadDossier("employee", firstId);
                    } else {
                      setDossier(null);
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 font-semibold transition-all ${
                    actorTab === "employee"
                      ? "bg-[#C5A55A] text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Empleadas ({filteredEmployees.length})
                </button>
                <button
                  onClick={() => {
                    setActorTab("driver");
                    const firstId = filteredDrivers[0]?.id || actors.drivers[0]?.id || null;
                    setSelectedActorId(firstId);
                    if (firstId) {
                      loadDossier("driver", firstId);
                    } else {
                      setDossier(null);
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 font-semibold transition-all ${
                    actorTab === "driver"
                      ? "bg-[#C5A55A] text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Choferes ({filteredDrivers.length})
                </button>
                <button
                  onClick={() => {
                    setActorTab("boss");
                    const firstId = filteredBosses[0]?.id || actors.bosses[0]?.id || null;
                    setSelectedActorId(firstId);
                    if (firstId) {
                      loadDossier("boss", firstId);
                    } else {
                      setDossier(null);
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 font-semibold transition-all ${
                    actorTab === "boss"
                      ? "bg-[#C5A55A] text-black font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Jefes ({filteredBosses.length})
                </button>
              </div>
            </div>

            {/* Barra de búsqueda de actores */}
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder={
                  actorTab === "employee"
                    ? "Buscar empleada..."
                    : actorTab === "driver"
                      ? "Buscar chofer o vehículo..."
                      : "Buscar jefe o email..."
                }
                value={actorSearchQuery}
                onChange={(e) => setActorSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 py-1.5 pl-8 pr-8 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#C5A55A]/60 focus:outline-none transition-colors"
              />
              {actorSearchQuery && (
                <button
                  onClick={() => setActorSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 transition-colors"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Lista compacta de selección rápida */}
            <div className="mt-2.5 flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
              {actorTab === "employee" &&
                (filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => loadDossier("employee", emp.id)}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all ${
                        selectedActorId === emp.id
                          ? "border border-[#C5A55A]/50 bg-[#C5A55A]/10 text-white"
                          : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-zinc-800 flex items-center justify-center">
                          {emp.avatar ? (
                            <Image
                              src={emp.avatar}
                              alt={emp.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <Users className="h-4 w-4 text-zinc-400" />
                          )}
                        </div>
                        <span className="font-semibold text-zinc-200 truncate">{emp.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {emp.sancionada ? (
                          <span className="flex items-center gap-1 rounded-full bg-red-950/80 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400">
                            <ShieldAlert className="h-3 w-3" />
                            Sancionada
                          </span>
                        ) : (
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              emp.disponible ? "bg-emerald-400" : "bg-zinc-600"
                            }`}
                            title={emp.disponible ? "Disponible" : "No disponible"}
                          />
                        )}
                        <span className="text-xs text-zinc-400 font-medium">
                          ${emp.precioBaseHora}/h
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    No se encontraron empleadas para &quot;{actorSearchQuery}&quot;
                  </div>
                ))}

              {actorTab === "driver" &&
                (filteredDrivers.length > 0 ? (
                  filteredDrivers.map((drv) => (
                    <button
                      key={drv.id}
                      onClick={() => loadDossier("driver", drv.id)}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all ${
                        selectedActorId === drv.id
                          ? "border border-blue-500/50 bg-blue-500/10 text-white"
                          : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Car className="h-4 w-4 shrink-0 text-blue-400" />
                        <span className="font-semibold text-zinc-200 truncate">{drv.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {drv.sancionada ? (
                          <span className="flex items-center gap-1 rounded-full bg-red-950/80 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400">
                            <ShieldAlert className="h-3 w-3" />
                            Sancionado
                          </span>
                        ) : (
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              drv.disponible ? "bg-emerald-400" : "bg-zinc-600"
                            }`}
                            title={drv.disponible ? "Disponible" : "No disponible"}
                          />
                        )}
                        <span className="text-xs text-zinc-400 truncate max-w-[100px]">
                          {drv.vehiculoModelo || "Sin auto"}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    No se encontraron choferes para &quot;{actorSearchQuery}&quot;
                  </div>
                ))}

              {actorTab === "boss" &&
                (filteredBosses.length > 0 ? (
                  filteredBosses.map((boss) => (
                    <button
                      key={boss.id}
                      onClick={() => loadDossier("boss", boss.id)}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all ${
                        selectedActorId === boss.id
                          ? "border border-amber-500/50 bg-amber-500/10 text-white"
                          : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Shield className="h-4 w-4 shrink-0 text-amber-400" />
                        <span className="font-semibold text-zinc-200 truncate">{boss.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {boss.sancionada ? (
                          <span className="flex items-center gap-1 rounded-full bg-red-950/80 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400">
                            <ShieldAlert className="h-3 w-3" />
                            Sancionado
                          </span>
                        ) : (
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              boss.activo ? "bg-emerald-400" : "bg-zinc-600"
                            }`}
                            title={boss.activo ? "Activo" : "Inactivo"}
                          />
                        )}
                        <span className="text-xs uppercase text-zinc-400 font-semibold">
                          {boss.rol}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    No se encontraron jefes para &quot;{actorSearchQuery}&quot;
                  </div>
                ))}
            </div>
          </div>

          {/* FICHA 360° DEL ACTOR SELECCIONADO */}
          <div className="flex-1 rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl">
            {loadingDossier ? (
              <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#C5A55A]" />
                Cargando radiografía 360°...
              </div>
            ) : dossier ? (
              <div className="flex flex-col gap-4">
                {/* CABECERA DEL EXPEDIENTE */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 flex items-center justify-center">
                      {dossier.profile?.fotoPerfilUrl ? (
                        <Image
                          src={dossier.profile.fotoPerfilUrl}
                          alt="Avatar"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <Users className="h-7 w-7 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className="font-bold text-white text-base truncate"
                          title={
                            dossier.profile?.nombreArtistico ||
                            dossier.profile?.nombre ||
                            dossier.profile?.email
                          }
                        >
                          {dossier.profile?.nombreArtistico ||
                            dossier.profile?.nombre ||
                            dossier.profile?.email}
                        </h3>
                        {dossier.actorType === "employee" && (
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              dossier.profile?.disponible
                                ? "bg-emerald-400"
                                : "bg-zinc-600"
                            }`}
                            title={
                              dossier.profile?.disponible
                                ? "Disponible"
                                : "No disponible"
                            }
                          />
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 truncate">
                        {dossier.profile?.nombreReal
                          ? `Nombre real: ${dossier.profile.nombreReal}`
                          : dossier.profile?.telefono ||
                            (dossier.profile?.rol
                              ? `Rol: ${dossier.profile.rol}`
                              : "")}
                      </p>
                      {/* Badges de estado rápido */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        {dossier.profile?.apartmentNombre && (
                          <span className="flex items-center gap-1 rounded-md bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-zinc-300">
                            <MapPin className="h-3 w-3 text-[#C5A55A]" />
                            {dossier.profile.apartmentNombre}
                          </span>
                        )}
                        {dossier.actorType === "employee" && dossier.finances && (
                          dossier.finances.totalOwed > 0 ? (
                            <span className="flex items-center gap-1 rounded-md bg-red-950/80 border border-red-500/50 px-2 py-0.5 font-bold text-red-300">
                              <AlertTriangle className="h-3 w-3 text-red-400" />
                              Debe ${dossier.finances.totalOwed.toLocaleString()} MXN
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 rounded-md bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 font-bold text-emerald-300">
                              <Check className="h-3 w-3 text-emerald-400" />
                              Al día ($0 deuda)
                            </span>
                          )
                        )}
                        {dossier.onboarding?.trustScore && (
                          <span className="flex items-center gap-1 rounded-md bg-[#C5A55A]/10 border border-[#C5A55A]/30 px-2 py-0.5 text-[#E8D5A3]">
                            <Award className="h-3 w-3 text-[#C5A55A]" />
                            Trust: {dossier.onboarding.trustScore}/5
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSanctionModal(true)}
                    className="flex shrink-0 self-start sm:self-center items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-1.5 text-xs font-bold text-red-300 transition-colors hover:bg-red-900"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Sancionar
                  </button>
                </div>

                {/* VISTA SEGÚN TIPO DE ACTOR */}
                {dossier.actorType === "employee" ? (
                  <div className="flex flex-col gap-3">
                    {/* BARRA DE NAVEGACIÓN DE SUB-PESTAÑAS */}
                    <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-2">
                      <button
                        onClick={() => setDossierSection("services")}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          dossierSection === "services"
                            ? "bg-[#C5A55A] text-black shadow-md"
                            : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Servicios ({dossier.services?.length || 0})
                      </button>
                      <button
                        onClick={() => setDossierSection("finances")}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          dossierSection === "finances"
                            ? "bg-[#C5A55A] text-black shadow-md"
                            : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        Finanzas & Deudas
                        {dossier.finances?.totalOwed ? (
                          <span className="rounded-full bg-red-500/30 px-1.5 text-[10px] text-red-200">
                            ${dossier.finances.totalOwed}
                          </span>
                        ) : null}
                      </button>
                      <button
                        onClick={() => setDossierSection("onboarding")}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          dossierSection === "onboarding"
                            ? "bg-[#C5A55A] text-black shadow-md"
                            : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        <GraduationCap className="h-3.5 w-3.5" />
                        Exámenes & Onboarding
                        {dossier.onboarding?.attempts?.length ? (
                          <span className="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-300">
                            {dossier.onboarding.attempts.length}
                          </span>
                        ) : null}
                      </button>
                      <button
                        onClick={() => setDossierSection("photos_challenges")}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          dossierSection === "photos_challenges"
                            ? "bg-[#C5A55A] text-black shadow-md"
                            : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Fotos & Retos
                      </button>
                      <button
                        onClick={() => setDossierSection("reputation")}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          dossierSection === "reputation"
                            ? "bg-[#C5A55A] text-black shadow-md"
                            : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        <Scale className="h-3.5 w-3.5" />
                        Reputación & Sanciones
                      </button>
                    </div>

                    {/* CONTENIDO DE SUB-PESTAÑA 1: SERVICIOS */}
                    {dossierSection === "services" && (
                      <div className="flex flex-col gap-3">
                        {/* Filtros de servicios */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex gap-1">
                            {(["all", "active", "completed", "cancelled"] as const).map((filterKey) => (
                              <button
                                key={filterKey}
                                onClick={() => setServiceStatusFilter(filterKey)}
                                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                                  serviceStatusFilter === filterKey
                                    ? "bg-zinc-700 text-white"
                                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                {filterKey === "all"
                                  ? `Todos (${dossier.services?.length || 0})`
                                  : filterKey === "active"
                                  ? `Activos (${
                                      dossier.services?.filter((s: any) =>
                                        ["pendiente", "en_curso"].includes(s.estado),
                                      ).length || 0
                                    })`
                                  : filterKey === "completed"
                                  ? `Completados (${
                                      dossier.services?.filter(
                                        (s: any) => s.estado === "completado",
                                      ).length || 0
                                    })`
                                  : `Cancelados (${
                                      dossier.services?.filter(
                                        (s: any) => s.estado === "cancelado",
                                      ).length || 0
                                    })`}
                              </button>
                            ))}
                          </div>
                          <span className="text-[11px] text-zinc-500">
                            Tarifa base: ${dossier.profile?.precioBaseHora || 0}/h
                          </span>
                        </div>

                        {/* Lista de servicios */}
                        <div className="flex max-h-[380px] flex-col gap-2.5 overflow-y-auto pr-1">
                          {dossier.services &&
                          dossier.services.filter((s: any) => {
                            if (serviceStatusFilter === "active")
                              return ["pendiente", "en_curso"].includes(s.estado);
                            if (serviceStatusFilter === "completed")
                              return s.estado === "completado";
                            if (serviceStatusFilter === "cancelled")
                              return s.estado === "cancelado";
                            return true;
                          }).length > 0 ? (
                            dossier.services
                              .filter((s: any) => {
                                if (serviceStatusFilter === "active")
                                  return ["pendiente", "en_curso"].includes(s.estado);
                                if (serviceStatusFilter === "completed")
                                  return s.estado === "completado";
                                if (serviceStatusFilter === "cancelled")
                                  return s.estado === "cancelado";
                                return true;
                              })
                              .map((s: any) => (
                                <div
                                  key={s.id}
                                  className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-3 text-xs flex flex-col gap-2 transition-all hover:border-zinc-700"
                                >
                                  {/* Encabezado del servicio */}
                                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`h-2 w-2 rounded-full ${
                                          s.estado === "en_curso"
                                            ? "bg-emerald-400 animate-ping"
                                            : s.estado === "pendiente"
                                            ? "bg-amber-400"
                                            : s.estado === "completado"
                                            ? "bg-emerald-500"
                                            : "bg-red-500"
                                        }`}
                                      />
                                      <span className="font-mono text-zinc-400 font-bold">
                                        #{s.id.slice(0, 8)}
                                      </span>
                                      <span
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                          s.estado === "en_curso"
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : s.estado === "pendiente"
                                            ? "bg-amber-500/20 text-amber-300"
                                            : s.estado === "completado"
                                            ? "bg-zinc-800 text-zinc-300"
                                            : "bg-red-500/20 text-red-300"
                                        }`}
                                      >
                                        {s.estado}
                                      </span>
                                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 uppercase">
                                        {s.serviceType || "individual"}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-zinc-500">
                                      {new Date(s.createdAt).toLocaleString("es-MX", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>

                                  {/* Detalles en 2 columnas */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                    {/* Cliente & Chofer */}
                                    <div className="space-y-1">
                                      <p className="text-zinc-300 font-medium">
                                        <span className="text-zinc-500">Cliente:</span>{" "}
                                        {s.clienteNombre || "Sin nombre"}
                                        {s.clienteTelefono ? ` (${s.clienteTelefono})` : ""}
                                      </p>
                                      {s.viajes && s.viajes.length > 0 ? (
                                        <div className="space-y-0.5 pt-0.5">
                                          <span className="text-zinc-500 font-semibold block text-[10px] uppercase">
                                            Traslados / Chofer:
                                          </span>
                                          {s.viajes.map((v: any, idx: number) => (
                                            <p key={idx} className="text-zinc-300 text-[10px]">
                                              🚗 <span className="text-amber-400 capitalize">{v.tipo}:</span>{" "}
                                              {v.choferNombre || "Uber"}
                                              {v.vehiculoModelo ? ` (${v.vehiculoModelo})` : ""}{" "}
                                              · ${v.tarifa || 0} ·{" "}
                                              <span className="text-zinc-400">{v.estado}</span>
                                            </p>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-zinc-500 italic text-[10px]">
                                          Sin chofer asignado
                                        </p>
                                      )}
                                    </div>

                                    {/* Cobro, Duración & Total */}
                                    <div className="space-y-1 text-right sm:text-right">
                                      <p className="text-zinc-300">
                                        <span className="text-zinc-500">Pago:</span>{" "}
                                        <span className="font-semibold uppercase text-zinc-200">
                                          {s.metodoPago}
                                        </span>{" "}
                                        · {s.duracionPactadaHoras}h
                                        {s.duracionFinalHoras ? ` (real: ${s.duracionFinalHoras}h)` : ""}
                                      </p>
                                      <p className="text-sm font-bold text-[#C5A55A]">
                                        ${s.totalFinal || 0} MXN
                                      </p>
                                      {s.extrasServicio && s.extrasServicio.length > 0 && (
                                        <p className="text-[10px] text-zinc-400">
                                          Extras: {s.extrasServicio.map((e: any) => `${e.nombre} (+$${e.precio})`).join(", ")}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Ubicación o Notas */}
                                  {(s.hotelODomicilio || s.ubicacion || s.notas) && (
                                    <div className="border-t border-zinc-900/80 pt-1.5 text-[10px] text-zinc-400 flex flex-wrap items-center justify-between gap-1">
                                      {(s.hotelODomicilio || s.ubicacion) && (
                                        <span className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3 text-zinc-500" />
                                          {s.hotelODomicilio} {s.ubicacion ? `(${s.ubicacion})` : ""}
                                        </span>
                                      )}
                                      {s.notas && (
                                        <span className="italic text-zinc-500">
                                          &ldquo;{s.notas}&rdquo;
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))
                          ) : (
                            <p className="py-6 text-center text-xs text-zinc-500">
                              No hay servicios registrados para este filtro.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 2: FINANZAS & DEUDAS */}
                    {dossierSection === "finances" && (
                      <div className="flex flex-col gap-3">
                        {/* 3 KPIs financieros */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                              Deuda Consolidada
                            </span>
                            <p className="mt-1 text-base font-bold text-red-300">
                              ${dossier.finances?.totalOwed?.toLocaleString() || 0} MXN
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                              Efectivo en Calle
                            </span>
                            <p className="mt-1 text-base font-bold text-[#C5A55A]">
                              ${dossier.finances?.totalCashDue?.toLocaleString() || 0} MXN
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                              Deuda Liquidación
                            </span>
                            <p className="mt-1 text-base font-bold text-amber-400">
                              ${dossier.finances?.totalDebt?.toLocaleString() || 0} MXN
                            </p>
                          </div>
                        </div>

                        {/* Último corte de liquidación */}
                        {dossier.finances?.recentSettlement && (
                          <div className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/5 p-3 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#E8D5A3]">
                                Último Corte Semanal ({dossier.finances.recentSettlement.semanaInicio} al {dossier.finances.recentSettlement.semanaFin})
                              </span>
                              <span className="rounded bg-[#C5A55A]/20 px-2 py-0.5 text-[10px] font-bold text-[#E8D5A3] uppercase">
                                {dossier.finances.recentSettlement.status}
                              </span>
                            </div>
                            <p className="mt-1 text-sm font-bold text-white">
                              Ganancia Neta: ${dossier.finances.recentSettlement.netAmount} MXN
                            </p>
                          </div>
                        )}

                        {/* Desglose de efectivo pendiente */}
                        <div>
                          <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                            Obligaciones de Efectivo en Calle
                          </h5>
                          <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto pr-1">
                            {dossier.finances?.cashObligations && dossier.finances.cashObligations.length > 0 ? (
                              dossier.finances.cashObligations.map((o: any) => (
                                <div
                                  key={o.id}
                                  className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-950 px-3 py-2 text-xs"
                                >
                                  <div>
                                    <span className="font-semibold text-zinc-200">
                                      Pendiente: ${o.montoRestante} MXN
                                    </span>
                                    <span className="text-[10px] text-zinc-500 ml-2">
                                      (Total: ${o.montoOriginal} · Abonado: ${o.montoPagado || 0})
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-zinc-500">
                                    {new Date(o.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-zinc-500 py-1">
                                Sin obligaciones de efectivo pendientes.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Desglose de deudas de liquidación */}
                        <div>
                          <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                            Deudas de Liquidación Acumuladas
                          </h5>
                          <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto pr-1">
                            {dossier.finances?.liquidationDebts && dossier.finances.liquidationDebts.length > 0 ? (
                              dossier.finances.liquidationDebts.map((d: any) => (
                                <div
                                  key={d.id}
                                  className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-950 px-3 py-2 text-xs"
                                >
                                  <div>
                                    <span className="font-semibold text-red-300">
                                      ${d.amount} MXN
                                    </span>
                                    <span className="text-[10px] text-zinc-400 ml-2">
                                      {d.description}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-zinc-500">
                                    {new Date(d.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-zinc-500 py-1">
                                Sin deudas de liquidación registradas.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 3: EXÁMENES & ONBOARDING */}
                    {dossierSection === "onboarding" && (
                      <div className="flex flex-col gap-3">
                        {/* Tarjeta de Onboarding */}
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GraduationCap className="h-4 w-4 text-[#C5A55A]" />
                              <span className="font-bold text-white">
                                Onboarding de Reglamento Operativo
                              </span>
                            </div>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                dossier.onboarding?.status === "completed"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : dossier.onboarding?.status === "in_progress"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {dossier.onboarding?.status || "No iniciado"}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                            <div className="rounded-lg bg-zinc-900 p-2">
                              <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                                Intentos
                              </span>
                              <p className="font-bold text-white text-sm mt-0.5">
                                {dossier.onboarding?.attemptCount || dossier.onboarding?.attempts?.length || 0}
                              </p>
                            </div>
                            <div className="rounded-lg bg-zinc-900 p-2">
                              <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                                Mejor Puntaje
                              </span>
                              <p className="font-bold text-[#C5A55A] text-sm mt-0.5">
                                {dossier.onboarding?.bestScore || 0}%
                              </p>
                            </div>
                            <div className="rounded-lg bg-zinc-900 p-2">
                              <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                                Trust Score
                              </span>
                              <p className="font-bold text-amber-400 text-sm mt-0.5">
                                {dossier.onboarding?.trustScore || 1}/5
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Historial de intentos */}
                        <div>
                          <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                            Historial de Intentos de Examen
                          </h5>
                          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.onboarding?.attempts && dossier.onboarding.attempts.length > 0 ? (
                              dossier.onboarding.attempts.map((att: any) => (
                                <div
                                  key={att.id || att.attemptNumber}
                                  className="rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-xs flex items-center justify-between"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-zinc-200">
                                        Intento #{att.attemptNumber}
                                      </span>
                                      <span
                                        className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                          att.status === "completed"
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : "bg-amber-500/20 text-amber-300"
                                        }`}
                                      >
                                        {att.status === "completed" ? "Completado" : "En progreso"}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-zinc-400 mt-1">
                                      Aciertos: {att.correctAnswers} / {att.totalQuestions} preguntas
                                      {att.completedAt ? ` · ${new Date(att.completedAt).toLocaleDateString()}` : ""}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-base font-bold text-[#C5A55A]">
                                      {att.score}%
                                    </span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-zinc-500 py-2">
                                No se han registrado intentos de examen.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Screening de candidata si existe */}
                        {dossier.onboarding?.screening && (
                          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-xs">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">
                              Evaluación Inicial de Candidata
                            </span>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-zinc-200 font-medium">
                                {dossier.onboarding.screening.candidateName}
                                {dossier.onboarding.screening.candidatePhone ? ` (${dossier.onboarding.screening.candidatePhone})` : ""}
                              </span>
                              <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 uppercase">
                                {dossier.onboarding.screening.status}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 4: FOTOS & RETOS */}
                    {dossierSection === "photos_challenges" && (
                      <div className="flex flex-col gap-3">
                        {/* Fotos Semanales */}
                        <div>
                          <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center justify-between">
                            <span>Fotos Semanales Obligatorias</span>
                            <span className="text-[10px] text-zinc-500 font-normal">
                              {dossier.weeklyPhotos?.length || 0} Registradas
                            </span>
                          </h5>
                          <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto pr-1">
                            {dossier.weeklyPhotos && dossier.weeklyPhotos.length > 0 ? (
                              dossier.weeklyPhotos.map((p: any) => (
                                <div
                                  key={p.id}
                                  className="flex items-center justify-between rounded-lg border border-zinc-900 bg-zinc-950 px-3 py-2 text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <Camera className="h-3.5 w-3.5 text-[#C5A55A]" />
                                    <span className="text-zinc-300">
                                      Semana: {p.semanaInicio || "General"}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                                        p.estado === "aprobada_publica"
                                          ? "bg-emerald-500/20 text-emerald-300"
                                          : p.estado === "aprobada_privada"
                                          ? "bg-blue-500/20 text-blue-300"
                                          : p.estado === "pendiente"
                                          ? "bg-amber-500/20 text-amber-300"
                                          : "bg-red-500/20 text-red-300"
                                      }`}
                                    >
                                      {p.estado}
                                    </span>
                                  </div>
                                  {p.url && (
                                    <a
                                      href={p.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#C5A55A] hover:underline text-[11px]"
                                    >
                                      Ver Foto
                                    </a>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-zinc-500 py-1">
                                Sin envíos de fotos registrados.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Retos y Desafíos */}
                        <div>
                          <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                            Retos y Desafíos Activos
                          </h5>
                          <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto pr-1">
                            {dossier.challenges && dossier.challenges.length > 0 ? (
                              dossier.challenges.map((c: any) => (
                                <div
                                  key={c.id}
                                  className="rounded-lg border border-zinc-900 bg-zinc-950 p-2.5 text-xs flex flex-col gap-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-white">
                                      🏆 {c.titulo}
                                    </span>
                                    <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-bold text-amber-300">
                                      +{c.puntos} pts
                                    </span>
                                  </div>
                                  {c.descripcion && (
                                    <p className="text-[11px] text-zinc-400">
                                      {c.descripcion}
                                    </p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-zinc-500 py-1">
                                Sin retos inscritos actualmente.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 5: REPUTACIÓN & SANCIONES */}
                    {dossierSection === "reputation" && (
                      <div className="flex flex-col gap-3">
                        {/* Reseñas / Calificaciones recibidas */}
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                            Últimas Calificaciones & Reseñas
                          </h4>
                          <div className="mt-2 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.ratings && dossier.ratings.length > 0 ? (
                              dossier.ratings.map((r: any) => (
                                <div
                                  key={r.id}
                                  className="rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-amber-400 text-sm">
                                      {"⭐".repeat(r.stars)}
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                      {r.direction}
                                    </span>
                                  </div>
                                  {r.comment && (
                                    <p className="mt-1.5 italic text-zinc-200 text-sm">
                                      &ldquo;{r.comment}&rdquo;
                                    </p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-1">
                                Sin calificaciones registradas.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Historial de Sanciones */}
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                            Sanciones & Amonestaciones
                          </h4>
                          <div className="mt-2 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.sanctions && dossier.sanctions.length > 0 ? (
                              dossier.sanctions.map((s: any) => (
                                <div
                                  key={s.id}
                                  className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                                    s.status === "active"
                                      ? "border-red-900/50 bg-red-950/20"
                                      : "border-zinc-900 bg-zinc-950/60 opacity-70"
                                  }`}
                                >
                                  <div className="flex-1 pr-2 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`font-bold uppercase text-xs ${
                                          s.status === "active"
                                            ? "text-red-400"
                                            : "text-zinc-400"
                                        }`}
                                      >
                                        {s.type === "fine"
                                          ? "Multa Monetaria"
                                          : s.type === "suspension"
                                          ? "Suspensión"
                                          : "Baneo Permanente"}
                                      </span>
                                      {s.fineAmount && Number(s.fineAmount) > 0 && (
                                        <span className="rounded-md bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[11px] font-bold text-red-300">
                                          -${s.fineAmount} MXN
                                        </span>
                                      )}
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                          s.status === "active"
                                            ? "bg-red-500/20 text-red-300"
                                            : s.status === "revoked"
                                            ? "bg-zinc-800 text-zinc-400"
                                            : "bg-amber-500/10 text-amber-400"
                                        }`}
                                      >
                                        {s.status === "active"
                                          ? "Activa"
                                          : s.status === "revoked"
                                          ? "Revocada"
                                          : "Expirada"}
                                      </span>
                                    </div>
                                    <p className="text-xs text-zinc-200 mt-1">{s.reason}</p>
                                    {s.revocationReason && (
                                      <p className="text-[11px] text-zinc-400 italic mt-0.5">
                                        Motivo revocación: {s.revocationReason}
                                      </p>
                                    )}
                                  </div>
                                  {s.status === "active" && (
                                    <button
                                      onClick={() => {
                                        setRevokingSanctionId(s.id);
                                        setShowRevokeModal(true);
                                      }}
                                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-950/40 px-2.5 py-1 text-[11px] font-bold text-red-300 hover:bg-red-900 transition-colors"
                                    >
                                      Revocar
                                    </button>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-1">
                                Historial limpio sin sanciones.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* VISTA PARA CHOFERES Y JEFES */
                  <div className="flex flex-col gap-4">
                    {/* Reseñas / Calificaciones recibidas */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        Últimas Calificaciones & Reseñas
                      </h4>
                      <div className="mt-2 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                        {dossier.ratings && dossier.ratings.length > 0 ? (
                          dossier.ratings.map((r: any) => (
                            <div
                              key={r.id}
                              className="rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-amber-400 text-sm">
                                  {"⭐".repeat(r.stars)}
                                </span>
                                <span className="text-xs text-zinc-500">
                                  {r.direction}
                                </span>
                              </div>
                              {r.comment && (
                                <p className="mt-1.5 italic text-zinc-200 text-sm">
                                  &ldquo;{r.comment}&rdquo;
                                </p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-zinc-500 py-1">
                            Sin calificaciones registradas.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Historial de Sanciones */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        Sanciones & Amonestaciones
                      </h4>
                      <div className="mt-2 flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                        {dossier.sanctions && dossier.sanctions.length > 0 ? (
                          dossier.sanctions.map((s: any) => (
                            <div
                              key={s.id}
                              className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                                s.status === "active"
                                  ? "border-red-900/50 bg-red-950/20"
                                  : "border-zinc-900 bg-zinc-950/60 opacity-70"
                              }`}
                            >
                              <div className="flex-1 pr-2 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-bold uppercase text-xs ${
                                      s.status === "active"
                                        ? "text-red-400"
                                        : "text-zinc-400"
                                    }`}
                                  >
                                    {s.type === "fine"
                                      ? "Multa Monetaria"
                                      : s.type === "suspension"
                                      ? "Suspensión"
                                      : "Baneo Permanente"}
                                  </span>
                                  {s.fineAmount && Number(s.fineAmount) > 0 && (
                                    <span className="rounded-md bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[11px] font-bold text-red-300">
                                      -${s.fineAmount} MXN
                                    </span>
                                  )}
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      s.status === "active"
                                        ? "bg-red-500/20 text-red-300"
                                        : s.status === "revoked"
                                        ? "bg-zinc-800 text-zinc-400"
                                        : "bg-amber-500/10 text-amber-400"
                                    }`}
                                  >
                                    {s.status === "active"
                                      ? "Activa"
                                      : s.status === "revoked"
                                      ? "Revocada"
                                      : "Expirada"}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-200 mt-1">{s.reason}</p>
                                {s.revocationReason && (
                                  <p className="text-[11px] text-zinc-400 italic mt-0.5">
                                    Motivo revocación: {s.revocationReason}
                                  </p>
                                )}
                              </div>
                              {s.status === "active" && (
                                <button
                                  onClick={() => {
                                    setRevokingSanctionId(s.id);
                                    setShowRevokeModal(true);
                                  }}
                                  className="shrink-0 rounded-lg border border-red-500/30 bg-red-950/40 px-2.5 py-1 text-[11px] font-bold text-red-300 hover:bg-red-900 transition-colors"
                                >
                                  Revocar
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-zinc-500 py-1">
                            Historial limpio sin sanciones.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Selecciona un actor para ver su expediente 360°.
              </p>
            )}
          </div>
        </div>

        {/* COLUMNA 2: INVESTIGACIÓN CAUSAL & RADAR DE SERVICIOS (5 Cols) */}
        <div className="flex flex-col gap-4 xl:col-span-5">
          {/* Selector de servicios activos / con incidentes */}
          <div className="rounded-3xl border border-zinc-800 bg-[#080808] p-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                2. Servicios & Triangulación de Incidentes
              </span>
              <span className="text-xs text-zinc-400 font-semibold">
                {overview.activeServices.length} Activos
              </span>
            </div>

            <div className="mt-3 flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
              {overview.activeServices.map((srv) => (
                <button
                  key={srv.id}
                  onClick={() => loadIncident(srv.id)}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm transition-all ${
                    selectedServiceId === srv.id
                      ? "border border-[#C5A55A] bg-[#C5A55A]/10 text-white"
                      : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-zinc-100 text-sm">
                        {srv.empleadaNombre} · {srv.clienteNombre}
                      </span>
                      <span className="text-xs text-zinc-400 mt-0.5">
                        Duración: {srv.duracionPactadaHoras}h · ${srv.totalFinal} (
                        {srv.metodoPago})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        srv.iaActiva
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {srv.iaActiva ? "🤖 IA ON" : "🛑 IA PAUSADA"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-500" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* MOTOR DE CAUSALIDAD DE CONFLICTOS */}
          <div className="flex-1 rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#C5A55A]">
                Diagnóstico Causal Automático
              </span>
              <Sparkles className="h-4 w-4 text-[#C5A55A]" />
            </div>

            {loadingIncident ? (
              <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#C5A55A]" />
                Triangulando tiempos GPS, reportes y chats...
              </div>
            ) : incidentData ? (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                {/* Diagnóstico Primario */}
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <span className="text-xs font-bold uppercase text-amber-400">
                    Dictamen del Ojo de Dios
                  </span>
                  <p className="mt-1.5 text-base font-semibold text-white">
                    {incidentData.triangulationSummary.primaryDiagnosis}
                  </p>
                </div>

                {/* Causas específicas detectadas */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase text-zinc-300">
                    Factores y Discrepancias Identificadas
                  </span>
                  {incidentData.detectedCauses.length > 0 ? (
                    incidentData.detectedCauses.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-red-900/30 bg-red-950/10 p-3.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-300 text-sm">
                            {c.title}
                          </span>
                          <span className="rounded bg-red-900/40 px-2 py-0.5 text-xs font-bold text-red-200 uppercase">
                            Causal: {c.culprit}
                          </span>
                        </div>
                        <p className="mt-1.5 text-zinc-200 text-xs">{c.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-zinc-400 text-xs py-1">
                      Operación normal: tiempos de chofer y notas dentro de los
                      parámetros.
                    </p>
                  )}
                </div>

                {/* Tiempos de Viaje / Chofer */}
                {incidentData.trips.length > 0 && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
                    <span className="text-xs font-bold uppercase text-zinc-300">
                      Cronograma de Traslados
                    </span>
                    <div className="mt-2 flex flex-col gap-1.5 text-xs text-zinc-200">
                      {incidentData.trips.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between border-b border-zinc-900 py-1.5"
                        >
                          <span className="font-medium">
                            {t.tipo === "ida" ? "Ida" : "Regreso"}:{" "}
                            {t.choferNombre || t.proveedorTransporte}
                          </span>
                          <span className="font-bold text-zinc-400 uppercase text-[11px]">
                            {t.estado}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                Selecciona un servicio para analizar la causa de posibles
                discrepancias.
              </p>
            )}
          </div>
        </div>

        {/* COLUMNA 3: INTERCEPTOR DE CHAT EN VIVO & OVERRIDES (3 Cols) */}
        <div className="flex flex-col gap-4 xl:col-span-3">
          <div className="flex flex-1 flex-col rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                3. Interceptor de Chat
              </span>
              <MessageSquare className="h-4 w-4 text-[#C5A55A]" />
            </div>

            {/* Switch de Pausa / Reanudación de IA */}
            <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
              <div>
                <span className="text-sm font-bold text-white">Estado de IA</span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {incidentData?.service?.ia_activa ?? true
                    ? "Respondiendo automáticamente"
                    : "Pausada indefinidamente"}
                </p>
              </div>
              <button
                onClick={() =>
                  handleToggleAi(incidentData?.service?.ia_activa ?? true)
                }
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  incidentData?.service?.ia_activa ?? true
                    ? "bg-red-950 text-red-300 hover:bg-red-900"
                    : "bg-emerald-950 text-emerald-300 hover:bg-emerald-900"
                }`}
              >
                {incidentData?.service?.ia_activa ?? true ? (
                  <>
                    <PauseCircle className="h-4 w-4" /> Pausar IA
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" /> Reanudar IA
                  </>
                )}
              </button>
            </div>

            {/* Mensajes del chat en vivo */}
            <div className="my-3 flex max-h-72 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-zinc-900 bg-black p-3.5 text-xs">
              {incidentData?.conversations &&
              incidentData.conversations.length > 0 ? (
                incidentData.conversations.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col rounded-xl p-2.5 ${
                      msg.emisor === "cliente"
                        ? "self-start bg-zinc-900 text-zinc-200"
                        : "self-end bg-[#C5A55A]/20 text-[#C5A55A]"
                    } max-w-[85%]`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      {msg.emisor}
                    </span>
                    <p className="mt-0.5 text-zinc-100 text-xs leading-relaxed">{msg.mensaje}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-zinc-500 my-auto text-xs">
                  Selecciona un servicio para leer la conversación.
                </p>
              )}
            </div>

            {/* Envío Manual de Admin */}
            <div className="flex flex-col gap-2.5 border-t border-zinc-800 pt-3">
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <input
                    type="radio"
                    name="identity"
                    checked={asIdentity === "jefe"}
                    onChange={() => setAsIdentity("jefe")}
                  />
                  Agencia
                </label>
                <label className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <input
                    type="radio"
                    name="identity"
                    checked={asIdentity === "empleada"}
                    onChange={() => setAsIdentity("empleada")}
                  />
                  Como Empleada
                </label>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Responder como ${asIdentity}...`}
                  value={adminMessage}
                  onChange={(e) => setAdminMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendAdminMessage()}
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                />
                <button
                  onClick={handleSendAdminMessage}
                  className="flex items-center justify-center rounded-xl bg-[#C5A55A] px-3.5 py-2 text-black transition-transform hover:scale-105"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ⚖️ PANEL INFERIOR: BANDEJA DE APELACIONES & RESOLUCIÓN */}
      <div className="rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-[#C5A55A]" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              4. Bandeja de Apelaciones de Sanciones & Reseñas
            </span>
          </div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-400">
            {appeals.length} Pendientes
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {appeals.length > 0 ? (
            appeals.map((app) => (
              <div
                key={app.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-400">
                      {"⭐".repeat(app.stars)} ({app.direction})
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {app.comment && (
                    <p className="mt-2 italic text-zinc-400">
                      Queja original: &ldquo;{app.comment}&rdquo;
                    </p>
                  )}
                  {app.appealReason && (
                    <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-900 p-2.5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase">
                        Motivo de Apelación
                      </span>
                      <p className="mt-1 text-zinc-200">{app.appealReason}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2 border-t border-zinc-900 pt-3">
                  <button
                    onClick={() => handleResolveAppeal(app.id, "overturned")}
                    className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-950/40 py-2 text-center font-bold text-emerald-300 hover:bg-emerald-900"
                  >
                    Aprobar Apelación
                  </button>
                  <button
                    onClick={() => handleResolveAppeal(app.id, "upheld")}
                    className="flex-1 rounded-xl border border-red-500/40 bg-red-950/40 py-2 text-center font-bold text-red-300 hover:bg-red-900"
                  >
                    Mantener Sanción
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="col-span-full py-4 text-center text-xs text-zinc-500">
              No hay solicitudes de apelación pendientes en este momento.
            </p>
          )}
        </div>
      </div>

      {/* 🛑 MODAL DE SANCIÓN DIRECTA */}
      {showSanctionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#0c0c0c] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">
              Aplicar Sanción Disciplinaria
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Se enviará una notificación automática por Telegram con botón para
              apelar.
            </p>

            <div className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="text-zinc-400">Tipo de Sanción</label>
                <select
                  value={sanctionType}
                  onChange={(e) => setSanctionType(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-white"
                >
                  <option value="suspension">Suspensión Temporal (Horas)</option>
                  <option value="fine">Multa Monetaria ($ Descuento en Liquidación)</option>
                  <option value="permanent_ban">Baneo Permanente</option>
                </select>
              </div>

              {sanctionType === "suspension" && (
                <div>
                  <label className="text-zinc-400">Duración en Horas</label>
                  <input
                    type="number"
                    value={sanctionHours}
                    onChange={(e) => setSanctionHours(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-white"
                  />
                </div>
              )}

              {sanctionType === "fine" && (
                <div>
                  <label className="text-zinc-300 font-semibold">Monto de la Multa ($ MXN)</label>
                  <input
                    type="number"
                    min="1"
                    step="50"
                    placeholder="Ej: 500"
                    value={sanctionFineAmount}
                    onChange={(e) => setSanctionFineAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-[#C5A55A]/50 bg-zinc-950 px-3 py-2 text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Este monto se registrará como descuento automático en la liquidación semanal del usuario.
                  </p>
                </div>
              )}

              <div>
                <label className="text-zinc-400">
                  Motivo detallado de la sanción
                </label>
                <textarea
                  rows={3}
                  value={sanctionReason}
                  onChange={(e) => setSanctionReason(e.target.value)}
                  placeholder="Ej: Impuntualidad reiterada en servicio #12..."
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowSanctionModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplySanction}
                className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-500"
              >
                Confirmar Sanción
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 MODAL DE REVOCACIÓN DE SANCIÓN */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#0c0c0c] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Revocar Sanción Disciplinaria
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Al revocar la sanción, el sujeto volverá a estar habilitado y se registrará el motivo en su expediente.
            </p>

            <div className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="text-zinc-300 font-semibold">
                  Motivo de la revocación (requerido)
                </label>
                <textarea
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Ej: Aclaración de malentendido con cliente / cumplimiento anticipado..."
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={isRevoking}
                onClick={() => {
                  setShowRevokeModal(false);
                  setRevokeReason("");
                  setRevokingSanctionId(null);
                }}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                disabled={isRevoking || !revokeReason.trim()}
                onClick={handleRevokeSanction}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
              >
                {isRevoking ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Revocando...
                  </>
                ) : (
                  "Confirmar Revocación"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
