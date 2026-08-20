"use client";

import {
  Activity,
  AlertTriangle,
  Banknote,
  Car,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  FileCheck,
  Flame,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Scale,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  XCircle,
  ChevronRight,
  TrendingUp,
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
  const [selectedActorId, setSelectedActorId] = useState<string | null>(
    initialActors.employees[0]?.id || null,
  );
  const [dossier, setDossier] = useState<GodEyeActorDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

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
    "suspension" | "permanent_ban"
  >("suspension");
  const [sanctionReason, setSanctionReason] = useState("");
  const [sanctionHours, setSanctionHours] = useState(24);

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
    if (selectedActorId) {
      loadDossier(actorTab, selectedActorId);
    }
  }, [actorTab]);

  useEffect(() => {
    if (selectedServiceId) {
      loadIncident(selectedServiceId);
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
        adminMessage,
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
        startsAt,
        endsAt,
      });

      setShowSanctionModal(false);
      setSanctionReason("");
      notify("Sanción aplicada y notificada al usuario");
      refreshAll();
    } catch (err: any) {
      notify(err.message || "Error al aplicar sanción", "error");
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
              <div className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-[11px]">
                <button
                  onClick={() => setActorTab("employee")}
                  className={`rounded px-2.5 py-1 font-semibold transition-all ${
                    actorTab === "employee"
                      ? "bg-[#C5A55A] text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Empleadas ({actors.employees.length})
                </button>
                <button
                  onClick={() => setActorTab("driver")}
                  className={`rounded px-2.5 py-1 font-semibold transition-all ${
                    actorTab === "driver"
                      ? "bg-[#C5A55A] text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Choferes ({actors.drivers.length})
                </button>
                <button
                  onClick={() => setActorTab("boss")}
                  className={`rounded px-2.5 py-1 font-semibold transition-all ${
                    actorTab === "boss"
                      ? "bg-[#C5A55A] text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Jefes ({actors.bosses.length})
                </button>
              </div>
            </div>

            {/* Lista compacta de selección rápida */}
            <div className="mt-3 flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-1">
              {actorTab === "employee" &&
                actors.employees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => loadDossier("employee", emp.id)}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-all ${
                      selectedActorId === emp.id
                        ? "border border-[#C5A55A]/50 bg-[#C5A55A]/10 text-white"
                        : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-6 w-6 overflow-hidden rounded-full bg-zinc-800">
                        {emp.avatar ? (
                          <Image
                            src={emp.avatar}
                            alt={emp.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <Users className="h-3.5 w-3.5 m-auto text-zinc-500" />
                        )}
                      </div>
                      <span className="font-semibold">{emp.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          emp.disponible ? "bg-emerald-400" : "bg-zinc-600"
                        }`}
                      />
                      <span className="text-[11px] text-zinc-500">
                        ${emp.precioBaseHora}/h
                      </span>
                    </div>
                  </button>
                ))}

              {actorTab === "driver" &&
                actors.drivers.map((drv) => (
                  <button
                    key={drv.id}
                    onClick={() => loadDossier("driver", drv.id)}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-all ${
                      selectedActorId === drv.id
                        ? "border border-blue-500/50 bg-blue-500/10 text-white"
                        : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Car className="h-4 w-4 text-blue-400" />
                      <span className="font-semibold">{drv.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {drv.vehiculoModelo || "Sin auto"}
                    </span>
                  </button>
                ))}

              {actorTab === "boss" &&
                actors.bosses.map((boss) => (
                  <button
                    key={boss.id}
                    onClick={() => loadDossier("boss", boss.id)}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-all ${
                      selectedActorId === boss.id
                        ? "border border-amber-500/50 bg-amber-500/10 text-white"
                        : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-amber-400" />
                      <span className="font-semibold">{boss.name}</span>
                    </div>
                    <span className="text-[10px] uppercase text-zinc-500">
                      {boss.rol}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* FICHA 360° DEL ACTOR SELECCIONADO */}
          <div className="flex-1 rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl">
            {loadingDossier ? (
              <div className="flex h-64 items-center justify-center text-xs text-zinc-500">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#C5A55A]" />
                Cargando radiografía 360°...
              </div>
            ) : dossier ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
                      {dossier.profile?.fotoPerfilUrl ? (
                        <Image
                          src={dossier.profile.fotoPerfilUrl}
                          alt="Avatar"
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <Users className="h-6 w-6 m-auto text-zinc-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-white">
                        {dossier.profile?.nombreArtistico ||
                          dossier.profile?.nombre ||
                          dossier.profile?.email}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {dossier.profile?.nombreReal
                          ? `Nombre real: ${dossier.profile.nombreReal}`
                          : dossier.profile?.telefono || dossier.profile?.rol}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSanctionModal(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/40 px-2.5 py-1 text-xs font-bold text-red-300 transition-colors hover:bg-red-900"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Sancionar
                  </button>
                </div>

                {/* Métricas rápidas del actor */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {dossier.profile?.precioBaseHora && (
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-2.5">
                      <span className="text-[10px] text-zinc-500">
                        Tarifa Base
                      </span>
                      <p className="font-bold text-[#C5A55A]">
                        ${dossier.profile.precioBaseHora}/hr
                      </p>
                    </div>
                  )}
                  {dossier.profile?.jefeEmail && (
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-2.5">
                      <span className="text-[10px] text-zinc-500">
                        Jefe Asignado
                      </span>
                      <p className="truncate font-semibold text-zinc-300">
                        {dossier.profile.jefeEmail}
                      </p>
                    </div>
                  )}
                </div>

                {/* Reseñas / Calificaciones recibidas */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Últimas Calificaciones & Reseñas
                  </h4>
                  <div className="mt-2 flex max-h-36 flex-col gap-2 overflow-y-auto pr-1">
                    {dossier.ratings && dossier.ratings.length > 0 ? (
                      dossier.ratings.map((r: any) => (
                        <div
                          key={r.id}
                          className="rounded-xl border border-zinc-900 bg-zinc-950 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-400">
                              {"⭐".repeat(r.stars)}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {r.direction}
                            </span>
                          </div>
                          {r.comment && (
                            <p className="mt-1 italic text-zinc-300">
                              "{r.comment}"
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-600">
                        Sin calificaciones registradas.
                      </p>
                    )}
                  </div>
                </div>

                {/* Historial de Sanciones */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Sanciones & Amonestaciones
                  </h4>
                  <div className="mt-2 flex max-h-28 flex-col gap-1.5 overflow-y-auto pr-1">
                    {dossier.sanctions && dossier.sanctions.length > 0 ? (
                      dossier.sanctions.map((s: any) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between rounded-lg border border-red-900/30 bg-red-950/10 px-2.5 py-1.5 text-xs"
                        >
                          <div>
                            <span className="font-bold uppercase text-red-400">
                              {s.type}
                            </span>
                            <p className="text-[11px] text-zinc-300">{s.reason}</p>
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            {s.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-600">
                        Historial limpio sin sanciones.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
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
              <span className="text-xs text-zinc-500">
                {overview.activeServices.length} Activos
              </span>
            </div>

            <div className="mt-3 flex max-h-36 flex-col gap-2 overflow-y-auto pr-1">
              {overview.activeServices.map((srv) => (
                <button
                  key={srv.id}
                  onClick={() => loadIncident(srv.id)}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs transition-all ${
                    selectedServiceId === srv.id
                      ? "border border-[#C5A55A] bg-[#C5A55A]/10 text-white"
                      : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-white">
                        {srv.empleadaNombre} · {srv.clienteNombre}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        Duración: {srv.duracionPactadaHoras}h · ${srv.totalFinal} (
                        {srv.metodoPago})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        srv.iaActiva
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {srv.iaActiva ? "🤖 IA ON" : "🛑 IA PAUSADA"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-600" />
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
              <div className="flex h-48 items-center justify-center text-xs text-zinc-500">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#C5A55A]" />
                Triangulando tiempos GPS, reportes y chats...
              </div>
            ) : incidentData ? (
              <div className="mt-3 flex flex-col gap-3 text-xs">
                {/* Diagnóstico Primario */}
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <span className="text-[10px] font-bold uppercase text-amber-400">
                    Dictamen del Ojo de Dios
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {incidentData.triangulationSummary.primaryDiagnosis}
                  </p>
                </div>

                {/* Causas específicas detectadas */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Factores y Discrepancias Identificadas
                  </span>
                  {incidentData.detectedCauses.length > 0 ? (
                    incidentData.detectedCauses.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-red-900/30 bg-red-950/10 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-300">
                            {c.title}
                          </span>
                          <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[9px] font-bold text-red-200 uppercase">
                            Causal: {c.culprit}
                          </span>
                        </div>
                        <p className="mt-1 text-zinc-300">{c.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-zinc-500">
                      Operación normal: tiempos de chofer y notas dentro de los
                      parámetros.
                    </p>
                  )}
                </div>

                {/* Tiempos de Viaje / Chofer */}
                {incidentData.trips.length > 0 && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">
                      Cronograma de Traslados
                    </span>
                    <div className="mt-2 flex flex-col gap-1 text-[11px] text-zinc-300">
                      {incidentData.trips.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between border-b border-zinc-900 py-1"
                        >
                          <span>
                            {t.tipo === "ida" ? "Ida" : "Regreso"}:{" "}
                            {t.choferNombre || t.proveedorTransporte}
                          </span>
                          <span className="font-bold text-zinc-400">
                            {t.estado}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-xs text-zinc-500">
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
            <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div>
                <span className="text-xs font-bold text-white">Estado de IA</span>
                <p className="text-[10px] text-zinc-500">
                  {incidentData?.service?.ia_activa ?? true
                    ? "Respondiendo automáticamente"
                    : "Pausada indefinidamente"}
                </p>
              </div>
              <button
                onClick={() =>
                  handleToggleAi(incidentData?.service?.ia_activa ?? true)
                }
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  incidentData?.service?.ia_activa ?? true
                    ? "bg-red-950 text-red-300 hover:bg-red-900"
                    : "bg-emerald-950 text-emerald-300 hover:bg-emerald-900"
                }`}
              >
                {incidentData?.service?.ia_activa ?? true ? (
                  <>
                    <PauseCircle className="h-3.5 w-3.5" /> Pausar IA
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-3.5 w-3.5" /> Reanudar IA
                  </>
                )}
              </button>
            </div>

            {/* Mensajes del chat en vivo */}
            <div className="my-3 flex max-h-72 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-zinc-900 bg-black p-3 text-xs">
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
                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                      {msg.emisor}
                    </span>
                    <p className="mt-0.5 text-zinc-100">{msg.mensaje}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-zinc-600 my-auto">
                  Selecciona un servicio para leer la conversación.
                </p>
              )}
            </div>

            {/* Envío Manual de Admin */}
            <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
              <div className="flex gap-2 text-[10px]">
                <label className="flex items-center gap-1 text-zinc-400">
                  <input
                    type="radio"
                    name="identity"
                    checked={asIdentity === "jefe"}
                    onChange={() => setAsIdentity("jefe")}
                  />
                  Agencia
                </label>
                <label className="flex items-center gap-1 text-zinc-400">
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
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                />
                <button
                  onClick={handleSendAdminMessage}
                  className="flex items-center justify-center rounded-xl bg-[#C5A55A] px-3 py-2 text-black transition-transform hover:scale-105"
                >
                  <Send className="h-3.5 w-3.5" />
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
                      Queja original: "{app.comment}"
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
                  <option value="suspension">Suspensión Temporal</option>
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
    </div>
  );
}
