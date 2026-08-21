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
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { getServiceByIdAction } from "@/lib/data/services";
import ServiceDetailDialog from "@/components/services/service-detail-dialog";
import type { Service } from "@/lib/types";

interface Props {
  initialOverview: GodEyeOverview;
  initialActors: GodEyeActorSummary;
  initialAppeals: RatingAppeal[];
}

export type ServiceAlert = {
  id: string;
  label: string;
  severity: "critical" | "warning" | "info";
  icon: React.ComponentType<{ className?: string; size?: number }>;
  description: string;
};

export function getServiceAlerts(srv: any): ServiceAlert[] {
  const alerts: ServiceAlert[] = [];
  if (!srv) return alerts;

  // 1. Estado pendiente de aceptación
  if (srv.estado === "pendiente") {
    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - new Date(srv.createdAt).getTime()) / 60000),
    );
    if (elapsedMinutes > 15) {
      alerts.push({
        id: "pending_long",
        label: `Espera prolongada (+${elapsedMinutes}m)`,
        severity: "critical",
        icon: AlertTriangle,
        description: `El servicio lleva ${elapsedMinutes} minutos en estado pendiente sin ser aceptado o rechazado.`,
      });
    } else {
      alerts.push({
        id: "pending",
        label: "Por Aceptar",
        severity: "warning",
        icon: Clock,
        description: "Servicio pendiente de aceptación o asignación de transporte.",
      });
    }
  }

  // 2. IA Pausada (requiere atención humana)
  if (srv.iaActiva === false) {
    alerts.push({
      id: "ai_paused",
      label: "IA Pausada",
      severity: "warning",
      icon: PauseCircle,
      description: "El bot de IA está en pausa. El chat con el cliente requiere atención manual del jefe/admin.",
    });
  }

  // 3. Problemas de Transporte
  const trips: any[] = Array.isArray(srv.viajes) ? srv.viajes : [];

  // Sin chofer / transporte si está en curso o pendiente
  if (
    trips.length === 0 &&
    (srv.estado === "en_curso" || srv.estado === "pendiente")
  ) {
    alerts.push({
      id: "no_transport",
      label: "Sin Transporte",
      severity: "warning",
      icon: Car,
      description: "No se ha generado ni asignado ningún viaje de transporte para este servicio.",
    });
  }

  // Uber sin captura o sin tarifa
  const uberTrips = trips.filter(
    (t: any) =>
      t.proveedorTransporte === "uber" && t.estado !== "cancelado",
  );
  const uberWithoutScreenshot = uberTrips.filter(
    (t: any) => !t.uberScreenshotUrl && !t.telegramUberFileId,
  );
  const uberWithoutFare = uberTrips.filter(
    (t: any) => !t.tarifa || Number(t.tarifa) <= 0,
  );

  if (uberWithoutScreenshot.length > 0) {
    alerts.push({
      id: "uber_no_screenshot",
      label: `Falta Captura Uber (${uberWithoutScreenshot.length})`,
      severity: "critical",
      icon: Camera,
      description: "Hay traslados de Uber sin captura de pantalla de comprobante registrada.",
    });
  }

  if (uberWithoutFare.length > 0) {
    alerts.push({
      id: "uber_no_fare",
      label: `Tarifa Uber $0 (${uberWithoutFare.length})`,
      severity: "warning",
      icon: DollarSign,
      description: "Hay traslados de Uber con tarifa en $0 o sin confirmar.",
    });
  }

  // Viaje cancelado
  const cancelledTrips = trips.filter((t: any) => t.estado === "cancelado");
  if (cancelledTrips.length > 0) {
    alerts.push({
      id: "cancelled_trip",
      label: `Viaje Cancelado (${cancelledTrips.length})`,
      severity: "critical",
      icon: XCircle,
      description: "Uno o más traslados asociados al servicio fueron cancelados.",
    });
  }

  // Transporte de regreso pendiente
  if (
    srv.estadoLiquidacion === "transporte_pendiente" ||
    (srv.estado === "completado" &&
      !trips.some((t: any) => t.tipo === "regreso"))
  ) {
    alerts.push({
      id: "return_pending",
      label: "Regreso Pendiente",
      severity: "warning",
      icon: RefreshCw,
      description: "El servicio terminó o está por terminar y no se ha asignado transporte de retorno.",
    });
  }

  // 4. Comprobante de pago pendiente de validar
  if (srv.pendingReceiptsCount && Number(srv.pendingReceiptsCount) > 0) {
    alerts.push({
      id: "receipt_pending",
      label: `Comprobante Pendiente (${srv.pendingReceiptsCount})`,
      severity: "warning",
      icon: CreditCard,
      description: "Hay comprobantes de transferencia bancaria pendientes de validación.",
    });
  }

  // 5. Exceso de tiempo / retraso en curso
  if (srv.estado === "en_curso" && srv.horaInicioServicio) {
    const elapsedHours =
      (Date.now() - new Date(srv.horaInicioServicio).getTime()) / 3600000;
    const agreedHours = Number(srv.duracionPactadaHoras) || 1;
    if (elapsedHours > agreedHours + 0.25) {
      const extraMinutes = Math.round((elapsedHours - agreedHours) * 60);
      alerts.push({
        id: "time_exceeded",
        label: `Tiempo Excedido (+${extraMinutes}m)`,
        severity: "critical",
        icon: Flame,
        description: `El servicio ha superado las ${agreedHours}h pactadas por más de ${extraMinutes} minutos.`,
      });
    }
  }

  // 6. Calificación baja / Queja
  if (srv.calificacion != null && Number(srv.calificacion) <= 2) {
    alerts.push({
      id: "low_rating",
      label: `Queja (${srv.calificacion}⭐)`,
      severity: "critical",
      icon: AlertTriangle,
      description: `El cliente dejó una calificación de ${srv.calificacion}/5 estrellas.`,
    });
  }

  return alerts;
}

export function ServiceProblemBadges({ service }: { service: any }) {
  const alerts = getServiceAlerts(service);

  if (alerts.length === 0) {
    if (service.estado === "en_curso") {
      return (
        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-300">
          <CheckCircle2 size={12} className="text-emerald-400" /> Operación normal
        </span>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {alerts.map((alt) => {
        const Icon = alt.icon;
        const colorClasses =
          alt.severity === "critical"
            ? "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25"
            : alt.severity === "warning"
              ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              : "border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25";

        return (
          <span
            key={alt.id}
            title={alt.description}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] sm:text-[11px] font-extrabold transition-colors cursor-help ${colorClasses}`}
          >
            <Icon size={12} className="shrink-0" />
            {alt.label}
          </span>
        );
      })}
    </div>
  );
}

export default function GodEyeDashboard({
  initialOverview,
  initialActors,
  initialAppeals,
}: Props) {
  const router = useRouter();
  const [overview, setOverview] = useState<GodEyeOverview>(initialOverview);
  const [actors, setActors] = useState<GodEyeActorSummary>(initialActors);
  const [appeals, setAppeals] = useState<RatingAppeal[]>(initialAppeals);

  useEffect(() => {
    setOverview(initialOverview);
  }, [initialOverview]);

  useEffect(() => {
    setActors(initialActors);
  }, [initialActors]);

  useEffect(() => {
    setAppeals(initialAppeals);
  }, [initialAppeals]);

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
  const [ratingSourceFilter, setRatingSourceFilter] = useState<
    "all" | "client" | "driver"
  >("all");

  // Modal de detalle y gestión completa de servicio
  const [managingService, setManagingService] = useState<Service | null>(null);
  const [loadingServiceDetail, setLoadingServiceDetail] = useState(false);

  // Filtro de servicios activos en columna 2
  const [activeServiceFilter, setActiveServiceFilter] = useState<
    "all" | "alerts" | "clean"
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

  const filteredActiveServices = overview.activeServices.filter((srv) => {
    const alerts = getServiceAlerts(srv);
    if (activeServiceFilter === "alerts") return alerts.length > 0;
    if (activeServiceFilter === "clean") return alerts.length === 0;
    return true;
  });

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
  const [isApplyingSanction, setIsApplyingSanction] = useState(false);

  // Modal de detalle de sanción
  const [selectedSanctionDetail, setSelectedSanctionDetail] = useState<any | null>(null);

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

  // Abrir modal de gestión completa de servicio
  const handleOpenServiceDetail = async (serviceId: string) => {
    setLoadingServiceDetail(true);
    try {
      const res = await getServiceByIdAction(serviceId);
      if (!res.success || !res.data) {
        throw new Error(res.error || "No se pudo cargar el servicio");
      }
      setManagingService(res.data);
    } catch (err: any) {
      notify(err.message || "Error al abrir servicio", "error");
    } finally {
      setLoadingServiceDetail(false);
    }
  };

  // Refrescar métricas globales
  const refreshAll = async () => {
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
        await loadIncident(selectedServiceId);
      }
      if (selectedActorId) {
        await loadDossier(actorTab, selectedActorId);
      }
    } catch (err) {
      console.error("Error refreshing God Eye data:", err);
    }
    router.refresh();
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
    if (!selectedActorId || !sanctionReason.trim() || isApplyingSanction) return;
    if (sanctionType === "fine" && (!sanctionFineAmount || Number(sanctionFineAmount) <= 0)) {
      notify("El monto de la multa debe ser mayor a 0", "error");
      return;
    }
    setIsApplyingSanction(true);
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
        reason: sanctionReason.trim(),
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
    } finally {
      setIsApplyingSanction(false);
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
          className={`fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-semibold shadow-2xl transition-all ${notification.type === "success"
            ? "border border-[#C5A55A] bg-zinc-950 text-[#C5A55A]"
            : "border border-red-500 bg-red-950/90 text-red-200"
            }`}
        >
          {notification.msg}
        </div>
      )}

      {/* 🟢 BARRA SUPERIOR: KPIs EN TIEMPO REAL */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        <Link
          href="/admin/services"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-[#C5A55A]/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-amber-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Servicios Activos
            </span>
            <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white group-hover:text-[#C5A55A] transition-colors">
            {metrics.activeServices}
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            En curso & pendientes →
          </span>
        </Link>

        <Link
          href="/admin/modelos"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-[#C5A55A]/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-amber-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Empleadas
            </span>
            <Users className="h-4 w-4 text-[#C5A55A]" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">
            <span className="text-emerald-400">{metrics.employeesAvailable}</span>
            <span className="text-zinc-500 font-bold"> / {metrics.employeesTotal}</span>
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            Disponibles ahora →
          </span>
        </Link>

        <Link
          href="/admin/choferes"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-[#C5A55A]/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-amber-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Choferes
            </span>
            <Car className="h-4 w-4 text-blue-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">
            <span className="text-blue-400">{metrics.driversActive}</span>
            <span className="text-zinc-500 font-bold"> / {metrics.driversTotal}</span>
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            En turno operativo →
          </span>
        </Link>

        <Link
          href="/admin/evidence"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-[#C5A55A]/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-amber-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Comprobantes
            </span>
            <CreditCard className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white group-hover:text-amber-400 transition-colors">
            {metrics.pendingReceipts}
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            Pendientes de validar →
          </span>
        </Link>

        <Link
          href="/admin/reports"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-red-500/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-red-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Quejas 24h
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${metrics.recentNegativeRatings > 0
                ? "animate-bounce text-red-500"
                : "text-zinc-500"
                }`}
            />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-red-400">
            {metrics.recentNegativeRatings}
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            ⭐ 1-2 estrellas →
          </span>
        </Link>

        <Link
          href="/admin/liquidations"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-emerald-500/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-emerald-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Efectivo Calle
            </span>
            <Banknote className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-400">
            ${metrics.cashInStreet.toLocaleString()}
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            Por liquidar →
          </span>
        </Link>

        <Link
          href="/admin/liquidations"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-emerald-500/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-emerald-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Ingresos Hoy
            </span>
            <Banknote className="h-4 w-4 text-[#C5A55A]" />
          </div>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#C5A55A]">
            ${metrics.revenueToday.toLocaleString()}
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            Servicios finalizados →
          </span>
        </Link>

        <Link
          href="/admin/reports"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-red-500/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-red-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Quejas Abiertas
            </span>
            <AlertTriangle
              className={`h-4 w-4 ${metrics.pendingReports > 0 ? "text-red-500" : "text-zinc-500"}`}
            />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-red-400">
            {metrics.pendingReports}
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            Sin resolver →
          </span>
        </Link>

        <Link
          href="/admin/services"
          className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner transition-all duration-200 hover:scale-[1.02] hover:border-[#C5A55A]/60 hover:bg-[#111111] hover:shadow-lg hover:shadow-amber-500/5 cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 group-hover:text-zinc-200">
            <span className="text-sm font-bold uppercase tracking-wider">
              Ofertas Grupales
            </span>
            <Radio className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">
            {metrics.pendingOffers}
          </p>
          <span className="text-xs text-zinc-400 font-medium group-hover:text-zinc-300">
            En proceso →
          </span>
        </Link>

        <div className="group block rounded-2xl border border-zinc-800 bg-[#090909] p-4 shadow-inner">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-sm font-bold uppercase tracking-wider">
              Clientes
            </span>
            <Users className="h-4 w-4 text-zinc-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-white">
            {metrics.clientsTotal}
          </p>
          <span className="text-xs text-zinc-400 font-medium">
            Registrados en total
          </span>
        </div>
      </div>

      {/* Quejas abiertas */}
      {overview.pendingReports.length > 0 && (
        <div className="rounded-3xl border border-zinc-800 bg-[#090909] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-extrabold uppercase tracking-wider text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Quejas abiertas
            </h3>
            <Link
              href="/admin/reports"
              className="text-xs font-semibold uppercase tracking-wider text-[#C5A55A] hover:text-white"
            >
              Ver todas →
            </Link>
          </div>
          <div className="space-y-2">
            {overview.pendingReports.map((report) => (
              <Link
                key={report.id}
                href="/admin/reports"
                className="flex items-center justify-between gap-4 rounded-xl border border-zinc-900 bg-zinc-950/60 px-4 py-3 text-sm hover:border-red-500/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-zinc-200">
                    <span className="font-semibold">
                      {report.subjectName ?? "Sujeto desconocido"}
                    </span>{" "}
                    <span className="text-zinc-500">· {report.category}</span>
                  </p>
                  <p className="truncate text-xs text-zinc-500">{report.description}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    report.priority === "urgente"
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : report.priority === "alta"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {report.priority}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 🚀 BOTÓN REFRESH RÁPIDO */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
            <div className="h-2 w-2 animate-ping rounded-full bg-emerald-200" />
          </div>
          <h2 className="text-base font-extrabold tracking-[0.2em] text-[#C5A55A] uppercase">
            Dashboard general
          </h2>
        </div>
        <button
          onClick={refreshAll}
          disabled={isPending}
          className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 transition-all hover:border-[#C5A55A] hover:text-white"
        >
          <RefreshCw
            className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
          />
          Sincronizar Todo
        </button>
      </div>

      {/* 🎛️ FILA 1: ACTORES DEL SISTEMA (IZQUIERDA) & EXPEDIENTE 360° (DERECHA) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* COLUMNA 1: 1. ACTORES DEL SISTEMA (4 Cols) */}
        <div className="flex flex-col lg:col-span-4 xl:col-span-4">
          <div className="flex flex-col h-full rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <span className="text-sm font-extrabold uppercase tracking-wider text-zinc-200">
                1. Actores del Sistema
              </span>
              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-900 p-1 text-xs">
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
                  className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold transition-all ${actorTab === "employee"
                    ? "bg-[#C5A55A] text-black shadow"
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
                  className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold transition-all ${actorTab === "driver"
                    ? "bg-[#C5A55A] text-black shadow"
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
                  className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold transition-all ${actorTab === "boss"
                    ? "bg-[#C5A55A] text-black shadow"
                    : "text-zinc-400 hover:text-white"
                    }`}
                >
                  Jefes ({filteredBosses.length})
                </button>
              </div>
            </div>

            {/* Barra de búsqueda de actores */}
            <div className="mt-3.5 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
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
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/90 py-2.5 pl-10 pr-9 text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#C5A55A] focus:outline-none transition-colors"
              />
              {actorSearchQuery && (
                <button
                  onClick={() => setActorSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 transition-colors"
                  title="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Lista compacta de selección rápida */}
            <div className="mt-3 flex flex-1 min-h-[300px] max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
              {actorTab === "employee" &&
                (filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => loadDossier("employee", emp.id)}
                      className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-left transition-all ${selectedActorId === emp.id
                        ? "border border-[#C5A55A] bg-[#C5A55A]/15 text-white shadow-md"
                        : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                          {emp.avatar ? (
                            <Image
                              src={emp.avatar}
                              alt={emp.name}
                              fill
                              sizes="32px"
                              className="object-cover"
                            />
                          ) : (
                            <Users className="h-4 w-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-zinc-100 text-sm truncate">{emp.name}</span>
                          {typeof emp.rankingPosition === "number" && (
                            <span
                              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${emp.rankingPosition === 1
                                ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                                : emp.rankingPosition === 2
                                  ? "bg-slate-300/20 border border-slate-300/50 text-slate-200"
                                  : emp.rankingPosition === 3
                                    ? "bg-amber-700/20 border border-amber-700/50 text-amber-400"
                                    : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                                }`}
                              title={`Puesto #${emp.rankingPosition} de ${emp.totalEmployees || 9} en el ranking`}
                            >
                              <Trophy className="h-3 w-3" />
                              #{emp.rankingPosition}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {emp.sancionada ? (
                          <span className="flex items-center gap-1 rounded-full bg-red-950/80 border border-red-500/40 px-2 py-0.5 text-xs font-bold text-red-400">
                            <ShieldAlert className="h-3 w-3" />
                            Sancionada
                          </span>
                        ) : (
                          <span
                            className={`h-3 w-3 rounded-full ${emp.disponible ? "bg-emerald-400" : "bg-zinc-600"
                              }`}
                            title={emp.disponible ? "Disponible" : "No disponible"}
                          />
                        )}
                        <span className="text-xs sm:text-sm text-zinc-300 font-semibold">
                          ${emp.precioBaseHora}/h
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center text-sm text-zinc-500">
                    No se encontraron empleadas para &quot;{actorSearchQuery}&quot;
                  </div>
                ))}

              {actorTab === "driver" &&
                (filteredDrivers.length > 0 ? (
                  filteredDrivers.map((drv) => (
                    <button
                      key={drv.id}
                      onClick={() => loadDossier("driver", drv.id)}
                      className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-left transition-all ${selectedActorId === drv.id
                        ? "border border-blue-500/60 bg-blue-500/15 text-white shadow-md"
                        : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Car className="h-5 w-5 shrink-0 text-blue-400" />
                        <span className="font-bold text-zinc-100 text-sm truncate">{drv.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {drv.sancionada ? (
                          <span className="flex items-center gap-1 rounded-full bg-red-950/80 border border-red-500/40 px-2 py-0.5 text-xs font-bold text-red-400">
                            <ShieldAlert className="h-3 w-3" />
                            Sancionado
                          </span>
                        ) : (
                          <span
                            className={`h-3 w-3 rounded-full ${drv.disponible ? "bg-emerald-400" : "bg-zinc-600"
                              }`}
                            title={drv.disponible ? "Disponible" : "No disponible"}
                          />
                        )}
                        <span className="text-xs sm:text-sm text-zinc-300 truncate max-w-[120px]">
                          {drv.vehiculoModelo || "Sin auto"}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center text-sm text-zinc-500">
                    No se encontraron choferes para &quot;{actorSearchQuery}&quot;
                  </div>
                ))}

              {actorTab === "boss" &&
                (filteredBosses.length > 0 ? (
                  filteredBosses.map((boss) => (
                    <button
                      key={boss.id}
                      onClick={() => loadDossier("boss", boss.id)}
                      className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-left transition-all ${selectedActorId === boss.id
                        ? "border border-amber-500/60 bg-amber-500/15 text-white shadow-md"
                        : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Shield className="h-5 w-5 shrink-0 text-amber-400" />
                        <span className="font-bold text-zinc-100 text-sm truncate">{boss.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {boss.sancionada ? (
                          <span className="flex items-center gap-1 rounded-full bg-red-950/80 border border-red-500/40 px-2 py-0.5 text-xs font-bold text-red-400">
                            <ShieldAlert className="h-3 w-3" />
                            Sancionado
                          </span>
                        ) : (
                          <span
                            className={`h-3 w-3 rounded-full ${boss.activo ? "bg-emerald-400" : "bg-zinc-600"
                              }`}
                            title={boss.activo ? "Activo" : "Inactivo"}
                          />
                        )}
                        <span className="text-xs sm:text-sm uppercase text-zinc-300 font-bold">
                          {boss.rol}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center text-sm text-zinc-500">
                    No se encontraron jefes para &quot;{actorSearchQuery}&quot;
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* COLUMNA 2: FICHA 360° DEL ACTOR SELECCIONADO (8 Cols) */}
        <div className="flex flex-col lg:col-span-8 xl:col-span-8">
          <div className="flex flex-1 flex-col rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl h-full">
            {loadingDossier ? (
              <div className="flex h-64 items-center justify-center text-base font-semibold text-zinc-400">
                <RefreshCw className="mr-2.5 h-5 w-5 animate-spin text-[#C5A55A]" />
                Cargando radiografía 360°...
              </div>
            ) : dossier ? (
              <div className="flex flex-col gap-4">
                {/* CABECERA DEL EXPEDIENTE */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-zinc-700 bg-zinc-900 flex items-center justify-center shadow-lg">
                      {dossier.profile?.fotoPerfilUrl ? (
                        <Image
                          src={dossier.profile.fotoPerfilUrl}
                          alt="Avatar"
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <Users className="h-8 w-8 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className="font-extrabold text-white text-lg sm:text-2xl truncate"
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
                            className={`h-3 w-3 rounded-full ${dossier.profile?.disponible
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
                      <p className="text-sm text-zinc-300 font-medium truncate mt-0.5">
                        {dossier.profile?.nombreReal
                          ? `Nombre real: ${dossier.profile.nombreReal}`
                          : dossier.profile?.telefono ||
                          (dossier.profile?.rol
                            ? `Rol: ${dossier.profile.rol}`
                            : "")}
                      </p>

                      {/* Badges de estado rápido con Ranking, Estrellas separadas y Confianza con Tooltip */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {/* Ranking General */}
                        {dossier.actorType === "employee" && (
                          <span
                            className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/50 px-2.5 py-1 font-bold text-amber-300 shadow-sm"
                            title={`Posición en el ranking general de la agencia`}
                          >
                            <Trophy className="h-3.5 w-3.5 text-amber-400" />
                            Ranking #{dossier.ranking?.position || 1} de {dossier.ranking?.total || 9}
                          </span>
                        )}

                        {/* Estrellas Clientes */}
                        {dossier.actorType === "employee" && (
                          <span
                            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1 font-semibold text-zinc-200"
                            title={`Promedio de valoraciones hechas por clientes`}
                          >
                            <Users className="h-3.5 w-3.5 text-[#C5A55A]" />
                            Clientes: ⭐ {dossier.ratingsSummary?.client.average ?? 5.0} ({dossier.ratingsSummary?.client.count ?? 0})
                          </span>
                        )}

                        {/* Estrellas Choferes */}
                        {dossier.actorType === "employee" && (
                          <span
                            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1 font-semibold text-zinc-200"
                            title={`Promedio de valoraciones hechas por choferes de traslado`}
                          >
                            <Car className="h-3.5 w-3.5 text-blue-400" />
                            Choferes: ⭐ {dossier.ratingsSummary?.driver.average ?? 5.0} ({dossier.ratingsSummary?.driver.count ?? 0})
                          </span>
                        )}

                        {/* Confianza (Onboarding) con Tooltip explicativo al hacer hover */}
                        {dossier.actorType === "employee" && (
                          <div className="group relative inline-flex items-center gap-1.5 rounded-lg bg-[#C5A55A]/15 border border-[#C5A55A]/40 px-2.5 py-1 font-bold text-[#E8D5A3] shadow-sm cursor-help">
                            <Award className="h-3.5 w-3.5 text-[#C5A55A]" />
                            Confianza: {dossier.onboarding?.trustScore || 1}/5
                            <HelpCircle className="h-3.5 w-3.5 text-zinc-400 group-hover:text-white transition-colors" />

                            {/* Tooltip flotante al hacer hover */}
                            <div className="pointer-events-none absolute left-0 bottom-full mb-2 hidden w-64 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs font-normal leading-relaxed text-zinc-200 shadow-2xl group-hover:block z-40">
                              <p className="font-bold text-[#C5A55A] mb-1 flex items-center gap-1.5">
                                <Award className="h-3.5 w-3.5" /> Nivel de Confianza (Onboarding)
                              </p>
                              Acreditación del examen de reglamento operativo (1 a 5 según puntaje obtenido y número de intentos requeridos).
                            </div>
                          </div>
                        )}

                        {dossier.profile?.apartmentNombre && (
                          <span className="flex items-center gap-1.5 rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1 font-semibold text-zinc-300">
                            <MapPin className="h-3.5 w-3.5 text-[#C5A55A]" />
                            {dossier.profile.apartmentNombre}
                          </span>
                        )}

                        {dossier.actorType === "employee" && dossier.finances && (
                          dossier.finances.totalOwed > 0 ? (
                            <span className="flex items-center gap-1.5 rounded-lg bg-red-950/80 border border-red-500/50 px-2.5 py-1 font-bold text-red-300">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                              Debe ${dossier.finances.totalOwed.toLocaleString()} MXN
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 font-bold text-emerald-300">
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              Al día ($0 deuda)
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSanctionModal(true)}
                    className="flex shrink-0 self-start sm:self-center items-center gap-2 rounded-xl border border-red-500/50 bg-red-950/50 px-4 py-2.5 text-sm font-bold text-red-300 transition-all hover:bg-red-900 shadow-md"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Sancionar
                  </button>
                </div>

                {/* VISTA SEGÚN TIPO DE ACTOR */}
                {dossier.actorType === "employee" ? (
                  <div className="flex flex-col gap-3.5">
                    {/* BARRA DE NAVEGACIÓN DE SUB-PESTAÑAS */}
                    <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
                      <button
                        onClick={() => setDossierSection("services")}
                        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all ${dossierSection === "services"
                          ? "bg-[#C5A55A] text-black shadow-md"
                          : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                          }`}
                      >
                        <Layers className="h-4 w-4" />
                        Servicios ({dossier.services?.length || 0})
                      </button>
                      <button
                        onClick={() => setDossierSection("finances")}
                        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all ${dossierSection === "finances"
                          ? "bg-[#C5A55A] text-black shadow-md"
                          : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                          }`}
                      >
                        <Banknote className="h-4 w-4" />
                        Finanzas & Deudas
                        {dossier.finances?.totalOwed ? (
                          <span className="rounded-full bg-red-500/30 px-2 py-0.5 text-xs text-red-200 font-bold">
                            ${dossier.finances.totalOwed}
                          </span>
                        ) : null}
                      </button>
                      <button
                        onClick={() => setDossierSection("onboarding")}
                        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all ${dossierSection === "onboarding"
                          ? "bg-[#C5A55A] text-black shadow-md"
                          : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                          }`}
                      >
                        <GraduationCap className="h-4 w-4" />
                        Exámenes & Onboarding
                        {dossier.onboarding?.attempts?.length ? (
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 font-bold">
                            {dossier.onboarding.attempts.length}
                          </span>
                        ) : null}
                      </button>
                      <button
                        onClick={() => setDossierSection("photos_challenges")}
                        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all ${dossierSection === "photos_challenges"
                          ? "bg-[#C5A55A] text-black shadow-md"
                          : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                          }`}
                      >
                        <Camera className="h-4 w-4" />
                        Fotos & Retos
                      </button>
                      <button
                        onClick={() => setDossierSection("reputation")}
                        className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition-all ${dossierSection === "reputation"
                          ? "bg-[#C5A55A] text-black shadow-md"
                          : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                          }`}
                      >
                        <Scale className="h-4 w-4" />
                        Reputación & Sanciones
                      </button>
                    </div>

                    {/* CONTENIDO DE SUB-PESTAÑA 1: SERVICIOS */}
                    {dossierSection === "services" && (
                      <div className="flex flex-col gap-3.5">
                        {/* Filtros de servicios */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            {(["all", "active", "completed", "cancelled"] as const).map((filterKey) => (
                              <button
                                key={filterKey}
                                onClick={() => setServiceStatusFilter(filterKey)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${serviceStatusFilter === filterKey
                                  ? "bg-zinc-700 text-white shadow-sm"
                                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                                  }`}
                              >
                                {filterKey === "all"
                                  ? `Todos (${dossier.services?.length || 0})`
                                  : filterKey === "active"
                                    ? `Activos (${dossier.services?.filter((s: any) =>
                                      ["pendiente", "en_curso"].includes(s.estado),
                                    ).length || 0
                                    })`
                                    : filterKey === "completed"
                                      ? `Completados (${dossier.services?.filter(
                                        (s: any) => s.estado === "completado",
                                      ).length || 0
                                      })`
                                      : `Cancelados (${dossier.services?.filter(
                                        (s: any) => s.estado === "cancelado",
                                      ).length || 0
                                      })`}
                              </button>
                            ))}
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-zinc-400">
                            Tarifa base: <span className="text-white font-bold">${dossier.profile?.precioBaseHora || 0}/h</span>
                          </span>
                        </div>

                        {/* Lista de servicios */}
                        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
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
                                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs sm:text-sm flex flex-col gap-3 transition-all hover:border-zinc-700 shadow-md"
                                >
                                  {/* Encabezado del servicio con botón de gestionar */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-2.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`h-2.5 w-2.5 rounded-full ${s.estado === "en_curso"
                                          ? "bg-emerald-400 animate-ping"
                                          : s.estado === "pendiente"
                                            ? "bg-amber-400"
                                            : s.estado === "completado"
                                              ? "bg-emerald-500"
                                              : "bg-red-500"
                                          }`}
                                      />
                                      <span className="font-mono text-zinc-300 font-bold text-sm">
                                        #{s.id.slice(0, 8)}
                                      </span>
                                      <span
                                        className={`rounded-lg px-2 py-0.5 text-xs font-extrabold uppercase ${s.estado === "en_curso"
                                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                          : s.estado === "pendiente"
                                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                            : s.estado === "completado"
                                              ? "bg-zinc-800 text-zinc-200"
                                              : "bg-red-500/20 text-red-300 border border-red-500/30"
                                          }`}
                                      >
                                        {s.estado}
                                      </span>
                                      <span className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-xs text-zinc-300 font-semibold uppercase">
                                        {s.serviceType || "individual"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs text-zinc-400 font-medium">
                                        {new Date(s.createdAt).toLocaleString("es-MX", {
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                      {/* BOTÓN VER / GESTIONAR SERVICIO */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenServiceDetail(s.id);
                                        }}
                                        disabled={loadingServiceDetail}
                                        className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-100 hover:border-[#C5A55A] hover:text-[#E8D5A3] transition-all shadow-sm"
                                      >
                                        <Eye className="h-3.5 w-3.5 text-[#C5A55A]" />
                                        Ver / Gestionar
                                      </button>
                                    </div>
                                  </div>

                                  {/* Badges de problemas e indicadores de salud del servicio */}
                                  <ServiceProblemBadges service={s} />

                                  {/* Detalles en 2 columnas */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                                    {/* Cliente & Chofer */}
                                    <div className="space-y-1.5">
                                      <p className="text-zinc-200 font-medium">
                                        <span className="text-zinc-400 font-semibold">Cliente:</span>{" "}
                                        {s.clienteNombre || "Sin nombre"}
                                        {s.clienteTelefono ? ` (${s.clienteTelefono})` : ""}
                                      </p>
                                      {s.viajes && s.viajes.length > 0 ? (
                                        <div className="space-y-1 pt-1">
                                          <span className="text-zinc-400 font-bold block text-xs uppercase tracking-wider">
                                            Traslados / Chofer:
                                          </span>
                                          {s.viajes.map((v: any, idx: number) => (
                                            <p key={idx} className="text-zinc-200 text-xs font-medium">
                                              🚗 <span className="text-amber-400 capitalize font-semibold">{v.tipo}:</span>{" "}
                                              {v.choferNombre || "Uber"}
                                              {v.vehiculoModelo ? ` (${v.vehiculoModelo})` : ""}{" "}
                                              · ${v.tarifa || 0} ·{" "}
                                              <span className="text-zinc-400 font-bold uppercase">{v.estado}</span>
                                            </p>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-zinc-500 italic text-xs">
                                          Sin chofer asignado
                                        </p>
                                      )}
                                    </div>

                                    {/* Cobro, Duración & Total */}
                                    <div className="space-y-1 sm:text-right">
                                      <p className="text-zinc-200">
                                        <span className="text-zinc-400 font-semibold">Pago:</span>{" "}
                                        <span className="font-bold uppercase text-zinc-100">
                                          {s.metodoPago}
                                        </span>{" "}
                                        · {s.duracionPactadaHoras}h
                                        {s.duracionFinalHoras ? ` (real: ${s.duracionFinalHoras}h)` : ""}
                                      </p>
                                      <p className="text-base sm:text-lg font-extrabold text-[#C5A55A]">
                                        ${s.totalFinal || 0} MXN
                                      </p>
                                      {s.extrasServicio && s.extrasServicio.length > 0 && (
                                        <p className="text-xs text-zinc-300">
                                          Extras: {s.extrasServicio.map((e: any) => `${e.nombre} (+$${e.precio})`).join(", ")}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Ubicación o Notas */}
                                  {(s.hotelODomicilio || s.ubicacion || s.notas) && (
                                    <div className="border-t border-zinc-900/80 pt-2 text-xs text-zinc-300 flex flex-wrap items-center justify-between gap-1">
                                      {(s.hotelODomicilio || s.ubicacion) && (
                                        <span className="flex items-center gap-1.5">
                                          <MapPin className="h-3.5 w-3.5 text-[#C5A55A]" />
                                          {s.hotelODomicilio} {s.ubicacion ? `(${s.ubicacion})` : ""}
                                        </span>
                                      )}
                                      {s.notas && (
                                        <span className="italic text-zinc-400">
                                          &ldquo;{s.notas}&rdquo;
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))
                          ) : (
                            <p className="py-8 text-center text-sm text-zinc-500">
                              No hay servicios registrados para este filtro.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 2: FINANZAS & DEUDAS */}
                    {dossierSection === "finances" && (
                      <div className="flex flex-col gap-3.5">
                        {/* 3 KPIs financieros */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-3.5">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-red-400">
                              Deuda Consolidada
                            </span>
                            <p className="mt-1 text-lg sm:text-xl font-extrabold text-red-300">
                              ${dossier.finances?.totalOwed?.toLocaleString() || 0} MXN
                            </p>
                          </div>
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                              Efectivo en Calle
                            </span>
                            <p className="mt-1 text-lg sm:text-xl font-extrabold text-[#C5A55A]">
                              ${dossier.finances?.totalCashDue?.toLocaleString() || 0} MXN
                            </p>
                          </div>
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                              Deuda Liquidación
                            </span>
                            <p className="mt-1 text-lg sm:text-xl font-extrabold text-amber-400">
                              ${dossier.finances?.totalDebt?.toLocaleString() || 0} MXN
                            </p>
                          </div>
                        </div>

                        {/* Último corte de liquidación */}
                        {dossier.finances?.recentSettlement && (
                          <div className="rounded-2xl border border-[#C5A55A]/40 bg-[#C5A55A]/10 p-4 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#E8D5A3]">
                                Último Corte Semanal ({dossier.finances.recentSettlement.semanaInicio} al {dossier.finances.recentSettlement.semanaFin})
                              </span>
                              <span className="rounded-lg bg-[#C5A55A]/20 border border-[#C5A55A]/30 px-2.5 py-1 text-xs font-bold text-[#E8D5A3] uppercase">
                                {dossier.finances.recentSettlement.status}
                              </span>
                            </div>
                            <p className="mt-1.5 text-base font-extrabold text-white">
                              Ganancia Neta: ${dossier.finances.recentSettlement.netAmount} MXN
                            </p>
                          </div>
                        )}

                        {/* Desglose de efectivo pendiente */}
                        <div>
                          <h5 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2">
                            Obligaciones de Efectivo en Calle
                          </h5>
                          <div className="flex max-h-36 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.finances?.cashObligations && dossier.finances.cashObligations.length > 0 ? (
                              dossier.finances.cashObligations.map((o: any) => (
                                <div
                                  key={o.id}
                                  className="flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950 px-3.5 py-2.5 text-xs sm:text-sm"
                                >
                                  <div>
                                    <span className="font-bold text-zinc-200">
                                      Pendiente: ${o.montoRestante} MXN
                                    </span>
                                    <span className="text-xs text-zinc-400 ml-2">
                                      (Total: ${o.montoOriginal} · Abonado: ${o.montoPagado || 0})
                                    </span>
                                  </div>
                                  <span className="text-xs text-zinc-400 font-medium">
                                    {new Date(o.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-1">
                                Sin obligaciones de efectivo pendientes.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Desglose de deudas de liquidación */}
                        <div>
                          <h5 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2">
                            Deudas de Liquidación Acumuladas
                          </h5>
                          <div className="flex max-h-36 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.finances?.liquidationDebts && dossier.finances.liquidationDebts.length > 0 ? (
                              dossier.finances.liquidationDebts.map((d: any) => (
                                <div
                                  key={d.id}
                                  className="flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950 px-3.5 py-2.5 text-xs sm:text-sm"
                                >
                                  <div>
                                    <span className="font-bold text-red-300">
                                      ${d.amount} MXN
                                    </span>
                                    <span className="text-xs text-zinc-300 ml-2">
                                      {d.description}
                                    </span>
                                  </div>
                                  <span className="text-xs text-zinc-400 font-medium">
                                    {new Date(d.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-1">
                                Sin deudas de liquidación registradas.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 3: EXÁMENES & ONBOARDING */}
                    {dossierSection === "onboarding" && (
                      <div className="flex flex-col gap-3.5">
                        {/* Tarjeta de Onboarding */}
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm flex flex-col gap-3 shadow-md">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GraduationCap className="h-5 w-5 text-[#C5A55A]" />
                              <span className="font-extrabold text-white text-base">
                                Onboarding de Reglamento Operativo
                              </span>
                            </div>
                            <span
                              className={`rounded-lg px-2.5 py-1 text-xs font-extrabold uppercase ${dossier.onboarding?.status === "completed"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : dossier.onboarding?.status === "in_progress"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-zinc-800 text-zinc-300"
                                }`}
                            >
                              {dossier.onboarding?.status || "No iniciado"}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2.5 pt-1 text-center">
                            <div className="rounded-xl bg-zinc-900 p-2.5">
                              <span className="text-xs text-zinc-400 uppercase font-bold">
                                Intentos
                              </span>
                              <p className="font-extrabold text-white text-lg mt-0.5">
                                {dossier.onboarding?.attemptCount || dossier.onboarding?.attempts?.length || 0}
                              </p>
                            </div>
                            <div className="rounded-lg bg-zinc-900 p-2.5">
                              <span className="text-xs text-zinc-400 uppercase font-bold">
                                Mejor Puntaje
                              </span>
                              <p className="font-extrabold text-[#C5A55A] text-lg mt-0.5">
                                {dossier.onboarding?.bestScore || 0}%
                              </p>
                            </div>
                            <div className="rounded-lg bg-zinc-900 p-2.5">
                              <span className="text-xs text-zinc-400 uppercase font-bold">
                                Confianza
                              </span>
                              <p className="font-extrabold text-amber-400 text-lg mt-0.5">
                                {dossier.onboarding?.trustScore || 1}/5
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Historial de intentos */}
                        <div>
                          <h5 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2">
                            Historial de Intentos de Examen
                          </h5>
                          <div className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.onboarding?.attempts && dossier.onboarding.attempts.length > 0 ? (
                              dossier.onboarding.attempts.map((att: any) => (
                                <div
                                  key={att.id || att.attemptNumber}
                                  className="rounded-xl border border-zinc-900 bg-zinc-950 p-3.5 text-xs sm:text-sm flex items-center justify-between"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-zinc-100">
                                        Intento #{att.attemptNumber}
                                      </span>
                                      <span
                                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${att.status === "completed"
                                          ? "bg-emerald-500/20 text-emerald-300"
                                          : "bg-amber-500/20 text-amber-300"
                                          }`}
                                      >
                                        {att.status === "completed" ? "Completado" : "En progreso"}
                                      </span>
                                    </div>
                                    <p className="text-xs text-zinc-300 mt-1">
                                      Aciertos: {att.correctAnswers} / {att.totalQuestions} preguntas
                                      {att.completedAt ? ` · ${new Date(att.completedAt).toLocaleDateString()}` : ""}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-lg font-extrabold text-[#C5A55A]">
                                      {att.score}%
                                    </span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-2">
                                No se han registrado intentos de examen.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Screening de candidata si existe */}
                        {dossier.onboarding?.screening && (
                          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-xs sm:text-sm">
                            <span className="text-xs uppercase font-extrabold text-zinc-400">
                              Evaluación Inicial de Candidata
                            </span>
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="text-zinc-100 font-semibold">
                                {dossier.onboarding.screening.candidateName}
                                {dossier.onboarding.screening.candidatePhone ? ` (${dossier.onboarding.screening.candidatePhone})` : ""}
                              </span>
                              <span className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 font-bold uppercase">
                                {dossier.onboarding.screening.status}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 4: FOTOS & RETOS */}
                    {dossierSection === "photos_challenges" && (
                      <div className="flex flex-col gap-3.5">
                        {/* Fotos Semanales */}
                        <div>
                          <h5 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2 flex items-center justify-between">
                            <span>Fotos Semanales Obligatorias</span>
                            <span className="text-xs text-zinc-400 font-medium">
                              {dossier.weeklyPhotos?.length || 0} Registradas
                            </span>
                          </h5>
                          <div className="flex max-h-44 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.weeklyPhotos && dossier.weeklyPhotos.length > 0 ? (
                              dossier.weeklyPhotos.map((p: any) => (
                                <div
                                  key={p.id}
                                  className="flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-950 px-3.5 py-2.5 text-xs sm:text-sm"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <Camera className="h-4 w-4 text-[#C5A55A]" />
                                    <span className="text-zinc-200 font-semibold">
                                      Semana: {p.semanaInicio || "General"}
                                    </span>
                                    <span
                                      className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${p.estado === "aprobada_publica"
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
                                      className="text-[#C5A55A] hover:underline text-xs font-bold"
                                    >
                                      Ver Foto
                                    </a>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-1">
                                Sin envíos de fotos registrados.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Retos y Desafíos */}
                        <div>
                          <h5 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2">
                            Retos y Desafíos Activos
                          </h5>
                          <div className="flex max-h-44 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.challenges && dossier.challenges.length > 0 ? (
                              dossier.challenges.map((c: any) => (
                                <div
                                  key={c.id}
                                  className="rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-xs sm:text-sm flex flex-col gap-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-white">
                                      🏆 {c.titulo}
                                    </span>
                                    <span className="rounded-md bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-xs font-bold text-amber-300">
                                      +{c.puntos} pts
                                    </span>
                                  </div>
                                  {c.descripcion && (
                                    <p className="text-xs text-zinc-300">
                                      {c.descripcion}
                                    </p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-1">
                                Sin retos inscritos actualmente.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CONTENIDO DE SUB-PESTAÑA 5: REPUTACIÓN & SANCIONES (CON ESTRELLAS SEPARADAS) */}
                    {dossierSection === "reputation" && (
                      <div className="flex flex-col gap-4">
                        {/* RESUMEN DE ESTRELLAS SEPARADAS: CLIENTES VS CHOFERES */}
                        {dossier.ratingsSummary && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Card Clientes */}
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5 shadow-md">
                              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-[#C5A55A]" />
                                  <span className="text-xs font-extrabold uppercase text-zinc-200">
                                    Clientes
                                  </span>
                                </div>
                                <span className="text-xs text-zinc-400 font-semibold">
                                  {dossier.ratingsSummary.client.count} reseñas
                                </span>
                              </div>
                              <div className="mt-2.5 flex items-baseline gap-2">
                                <span className="text-2xl font-extrabold text-amber-400">
                                  ⭐ {dossier.ratingsSummary.client.average}
                                </span>
                                <span className="text-xs text-zinc-400">/ 5.0</span>
                              </div>
                              <div className="mt-2 flex flex-col gap-1 text-[11px] text-zinc-400">
                                <div className="flex items-center justify-between">
                                  <span>5 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.client.stars_5}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>4 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.client.stars_4}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>3 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.client.stars_3}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>2 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.client.stars_2}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>1 ⭐</span>
                                  <span className="font-semibold text-red-400">{dossier.ratingsSummary.client.stars_1}</span>
                                </div>
                              </div>
                            </div>

                            {/* Card Choferes */}
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5 shadow-md">
                              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                                <div className="flex items-center gap-2">
                                  <Car className="h-4 w-4 text-blue-400" />
                                  <span className="text-xs font-extrabold uppercase text-zinc-200">
                                    Choferes
                                  </span>
                                </div>
                                <span className="text-xs text-zinc-400 font-semibold">
                                  {dossier.ratingsSummary.driver.count} reseñas
                                </span>
                              </div>
                              <div className="mt-2.5 flex items-baseline gap-2">
                                <span className="text-2xl font-extrabold text-blue-400">
                                  ⭐ {dossier.ratingsSummary.driver.average}
                                </span>
                                <span className="text-xs text-zinc-400">/ 5.0</span>
                              </div>
                              <div className="mt-2 flex flex-col gap-1 text-[11px] text-zinc-400">
                                <div className="flex items-center justify-between">
                                  <span>5 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.driver.stars_5}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>4 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.driver.stars_4}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>3 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.driver.stars_3}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>2 ⭐</span>
                                  <span className="font-semibold text-zinc-200">{dossier.ratingsSummary.driver.stars_2}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>1 ⭐</span>
                                  <span className="font-semibold text-red-400">{dossier.ratingsSummary.driver.stars_1}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Filtros de origen de calificaciones */}
                        <div>
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                              Calificaciones & Reseñas Detalladas
                            </h4>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setRatingSourceFilter("all")}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${ratingSourceFilter === "all"
                                  ? "bg-zinc-700 text-white"
                                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                                  }`}
                              >
                                Todas ({dossier.ratings?.length || 0})
                              </button>
                              <button
                                onClick={() => setRatingSourceFilter("client")}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${ratingSourceFilter === "client"
                                  ? "bg-[#C5A55A] text-black"
                                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                                  }`}
                              >
                                Clientes ({dossier.ratingsSummary?.client.count || 0})
                              </button>
                              <button
                                onClick={() => setRatingSourceFilter("driver")}
                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${ratingSourceFilter === "driver"
                                  ? "bg-blue-500 text-white"
                                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                                  }`}
                              >
                                Choferes ({dossier.ratingsSummary?.driver.count || 0})
                              </button>
                            </div>
                          </div>

                          <div className="mt-2.5 flex max-h-48 flex-col gap-2.5 overflow-y-auto pr-1">
                            {dossier.ratings &&
                              dossier.ratings.filter((r: any) => {
                                if (ratingSourceFilter === "client")
                                  return r.direction === "client_to_employee";
                                if (ratingSourceFilter === "driver")
                                  return r.direction === "driver_to_employee";
                                return true;
                              }).length > 0 ? (
                              dossier.ratings
                                .filter((r: any) => {
                                  if (ratingSourceFilter === "client")
                                    return r.direction === "client_to_employee";
                                  if (ratingSourceFilter === "driver")
                                    return r.direction === "driver_to_employee";
                                  return true;
                                })
                                .map((r: any) => (
                                  <div
                                    key={r.id}
                                    className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3.5 text-xs sm:text-sm shadow-sm"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-amber-400 text-base">
                                          {"⭐".repeat(r.stars)}
                                        </span>
                                        <span className="text-xs font-bold text-zinc-300">
                                          ({r.stars}/5)
                                        </span>
                                      </div>
                                      <span
                                        className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${r.direction === "client_to_employee"
                                          ? "bg-[#C5A55A]/20 text-[#E8D5A3]"
                                          : "bg-blue-500/20 text-blue-300"
                                          }`}
                                      >
                                        {r.direction === "client_to_employee"
                                          ? "👤 Cliente"
                                          : r.direction === "driver_to_employee"
                                            ? "🚗 Chofer"
                                            : r.direction}
                                      </span>
                                    </div>
                                    {r.comment && (
                                      <p className="mt-2 italic text-zinc-100 text-xs sm:text-sm leading-relaxed">
                                        &ldquo;{r.comment}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                ))
                            ) : (
                              <p className="text-sm text-zinc-500 py-3 text-center">
                                Sin calificaciones registradas para este filtro.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Historial de Sanciones */}
                        <div>
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2">
                            Sanciones & Amonestaciones
                          </h4>
                          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                            {dossier.sanctions && dossier.sanctions.length > 0 ? (
                              dossier.sanctions.map((s: any) => (
                                <div
                                  key={s.id}
                                  onClick={() => setSelectedSanctionDetail(s)}
                                  className={`group relative flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs sm:text-sm cursor-pointer transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/60 ${s.status === "active"
                                    ? "border-red-900/60 bg-red-950/30 hover:border-red-700/80"
                                    : "border-zinc-900 bg-zinc-950/60 opacity-75 hover:opacity-100"
                                    }`}
                                >
                                  <div className="flex-1 pr-2 min-w-0 overflow-hidden">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className={`font-extrabold uppercase text-xs sm:text-sm ${s.status === "active"
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
                                        <span className="rounded-md bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-xs font-bold text-red-300">
                                          -${s.fineAmount} MXN
                                        </span>
                                      )}
                                      <span
                                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status === "active"
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
                                    <p className="text-xs sm:text-sm text-zinc-200 mt-1 truncate block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                      {s.reason || "Sin motivo especificado"}
                                    </p>
                                    {s.revocationReason && (
                                      <p className="text-xs text-zinc-400 italic mt-0.5 truncate block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                        Motivo revocación: {s.revocationReason}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {s.status === "active" && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRevokingSanctionId(s.id);
                                          setShowRevokeModal(true);
                                        }}
                                        className="rounded-xl border border-red-500/40 bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-900 transition-colors shadow-sm"
                                      >
                                        Revocar
                                      </button>
                                    )}
                                    <ChevronRight
                                      size={16}
                                      className="text-zinc-600 group-hover:text-[#C5A55A] transition-colors"
                                    />
                                  </div>
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
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2">
                        Últimas Calificaciones & Reseñas
                      </h4>
                      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                        {dossier.ratings && dossier.ratings.length > 0 ? (
                          dossier.ratings.map((r: any) => (
                            <div
                              key={r.id}
                              className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3.5 text-xs sm:text-sm"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-amber-400 text-base">
                                  {"⭐".repeat(r.stars)}
                                </span>
                                <span className="text-xs text-zinc-400 font-semibold">
                                  {r.direction}
                                </span>
                              </div>
                              {r.comment && (
                                <p className="mt-1.5 italic text-zinc-100 text-xs sm:text-sm">
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
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 mb-2">
                        Sanciones & Amonestaciones
                      </h4>
                      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
                        {dossier.sanctions && dossier.sanctions.length > 0 ? (
                          dossier.sanctions.map((s: any) => (
                            <div
                              key={s.id}
                              onClick={() => setSelectedSanctionDetail(s)}
                              className={`group relative flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs sm:text-sm cursor-pointer transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/60 ${s.status === "active"
                                ? "border-red-900/50 bg-red-950/20 hover:border-red-700/80"
                                : "border-zinc-900 bg-zinc-950/60 opacity-75 hover:opacity-100"
                                }`}
                            >
                              <div className="flex-1 pr-2 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`font-extrabold uppercase text-xs sm:text-sm ${s.status === "active"
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
                                    <span className="rounded-md bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-xs font-bold text-red-300">
                                      -${s.fineAmount} MXN
                                    </span>
                                  )}
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.status === "active"
                                      ? "bg-red-500/20 text-red-300"
                                      : "bg-zinc-800 text-zinc-400"
                                      }`}
                                  >
                                    {s.status === "active" ? "Activa" : "Revocada/Expirada"}
                                  </span>
                                </div>
                                <p className="text-xs sm:text-sm text-zinc-200 mt-1 truncate block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                  {s.reason || "Sin motivo especificado"}
                                </p>
                                {s.revocationReason && (
                                  <p className="text-xs text-zinc-400 italic mt-0.5 truncate block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                    Motivo revocación: {s.revocationReason}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {s.status === "active" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRevokingSanctionId(s.id);
                                      setShowRevokeModal(true);
                                    }}
                                    className="rounded-xl border border-red-500/40 bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-900 transition-colors shadow-sm"
                                  >
                                    Revocar
                                  </button>
                                )}
                                <ChevronRight
                                  size={16}
                                  className="text-zinc-600 group-hover:text-[#C5A55A] transition-colors"
                                />
                              </div>
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
              <p className="text-base text-zinc-400 text-center py-12">
                Selecciona un actor para ver su expediente 360°.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 🎛️ FILA 2: SERVICIOS & DIAGNÓSTICO (IZQUIERDA) & INTERCEPTOR DE CHAT (DERECHA) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* COLUMNA IZQUIERDA: 2. SERVICIOS & TRIANGULACIÓN + DIAGNÓSTICO CAUSAL (6 Cols) */}
        <div className="flex flex-col gap-6 lg:col-span-6 xl:col-span-6">
          {/* Selector de servicios activos / con incidentes */}
          <div className="rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <span className="text-sm font-extrabold uppercase tracking-wider text-zinc-200">
                2. Servicios & Triangulación de Incidentes
              </span>
              <div className="flex items-center gap-1 rounded-xl bg-zinc-900 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveServiceFilter("all")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${activeServiceFilter === "all"
                    ? "bg-[#C5A55A] text-black shadow"
                    : "text-zinc-400 hover:text-white"
                    }`}
                >
                  Todos ({overview.activeServices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveServiceFilter("alerts")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${activeServiceFilter === "alerts"
                    ? "bg-amber-500 text-black shadow"
                    : "text-amber-400/90 hover:text-amber-300"
                    }`}
                >
                  ⚠️ Alertas (
                  {
                    overview.activeServices.filter(
                      (s) => getServiceAlerts(s).length > 0,
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setActiveServiceFilter("clean")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${activeServiceFilter === "clean"
                    ? "bg-emerald-500 text-black shadow"
                    : "text-emerald-400/90 hover:text-emerald-300"
                    }`}
                >
                  ✅ Normales (
                  {
                    overview.activeServices.filter(
                      (s) => getServiceAlerts(s).length === 0,
                    ).length
                  }
                  )
                </button>
              </div>
            </div>

            <div className="mt-3.5 flex max-h-64 flex-col gap-2.5 overflow-y-auto pr-1">
              {filteredActiveServices.length > 0 ? (
                filteredActiveServices.map((srv) => {
                  const alerts = getServiceAlerts(srv);
                  const hasCritical = alerts.some((a) => a.severity === "critical");
                  const hasWarning = alerts.some((a) => a.severity === "warning");

                  return (
                    <div
                      key={srv.id}
                      onClick={() => loadIncident(srv.id)}
                      className={`flex flex-col gap-2 rounded-2xl p-3.5 text-left transition-all cursor-pointer ${selectedServiceId === srv.id
                        ? "border border-[#C5A55A] bg-[#C5A55A]/15 text-white shadow-md"
                        : hasCritical
                          ? "border border-red-900/60 bg-red-950/20 text-zinc-300 hover:border-red-700"
                          : hasWarning
                            ? "border border-amber-900/50 bg-amber-950/15 text-zinc-300 hover:border-amber-700"
                            : "border border-zinc-900 bg-zinc-950 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200"
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${srv.estado === "en_curso"
                              ? "bg-emerald-400 animate-ping"
                              : "bg-amber-400"
                              }`}
                          />
                          <span className="font-bold text-zinc-100 text-sm sm:text-base truncate">
                            {srv.empleadaNombre} · {srv.clienteNombre}
                          </span>
                          <span className="text-xs text-zinc-500 font-mono">
                            #{srv.id.slice(0, 6).toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${srv.iaActiva
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-red-500/20 text-red-300 border border-red-500/30"
                              }`}
                          >
                            {srv.iaActiva ? "🤖 IA ON" : "🛑 IA OFF"}
                          </span>
                          {/* Botón rápido para abrir modal de gestión */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenServiceDetail(srv.id);
                            }}
                            disabled={loadingServiceDetail}
                            className="rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:border-[#C5A55A] hover:text-[#E8D5A3] transition-all shadow-sm"
                            title="Ver y Gestionar Servicio Completo"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#C5A55A]" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-zinc-300 font-medium">
                        <span>
                          Duración: {srv.duracionPactadaHoras}h · ${srv.totalFinal} ({srv.metodoPago})
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {new Date(srv.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Badges de problemas e indicadores */}
                      <ServiceProblemBadges service={srv} />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-500 text-center py-6">
                  {activeServiceFilter === "alerts"
                    ? "🎉 ¡Excelente! No hay servicios activos con alertas o problemas."
                    : activeServiceFilter === "clean"
                      ? "No hay servicios sin alertas activas."
                      : "No hay servicios activos en curso en este momento."}
                </p>
              )}
            </div>
          </div>

          {/* MOTOR DE CAUSALIDAD DE CONFLICTOS */}
          <div className="flex-1 rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-sm font-extrabold uppercase tracking-wider text-[#C5A55A]">
                Diagnóstico Causal Automático
              </span>
              <Sparkles className="h-5 w-5 text-[#C5A55A]" />
            </div>

            {loadingIncident ? (
              <div className="flex h-52 items-center justify-center text-sm sm:text-base font-semibold text-zinc-400">
                <RefreshCw className="mr-2.5 h-5 w-5 animate-spin text-[#C5A55A]" />
                Triangulando tiempos GPS, reportes y chats...
              </div>
            ) : incidentData ? (
              <div className="mt-3.5 flex flex-col gap-3.5">
                {/* Diagnóstico Primario */}
                <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 shadow-md">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                    Diagnostico
                  </span>
                  <p className="mt-2 text-base sm:text-lg font-bold text-white leading-relaxed">
                    {incidentData.triangulationSummary.primaryDiagnosis}
                  </p>
                </div>

                {/* BOTÓN GESTIONAR SERVICIO SELECCIONADO */}
                {selectedServiceId && (
                  <button
                    type="button"
                    onClick={() => handleOpenServiceDetail(selectedServiceId)}
                    disabled={loadingServiceDetail}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-[#C5A55A] py-3 px-4 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-black shadow-lg hover:bg-[#D4AF37] transition-all"
                  >
                    <Eye className="h-4 w-4" />
                    Ver & Gestionar Servicio Completo #{selectedServiceId.slice(0, 8)}
                  </button>
                )}

                {/* Causas específicas detectadas */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                    Factores y Discrepancias Identificadas
                  </span>
                  {incidentData.detectedCauses.length > 0 ? (
                    incidentData.detectedCauses.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-red-900/40 bg-red-950/20 p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-300 text-sm sm:text-base">
                            {c.title}
                          </span>
                          <span className="rounded-lg bg-red-900/50 px-2.5 py-1 text-xs font-extrabold text-red-200 uppercase">
                            Causal: {c.culprit}
                          </span>
                        </div>
                        <p className="mt-2 text-zinc-200 text-xs sm:text-sm leading-relaxed">{c.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-zinc-400 text-xs sm:text-sm py-1.5">
                      Operación normal: tiempos de chofer y notas dentro de los parámetros.
                    </p>
                  )}
                </div>

                {/* Tiempos de Viaje / Chofer */}
                {incidentData.trips.length > 0 && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                      Cronograma de Traslados
                    </span>
                    <div className="mt-2.5 flex flex-col gap-2 text-xs sm:text-sm text-zinc-200">
                      {incidentData.trips.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between border-b border-zinc-900 py-2"
                        >
                          <span className="font-semibold text-zinc-200">
                            {t.tipo === "ida" ? "Ida" : "Regreso"}:{" "}
                            {t.choferNombre || t.proveedorTransporte}
                          </span>
                          <span className="font-bold text-zinc-400 uppercase text-xs">
                            {t.estado}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-6 text-sm text-zinc-500 text-center">
                Selecciona un servicio para analizar la causa de posibles discrepancias.
              </p>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: 3. INTERCEPTOR DE CHAT EN VIVO & OVERRIDES (6 Cols) */}
        <div className="flex flex-col lg:col-span-6 xl:col-span-6">
          <div className="flex flex-1 flex-col rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl h-full">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-sm font-extrabold uppercase tracking-wider text-zinc-200">
                3. Interceptor de Chat
              </span>
              <MessageSquare className="h-5 w-5 text-[#C5A55A]" />
            </div>

            {/* Switch de Pausa / Reanudación de IA */}
            <div className="mt-3.5 flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
              <div>
                <span className="text-sm sm:text-base font-bold text-white">Estado de IA</span>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                  {incidentData?.service?.ia_activa ?? true
                    ? "Respondiendo automáticamente"
                    : "Pausada indefinidamente"}
                </p>
              </div>
              <button
                onClick={() =>
                  handleToggleAi(incidentData?.service?.ia_activa ?? true)
                }
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-md ${incidentData?.service?.ia_activa ?? true
                  ? "bg-red-950 text-red-300 hover:bg-red-900 border border-red-800/40"
                  : "bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800/40"
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
            <div className="my-3.5 flex max-h-80 flex-1 flex-col gap-2.5 overflow-y-auto rounded-2xl border border-zinc-900 bg-black p-4 text-xs sm:text-sm">
              {incidentData?.conversations &&
                incidentData.conversations.length > 0 ? (
                incidentData.conversations.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col rounded-2xl p-3 ${msg.emisor === "cliente"
                      ? "self-start bg-zinc-900 text-zinc-100 border border-zinc-800"
                      : "self-end bg-[#C5A55A]/20 text-[#E8D5A3] border border-[#C5A55A]/30"
                      } max-w-[88%] shadow-sm`}
                  >
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
                      {msg.emisor}
                    </span>
                    <p className="mt-1 text-zinc-100 text-xs sm:text-sm leading-relaxed font-medium">{msg.mensaje}</p>
                  </div>
                ))
              ) : (
                <p className="text-center text-zinc-500 my-auto text-sm">
                  Selecciona un servicio para leer la conversación en tiempo real.
                </p>
              )}
            </div>

            {/* Envío Manual de Admin */}
            <div className="flex flex-col gap-3 border-t border-zinc-800 pt-3.5">
              <div className="flex gap-4 text-xs sm:text-sm">
                <label className="flex items-center gap-2 text-zinc-200 font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="identity"
                    checked={asIdentity === "jefe"}
                    onChange={() => setAsIdentity("jefe")}
                    className="accent-[#C5A55A]"
                  />
                  Agencia
                </label>
                <label className="flex items-center gap-2 text-zinc-200 font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="identity"
                    checked={asIdentity === "empleada"}
                    onChange={() => setAsIdentity("empleada")}
                    className="accent-[#C5A55A]"
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
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-[#C5A55A] focus:outline-none transition-colors"
                />
                <button
                  onClick={handleSendAdminMessage}
                  className="flex items-center justify-center rounded-xl bg-[#C5A55A] px-4 py-3 text-black font-bold transition-transform hover:scale-105 shadow-md"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ⚖️ FILA 3: BANDEJA DE APELACIONES & RESOLUCIÓN (ANCHO COMPLETO) */}
      <div className="rounded-3xl border border-zinc-800 bg-[#080808] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <Scale className="h-5 w-5 text-[#C5A55A]" />
            <span className="text-sm font-extrabold uppercase tracking-wider text-zinc-200">
              4. Bandeja de Apelaciones de Sanciones & Reseñas
            </span>
          </div>
          <span className="rounded-xl bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-xs font-extrabold text-amber-300">
            {appeals.length} Pendientes
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {appeals.length > 0 ? (
            appeals.map((app) => (
              <div
                key={app.id}
                className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs sm:text-sm shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-amber-400 text-base">
                      {"⭐".repeat(app.stars)} ({app.direction})
                    </span>
                    <span className="text-xs text-zinc-400 font-medium">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {app.comment && (
                    <p className="mt-2.5 italic text-zinc-200 text-xs sm:text-sm">
                      Queja original: &ldquo;{app.comment}&rdquo;
                    </p>
                  )}
                  {app.appealReason && (
                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                      <span className="text-xs font-bold text-zinc-400 uppercase">
                        Motivo de Apelación
                      </span>
                      <p className="mt-1 text-zinc-100 font-medium text-xs sm:text-sm">{app.appealReason}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2.5 border-t border-zinc-900 pt-3">
                  <button
                    onClick={() => handleResolveAppeal(app.id, "overturned")}
                    className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-950/50 py-2.5 text-center font-bold text-emerald-300 hover:bg-emerald-900 transition-colors shadow-sm"
                  >
                    Aprobar Apelación
                  </button>
                  <button
                    onClick={() => handleResolveAppeal(app.id, "upheld")}
                    className="flex-1 rounded-xl border border-red-500/40 bg-red-950/50 py-2.5 text-center font-bold text-red-300 hover:bg-red-900 transition-colors shadow-sm"
                  >
                    Mantener Sanción
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="col-span-full py-6 text-center text-sm text-zinc-500">
              No hay solicitudes de apelación pendientes en este momento.
            </p>
          )}
        </div>
      </div>

      {/* 🛑 MODAL DE SANCIÓN DIRECTA */}
      {showSanctionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#0c0c0c] p-6 shadow-2xl">
            <h3 className="text-lg font-extrabold text-white">
              Aplicar Sanción Disciplinaria
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400">
              Se enviará una notificación automática por Telegram con botón para apelar.
            </p>

            <div className="mt-4 flex flex-col gap-3.5 text-xs sm:text-sm">
              <div>
                <label className="text-zinc-300 font-bold">Tipo de Sanción</label>
                <select
                  value={sanctionType}
                  onChange={(e) => setSanctionType(e.target.value as any)}
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-[#C5A55A] focus:outline-none"
                >
                  <option value="suspension">Suspensión Temporal (Horas)</option>
                  <option value="fine">Multa Monetaria ($ Descuento en Liquidación)</option>
                  <option value="permanent_ban">Baneo Permanente</option>
                </select>
              </div>

              {sanctionType === "suspension" && (
                <div>
                  <label className="text-zinc-300 font-bold">Duración en Horas</label>
                  <input
                    type="number"
                    value={sanctionHours}
                    onChange={(e) => setSanctionHours(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-[#C5A55A] focus:outline-none"
                  />
                </div>
              )}

              {sanctionType === "fine" && (
                <div>
                  <label className="text-zinc-200 font-bold">Monto de la Multa ($ MXN)</label>
                  <input
                    type="number"
                    min="1"
                    step="50"
                    placeholder="Ej: 500"
                    value={sanctionFineAmount}
                    onChange={(e) => setSanctionFineAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-[#C5A55A]/50 bg-zinc-950 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-zinc-400">
                    Este monto se registrará como descuento automático en la liquidación semanal del usuario.
                  </p>
                </div>
              )}

              <div>
                <label className="text-zinc-300 font-bold">
                  Motivo detallado de la sanción
                </label>
                <textarea
                  rows={3}
                  value={sanctionReason}
                  onChange={(e) => setSanctionReason(e.target.value)}
                  placeholder="Ej: Impuntualidad reiterada en servicio #12..."
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                />
                <div className="mt-1.5 flex items-center justify-between px-0.5 text-[11px]">
                  <span
                    className={`flex items-center gap-1 font-medium transition-colors ${
                      sanctionReason.trim().length >= 3
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {sanctionReason.trim().length >= 3 ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Mínimo alcanzado
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3 w-3" /> Mínimo 3 caracteres ({3 - sanctionReason.trim().length} restantes)
                      </>
                    )}
                  </span>
                  <span className="text-zinc-500 font-mono ml-auto">
                    {sanctionReason.trim().length} caracteres
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={isApplyingSanction}
                onClick={() => {
                  setShowSanctionModal(false);
                  setSanctionReason("");
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  sanctionReason.trim().length < 3 ||
                  (sanctionType === "fine" && (!sanctionFineAmount || Number(sanctionFineAmount) <= 0)) ||
                  isApplyingSanction
                }
                onClick={handleApplySanction}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none disabled:border disabled:border-zinc-700/50"
              >
                {isApplyingSanction ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Aplicando...
                  </>
                ) : (
                  "Confirmar Sanción"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 MODAL DE REVOCACIÓN DE SANCIÓN */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-[#0c0c0c] p-6 shadow-2xl">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Revocar Sanción Disciplinaria
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400">
              Al revocar la sanción, el sujeto volverá a estar habilitado y se registrará el motivo en su expediente.
            </p>

            <div className="mt-4 flex flex-col gap-3 text-xs sm:text-sm">
              <div>
                <label className="text-zinc-300 font-bold">
                  Motivo de la revocación (requerido)
                </label>
                <textarea
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Ej: Aclaración de malentendido con cliente / cumplimiento anticipado..."
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
                />
                <div className="mt-1.5 flex items-center justify-between px-0.5 text-[11px]">
                  <span
                    className={`flex items-center gap-1 font-medium transition-colors ${
                      revokeReason.trim().length >= 3
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {revokeReason.trim().length >= 3 ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Mínimo alcanzado
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3 w-3" /> Mínimo 3 caracteres ({3 - revokeReason.trim().length} restantes)
                      </>
                    )}
                  </span>
                  <span className="text-zinc-500 font-mono ml-auto">
                    {revokeReason.trim().length} caracteres
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                disabled={isRevoking}
                onClick={() => {
                  setShowRevokeModal(false);
                  setRevokeReason("");
                  setRevokingSanctionId(null);
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                disabled={isRevoking || revokeReason.trim().length < 3}
                onClick={handleRevokeSanction}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none flex items-center gap-2 shadow-md"
              >
                {isRevoking ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Revocando...
                  </>
                ) : (
                  "Confirmar Revocación"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📋 MODAL DE DETALLE COMPLETO DE SANCIÓN */}
      {selectedSanctionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-[#0c0c0c] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-3">
                <span
                  className={`p-2 rounded-xl border ${selectedSanctionDetail.type === "fine"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : selectedSanctionDetail.type === "permanent_ban"
                      ? "bg-red-500/20 border-red-500/40 text-red-400"
                      : "bg-red-500/10 border-red-500/30 text-red-300"
                    }`}
                >
                  {selectedSanctionDetail.type === "fine" ? (
                    <Coins size={20} />
                  ) : (
                    <ShieldAlert size={20} />
                  )}
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white">
                    Detalle de Sanción Disciplinaria
                  </h3>
                  <p className="text-xs text-zinc-400">
                    ID: #{selectedSanctionDetail.id.slice(-8).toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSanctionDetail(null)}
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Grid de Estado y Tipo */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Tipo
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-zinc-200">
                  {selectedSanctionDetail.type === "fine"
                    ? "Multa Monetaria"
                    : selectedSanctionDetail.type === "suspension"
                      ? "Suspensión"
                      : "Baneo Permanente"}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Estado
                </span>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold ${selectedSanctionDetail.status === "active"
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : selectedSanctionDetail.status === "revoked"
                      ? "bg-zinc-800 text-zinc-300 border border-zinc-700"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}
                >
                  {selectedSanctionDetail.status === "active"
                    ? "Activa"
                    : selectedSanctionDetail.status === "revoked"
                      ? "Revocada"
                      : "Expirada"}
                </span>
              </div>

              {selectedSanctionDetail.fineAmount && Number(selectedSanctionDetail.fineAmount) > 0 ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block mb-1">
                    Monto Descontado
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-red-300">
                    -${selectedSanctionDetail.fineAmount} MXN
                  </span>
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                    Vigencia
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-zinc-300">
                    {selectedSanctionDetail.type === "permanent_ban"
                      ? "Permanente"
                      : selectedSanctionDetail.endsAt
                        ? "Temporal"
                        : "Indefinida"}
                  </span>
                </div>
              )}
            </div>

            {/* Fechas */}
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Fecha de aplicación:</span>
                <span className="font-semibold text-zinc-200">
                  {selectedSanctionDetail.createdAt
                    ? new Date(selectedSanctionDetail.createdAt).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                    : "No registrada"}
                </span>
              </div>
              {selectedSanctionDetail.startsAt && (
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Inicio de vigencia:</span>
                  <span className="font-semibold text-zinc-200">
                    {new Date(selectedSanctionDetail.startsAt).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              )}
              {selectedSanctionDetail.endsAt && (
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Fin de vigencia:</span>
                  <span className="font-semibold text-zinc-200">
                    {new Date(selectedSanctionDetail.endsAt).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              )}
            </div>

            {/* Motivo Completo */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold uppercase tracking-wider text-[#C5A55A] flex items-center gap-1.5">
                <FileCheck size={14} /> Motivo Completo de la Sanción
              </label>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs sm:text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed max-h-44 overflow-y-auto">
                {selectedSanctionDetail.reason || "Sin motivo especificado."}
              </div>
            </div>

            {/* Información de Revocación si existe */}
            {(selectedSanctionDetail.status === "revoked" || selectedSanctionDetail.revocationReason) && (
              <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-1.5">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Información de Revocación
                </span>
                <p className="text-xs sm:text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                  {selectedSanctionDetail.revocationReason || "Sanción revocada sin motivo registrado."}
                </p>
                {selectedSanctionDetail.revokedAt && (
                  <p className="text-[11px] text-zinc-400 pt-1">
                    Revocada el:{" "}
                    {new Date(selectedSanctionDetail.revokedAt).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}
              </div>
            )}

            {/* Footer con Acciones */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
              {selectedSanctionDetail.status === "active" ? (
                <button
                  type="button"
                  onClick={() => {
                    setRevokingSanctionId(selectedSanctionDetail.id);
                    setShowRevokeModal(true);
                    setSelectedSanctionDetail(null);
                  }}
                  className="rounded-xl border border-red-500/40 bg-red-950/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900 transition-colors shadow-sm"
                >
                  Revocar Sanción
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setSelectedSanctionDetail(null)}
                className="rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-900 hover:text-white transition-all border border-zinc-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 MODAL INTERACTIVO DE DETALLE Y GESTIÓN DE SERVICIO */}
      {managingService && (
        <ServiceDetailDialog
          service={managingService}
          onClose={() => setManagingService(null)}
          onUpdated={() => {
            refreshAll();
            setManagingService(null);
          }}
        />
      )}
    </div>
  );
}
