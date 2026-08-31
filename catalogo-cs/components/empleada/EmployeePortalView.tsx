"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import type { EmployeePortalData } from "@/lib/types";
import { formatCurrency as formatCurrencyMXN } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import WorkShiftToggle from "@/components/ui/WorkShiftToggle";
import AvisosPush from "@/components/ui/AvisosPush";
import type { WorkShiftStatus } from "@/lib/actions/work-shift";
import type { WeeklyPhotoSubmissionItem } from "@/lib/types";
import SubirFotosSemanales, {
  AvisoFotosSemanales,
} from "@/components/empleada/FotosSemanales";
import ServicioAhora from "@/components/empleada/ServicioAhora";
import { BarChart3, Camera, ClipboardList, Star, Trophy } from "lucide-react";

interface EmployeePortalViewProps {
  initialData: EmployeePortalData;
  token?: string;
  /** Nulo cuando se entra con un enlace antiguo, sin sesion. */
  workShift?: WorkShiftStatus | null;
  /** Fotos de la semana ya resueltas en el servidor, para no parpadear. */
  weeklyPhotos?: WeeklyPhotoSubmissionItem[];
  /**
   * Pestaña inicial. El boton de Telegram trae `?seccion=fotos` para aterrizar
   * directamente donde se suben, que es el motivo por el que se mando el aviso.
   */
  seccionInicial?: TabType;
}

type TabType = "resumen" | "ranking" | "servicios" | "reputacion" | "fotos";

export default function EmployeePortalView({
  initialData,
  token,
  workShift,
  weeklyPhotos = [],
  seccionInicial = "resumen",
}: EmployeePortalViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>(seccionInicial);
  const data = initialData;

  useEffect(() => {
    // Configurar Telegram WebApp si se ejecuta dentro del cliente de Telegram
    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) {
        tg.setHeaderColor("#0B0D13");
      }
    }
  }, []);

  const formatCurrency = formatCurrencyMXN;

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(APP_LOCALE, {
        timeZone: APP_TIME_ZONE,
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D13] text-gray-100 flex flex-col font-sans selection:bg-[#C5A55A]/30">
      {/* HEADER / HERO BAR */}
      <header className="sticky top-0 z-30 bg-[#0B0D13]/90 backdrop-blur-md border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#C5A55A] shadow-md shadow-[#C5A55A]/20 bg-gray-800 shrink-0">
              {data.profile.fotoPerfilUrl ? (
                <Image
                  src={data.profile.fotoPerfilUrl}
                  alt={data.profile.nombreArtistico}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg text-gray-400 font-bold">
                  {data.profile.nombreArtistico.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  {data.profile.nombreArtistico}
                </h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#C5A55A]/20 text-[#E8D5A3] border border-[#C5A55A]/30">
                  Modelo VIP
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      data.profile.disponible ? "bg-emerald-400 animate-pulse" : "bg-gray-500"
                    }`}
                  />
                  {data.profile.disponible ? "Disponible" : "No disponible"}
                </span>
                <span>•</span>
                <span>Tarifa: {formatCurrency(data.profile.precioBaseHora)}/hr</span>
                {(data.cashDelivery?.totalPending || 0) > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      <span>💵</span> Debe: {formatCurrency(data.cashDelivery?.totalPending || 0)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Ranking Global
            </div>
            <div className="text-sm sm:text-base font-bold text-[#E8D5A3] flex items-center justify-end gap-1">
              <span>🏆 #{data.ranking.myPosition}</span>
              <span className="text-xs text-gray-500 font-normal">/ {data.ranking.totalModels}</span>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="max-w-4xl mx-auto mt-3 flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 border-t border-white/5 pt-2">
          {[
            { id: "resumen", label: "Resumen", icono: <BarChart3 size={14} />, title: "Resumen" },
            { id: "ranking", label: "Ranking", icono: <Trophy size={14} />, title: "Ranking Global" },
            { id: "servicios", label: "Servicios", icono: <ClipboardList size={14} />, title: "Mis Servicios" },
            { id: "reputacion", label: "Reseñas", icono: <Star size={14} />, title: "Reputación" },
            { id: "fotos", label: "Mis Fotos", icono: <Camera size={14} />, title: "Fotos" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-[#C5A55A] text-black shadow-md shadow-[#C5A55A]/25"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {tab.icono}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Lo primero, en cualquier pestaña: qué hay ahora y qué se puede hacer. */}
        <ServicioAhora servicio={data.activeService} token={token} />
        {/* Solo tiene sentido con sesion propia: un enlace con token no
            identifica el dispositivo, y la suscripcion es por dispositivo. */}
        {workShift !== undefined && workShift !== null && <AvisosPush />}
        {/* ================= TAB 1: RESUMEN Y FINANZAS ================= */}
        {activeTab === "resumen" && (
          <div className="space-y-6 animate-fadeIn">
            {/*
              Cerrar la jornada le avisa a su jefe. Solo aparece con sesion
              propia: un enlace antiguo con token no identifica a la persona.
            */}
            {workShift !== undefined && workShift !== null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <WorkShiftToggle initialStatus={workShift} />
              </div>
            )}

            {/* KPI STATS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-[#141721] p-4 rounded-xl border border-white/5 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Ganancias Mes
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#E8D5A3] mt-1">
                  {formatCurrency(data.earnings.monthNet)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {data.earnings.monthHours} hrs acumuladas
                </div>
              </div>

              <div className="bg-[#141721] p-4 rounded-xl border border-white/5 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Ganancias Hoy
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 mt-1">
                  {formatCurrency(data.earnings.todayNet)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {data.earnings.todayHours} hrs hoy
                </div>
              </div>

              <div className="bg-[#141721] p-4 rounded-xl border border-white/5 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Total Histórico
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-white mt-1">
                  {formatCurrency(data.earnings.totalHistoricalNet)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {data.earnings.totalHistoricalHours} hrs totales
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border shadow-sm relative overflow-hidden ${
                  (data.cashDelivery?.totalPending || 0) > 0
                    ? "bg-gradient-to-br from-amber-950/40 to-[#141721] border-amber-500/40"
                    : "bg-[#141721] border-white/5"
                }`}
              >
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Efectivo por Entregar
                </div>
                <div
                  className={`text-xl sm:text-2xl font-extrabold mt-1 ${
                    (data.cashDelivery?.totalPending || 0) > 0
                      ? "text-amber-300"
                      : "text-emerald-400"
                  }`}
                >
                  {formatCurrency(data.cashDelivery?.totalPending || 0)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {(data.cashDelivery?.totalPending || 0) > 0
                    ? `${data.cashDelivery?.pendingServicesCount} ${
                        data.cashDelivery?.pendingServicesCount === 1
                          ? "servicio pendiente"
                          : "servicios pendientes"
                      }`
                    : "Al día (sin deudas)"}
                </div>
              </div>

              <div className="bg-[#141721] p-4 rounded-xl border border-white/5 shadow-sm relative overflow-hidden col-span-2 sm:col-span-1">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Calificación
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-amber-300 mt-1 flex items-center gap-1">
                  <span>★</span>
                  <span>{data.reputation.ratingAverage.toFixed(1)}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {data.reputation.ratingCount} valoraciones
                </div>
              </div>
            </div>

            {/* SECCIÓN DETALLADA DE CONTROL DE EFECTIVO */}
            <div
              className={`p-5 rounded-xl border ${
                (data.cashDelivery?.totalPending || 0) > 0
                  ? "bg-gradient-to-br from-amber-950/30 via-[#141721] to-black border-amber-500/40 shadow-lg"
                  : "bg-[#141721] border-white/5"
              } space-y-4`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                      (data.cashDelivery?.totalPending || 0) > 0
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    💵
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">
                        Control de Efectivo por Entregar
                      </h3>
                      {(data.cashDelivery?.totalPending || 0) > 0 ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                          {data.cashDelivery?.pendingServicesCount}{" "}
                          {data.cashDelivery?.pendingServicesCount === 1
                            ? "servicio"
                            : "servicios"}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                          Al Día
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(data.cashDelivery?.totalPending || 0) > 0
                        ? "Efectivo cobrado en tus servicios que debes entregar a administración o a tu jefe."
                        : "No tienes cobros en efectivo pendientes de liquidar con administración."}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                    Saldo Pendiente
                  </div>
                  <div
                    className={`text-2xl font-black mt-0.5 ${
                      (data.cashDelivery?.totalPending || 0) > 0
                        ? "text-amber-300"
                        : "text-emerald-400"
                    }`}
                  >
                    {formatCurrency(data.cashDelivery?.totalPending || 0)}
                  </div>
                </div>
              </div>

              {/* Alerta de montos provisionales si aplica */}
              {data.cashDelivery?.hasProvisional && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                  <span>ℹ️</span>
                  <span>
                    Hay servicios con deducciones de transporte en estado provisional, en espera de confirmación de Uber por tu jefe.
                  </span>
                </div>
              )}

              {/* Desglose de servicios con efectivo pendiente */}
              {data.cashDelivery?.obligations &&
                data.cashDelivery.obligations.length > 0 && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="text-xs font-semibold text-gray-300">
                      Desglose de entregas pendientes:
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {data.cashDelivery.obligations.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-lg bg-black/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#C5A55A]">
                                Servicio #{item.serviceId.slice(-6).toUpperCase()}
                              </span>
                              <span className="text-gray-400">
                                • {formatDate(item.serviceDate)}
                              </span>
                              {item.calculationStatus === "provisional" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                                  Provisional
                                </span>
                              )}
                            </div>
                            <div className="text-gray-400 text-[11px] mt-1 flex flex-wrap gap-x-3">
                              <span>
                                Cobro cliente: {formatCurrency(item.customerTotal)}
                              </span>
                              {item.uberDeduction > 0 && (
                                <span className="text-emerald-400">
                                  Deducción Uber: -{formatCurrency(item.uberDeduction)}
                                </span>
                              )}
                              {item.paidAmount > 0 && (
                                <span className="text-blue-400">
                                  Abonado: {formatCurrency(item.paidAmount)}
                                </span>
                              )}
                            </div>
                            {item.pendingReason && (
                              <p className="text-[10px] text-amber-400 mt-1">
                                {item.pendingReason}
                              </p>
                            )}
                          </div>

                          <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-1.5 sm:pt-0 border-white/5">
                            <span className="text-[10px] text-gray-400">
                              Por entregar:
                            </span>
                            <span className="text-sm font-bold text-amber-300">
                              {formatCurrency(item.pendingAmount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* INFORMACIÓN DE ESQUEMA Y CONTENIDO SEMANAL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tarjeta de esquema */}
              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>💵</span> Esquema de Ganancias
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-[#C5A55A]/20 text-[#E8D5A3] font-semibold">
                    {data.earnings.percentageRate}% Neto
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Recibes el <strong className="text-white">{data.earnings.percentageRate}%</strong> del valor base pactado por cada hora de servicio, más el <strong className="text-white">100%</strong> de tus servicios extras realizados.
                </p>
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <span>Tarifa por hora configurada:</span>
                  <span className="font-semibold text-white">
                    {formatCurrency(data.profile.precioBaseHora)}
                  </span>
                </div>
              </div>

              {/* Tarjeta de contenido semanal */}
              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>📸</span> Contenido Semanal
                  </h3>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                      data.profile.weeklyContentStatus === "al_dia"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : data.profile.weeklyContentStatus === "pendiente_revision"
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {data.profile.weeklyContentStatus === "al_dia"
                      ? "✓ Al Día"
                      : data.profile.weeklyContentStatus === "pendiente_revision"
                        ? "⏳ En Revisión"
                        : "⚠️ Fotos Atrasadas"}
                  </span>
                </div>
                {/*
                  El aviso reemplaza al texto fijo que estaba aqui: decia que
                  las fotos se mandaban por Telegram, que ya no es cierto, y no
                  distinguia entre estar al dia y llevar dos recordatorios
                  encima.
                */}
                <AvisoFotosSemanales
                  estado={data.profile.weeklyContent}
                  onIrAFotos={() => setActiveTab("fotos")}
                />
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <span>Confiabilidad (Trust Score):</span>
                  <span className="font-semibold text-emerald-400">
                    {(data.reputation.trustScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* MINI RANKING HIGHLIGHT */}
            <div className="bg-[#141721] p-5 rounded-xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#C5A55A]/20 border border-[#C5A55A]/40 flex items-center justify-center text-2xl">
                  🏆
                </div>
                <div>
                  <div className="text-sm font-bold text-white">
                    ¡Posición #{data.ranking.myPosition} en el Ranking General!
                  </div>
                  <div className="text-xs text-gray-400">
                    Entre {data.ranking.totalModels} modelos activas en la agencia
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveTab("ranking")}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
              >
                Ver Tabla de Posiciones →
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 2: RANKING GLOBAL ================= */}
        {activeTab === "ranking" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Banner de motivación */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1E1B15] via-[#141721] to-black border border-[#C5A55A]/30 shadow-xl text-center space-y-3">
              <div className="inline-block p-3 rounded-full bg-[#C5A55A]/10 border border-[#C5A55A]/30 text-3xl">
                👑
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                Tabla de Clasificación Global
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 max-w-lg mx-auto">
                Tu posición se actualiza según tu volumen de servicios, calificaciones de clientes y cumplimiento. ¡Sigue brillando!
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C5A55A]/20 text-[#E8D5A3] border border-[#C5A55A]/40 text-xs font-bold">
                  Tu Puesto Actual: #{data.ranking.myPosition} de {data.ranking.totalModels} modelos
                </span>
              </div>
            </div>

            {/* Leaderboard List */}
            <div className="bg-[#141721] rounded-xl border border-white/5 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Posición</span>
                <span>Modelo</span>
                <span>Estatus</span>
              </div>
              <div className="divide-y divide-white/5">
                {data.ranking.leaderboard.map((entry) => {
                  const isTop3 = entry.position <= 3;
                  const medal =
                    entry.position === 1
                      ? "🥇"
                      : entry.position === 2
                        ? "🥈"
                        : entry.position === 3
                          ? "🥉"
                          : `#${entry.position}`;

                  return (
                    <div
                      key={entry.position}
                      className={`px-4 py-3.5 flex items-center justify-between transition-colors ${
                        entry.isMe
                          ? "bg-[#C5A55A]/15 border-l-4 border-[#C5A55A]"
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-3 w-16">
                        <span
                          className={`text-sm font-bold ${
                            isTop3 ? "text-base" : "text-gray-400"
                          }`}
                        >
                          {medal}
                        </span>
                      </div>

                      <div className="flex-1 font-semibold text-sm">
                        <span className={entry.isMe ? "text-[#E8D5A3] font-bold" : "text-gray-200"}>
                          {entry.nombreArtistico}
                        </span>
                        {entry.isMe && (
                          <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C5A55A] text-black">
                            Tú
                          </span>
                        )}
                      </div>

                      <div>
                        {entry.isMe ? (
                          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                            <span>●</span> Activa
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">Agencia</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: MIS SERVICIOS ================= */}
        {activeTab === "servicios" && (
          <div className="space-y-6 animate-fadeIn">
            {/* HISTORIAL DE SERVICIOS */}
            <div className="bg-[#141721] rounded-xl border border-white/5 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Historial de Servicios</h3>
                  <p className="text-xs text-gray-400">
                    Tus últimos servicios completados y el desglose de tu ganancia neta.
                  </p>
                </div>
                <span className="text-xs text-[#E8D5A3] font-semibold bg-[#C5A55A]/10 px-2.5 py-1 rounded-md border border-[#C5A55A]/20">
                  {data.recentServices.length} registrados
                </span>
              </div>

              {data.recentServices.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  Aún no tienes servicios finalizados registrados.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {data.recentServices.map((service) => (
                    <div
                      key={service.id}
                      className="p-4 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {formatDate(service.fecha)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 font-medium">
                            {service.duracionHoras} hrs
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 capitalize">
                            {service.metodoPago}
                          </span>
                        </div>
                        {service.extrasTotal > 0 && (
                          <div className="text-xs text-amber-300 font-medium">
                            + Extras incluidos: {formatCurrency(service.extrasTotal)}
                          </div>
                        )}
                        {service.comentarioCliente && (
                          <div className="text-xs text-gray-400 italic">
                            &ldquo;{service.comentarioCliente}&rdquo;
                          </div>
                        )}
                      </div>

                      <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          Tu Ganancia Neta
                        </div>
                        <div className="text-base font-bold text-emerald-400">
                          {formatCurrency(service.gananciaNeta)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: REPUTACIÓN Y RESEÑAS ================= */}
        {activeTab === "reputacion" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header de reputación */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 text-center space-y-1 sm:col-span-1">
                <div className="text-3xl font-extrabold text-amber-300 flex items-center justify-center gap-1">
                  <span>★</span>
                  <span>{data.reputation.ratingAverage.toFixed(1)}</span>
                </div>
                <div className="text-xs font-semibold text-white">Promedio General</div>
                <div className="text-[11px] text-gray-400">
                  {data.reputation.ratingCount} opiniones de clientes
                </div>
              </div>

              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 text-center space-y-1 sm:col-span-1">
                <div className="text-3xl font-extrabold text-emerald-400">
                  {(data.reputation.trustScore * 100).toFixed(0)}%
                </div>
                <div className="text-xs font-semibold text-white">Nivel de Confianza</div>
                <div className="text-[11px] text-gray-400">Puntualidad y cumplimiento</div>
              </div>

              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 text-center space-y-1 sm:col-span-1">
                <div className="text-3xl font-extrabold text-[#E8D5A3]">
                  #{data.ranking.myPosition}
                </div>
                <div className="text-xs font-semibold text-white">Ranking del Equipo</div>
                <div className="text-[11px] text-gray-400">
                  De {data.ranking.totalModels} compañeras
                </div>
              </div>
            </div>

            {/* Muro de comentarios */}
            <div className="bg-[#141721] rounded-xl border border-white/5 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-white/5">
                <h3 className="text-sm font-bold text-white">Opiniones y Comentarios</h3>
                <p className="text-xs text-gray-400">
                  Lo que los clientes han comentado tras finalizar sus servicios contigo.
                </p>
              </div>

              {data.reputation.reviews.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  Aún no tienes comentarios registrados.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {data.reputation.reviews.map((rev) => (
                    <div key={rev.id} className="p-4 space-y-1.5 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-amber-300 text-sm">
                          {Array.from({ length: rev.estrellas }).map((_, i) => (
                            <span key={i}>★</span>
                          ))}
                        </div>
                        <span className="text-[11px] text-gray-500">{formatDate(rev.fecha)}</span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed font-normal">
                        &ldquo;{rev.comentario}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 5: MIS FOTOS ================= */}
        {activeTab === "fotos" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Contenido de la semana: aviso, subida y lo ya enviado. */}
            <SubirFotosSemanales
              estadoInicial={data.profile.weeklyContent}
              enviosIniciales={weeklyPhotos}
              token={token}
            />

            {/* Galería Pública */}
            <div className="bg-[#141721] p-5 rounded-xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Fotos en Catálogo Público</h3>
                  <p className="text-xs text-gray-400">
                    Fotos visibles para clientes en la web principal.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-[#C5A55A]/20 text-[#E8D5A3]">
                  {data.profile.publicPhotosCount} fotos
                </span>
              </div>

              {data.profile.publicPhotos.length === 0 ? (
                <div className="text-xs text-gray-500 italic">No hay fotos públicas cargadas.</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {data.profile.publicPhotos.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-[3/4] rounded-lg overflow-hidden border border-white/10 bg-black/40"
                    >
                      <Image
                        src={url}
                        alt={`Foto pública ${idx + 1}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 33vw, 25vw"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Galería Exclusiva (Telegram) */}
            <div className="bg-[#141721] p-5 rounded-xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Fotos Exclusivas para Clientes</h3>
                  <p className="text-xs text-gray-400">
                    Fotos privadas que la IA o el jefe pueden enviar por chat a clientes interesados.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-purple-500/20 text-purple-300">
                  {data.profile.privatePhotosCount} fotos
                </span>
              </div>

              {data.profile.privatePhotos.length === 0 ? (
                <div className="text-xs text-gray-500 italic">
                  No hay fotos exclusivas registradas por administración.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {data.profile.privatePhotos.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-[3/4] rounded-lg overflow-hidden border border-white/10 bg-black/40"
                    >
                      <Image
                        src={url}
                        alt={`Foto exclusiva ${idx + 1}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 33vw, 25vw"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-white/5 py-4 text-center text-[11px] text-gray-500">
        Colombia Sexys VIP • Portal de Empleada
      </footer>
    </div>
  );
}
