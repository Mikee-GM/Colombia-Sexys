"use client";

import React, { useState, useEffect } from "react";
import type { DriverPortalData } from "@/lib/types";

interface DriverPortalViewProps {
  initialData: DriverPortalData;
}

type TabType = "resumen" | "ranking" | "viajes" | "reputacion";

const ZONA_LABEL: Record<string, string> = {
  montecarlo: "Montecarlo",
  majestic: "Majestic",
  domicilio: "Domicilio",
};

export default function DriverPortalView({ initialData }: DriverPortalViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("resumen");
  const data = initialData;

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) {
        tg.setHeaderColor("#0B0D13");
      }
    }
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Mexico_City",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const vehiculoResumen = [
    data.profile.vehiculo.marca,
    data.profile.vehiculo.modelo,
    data.profile.vehiculo.color,
  ]
    .filter(Boolean)
    .join(" ");

  const settlementLabel =
    data.earnings.weeklySettlementStatus === "paid"
      ? "Pagada"
      : data.earnings.weeklySettlementStatus === "pending"
        ? "Pendiente de pago"
        : "Sin cerrar";

  return (
    <div className="min-h-screen bg-[#0B0D13] text-gray-100 flex flex-col font-sans selection:bg-[#C5A55A]/30">
      {/* HEADER / HERO BAR */}
      <header className="sticky top-0 z-30 bg-[#0B0D13]/90 backdrop-blur-md border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#C5A55A] shadow-md shadow-[#C5A55A]/20 bg-gray-800 shrink-0 flex items-center justify-center text-lg text-gray-400 font-bold">
              {data.profile.nombre.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  {data.profile.nombre}
                </h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#C5A55A]/20 text-[#E8D5A3] border border-[#C5A55A]/30">
                  Chofer
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
                {vehiculoResumen && (
                  <>
                    <span>•</span>
                    <span>{vehiculoResumen}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Ranking
            </div>
            <div className="text-sm sm:text-base font-bold text-[#E8D5A3] flex items-center justify-end gap-1">
              <span>🏆 #{data.ranking.myPosition}</span>
              <span className="text-xs text-gray-500 font-normal">/ {data.ranking.totalDrivers}</span>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="max-w-4xl mx-auto mt-3 flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 border-t border-white/5 pt-2">
          {[
            { id: "resumen", label: "📊 Resumen" },
            { id: "ranking", label: "🏆 Ranking" },
            { id: "viajes", label: "🚗 Viajes" },
            { id: "reputacion", label: "⭐ Reputación" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-[#C5A55A] text-black shadow-md shadow-[#C5A55A]/25"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* ================= TAB 1: RESUMEN ================= */}
        {activeTab === "resumen" && (
          <div className="space-y-6 animate-fadeIn">
            {data.activeTrip && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-black border border-emerald-500/40 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Viaje en curso
                    </span>
                  </div>
                  <span className="text-xs text-gray-300 font-medium capitalize">
                    {data.activeTrip.estado.replace("_", " ")}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2 pt-2 border-t border-emerald-500/20">
                  <div className="text-xs text-gray-300">
                    Zona:{" "}
                    <span className="font-semibold text-white">
                      {ZONA_LABEL[data.activeTrip.zona] || data.activeTrip.zona}
                    </span>{" "}
                    · Tramo:{" "}
                    <span className="font-semibold text-white capitalize">{data.activeTrip.tipo}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-[#141721] p-4 rounded-xl border border-white/5 shadow-sm relative overflow-hidden">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Ganancias Mes
                </div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#E8D5A3] mt-1">
                  {formatCurrency(data.earnings.monthNet)}
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {data.earnings.monthTrips} viajes
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
                  {data.earnings.todayTrips} viajes hoy
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
                  {data.earnings.totalHistoricalTrips} viajes totales
                </div>
              </div>

              <div className="bg-[#141721] p-4 rounded-xl border border-white/5 shadow-sm relative overflow-hidden">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>🚗</span> Vehículo registrado
                  </h3>
                </div>
                {vehiculoResumen ? (
                  <p className="text-xs text-gray-400 leading-relaxed">
                    <span className="text-white font-semibold">{vehiculoResumen}</span>
                    {data.profile.vehiculo.placa && ` — Placa ${data.profile.vehiculo.placa}`}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 italic">
                    No hay datos de vehículo registrados por administración.
                  </p>
                )}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <span>Estado actual:</span>
                  <span
                    className={`font-semibold ${data.profile.disponible ? "text-emerald-400" : "text-gray-400"}`}
                  >
                    {data.profile.disponible ? "Disponible" : "No disponible"}
                  </span>
                </div>
              </div>

              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>💵</span> Liquidación semanal
                  </h3>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                      data.earnings.weeklySettlementStatus === "paid"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : data.earnings.weeklySettlementStatus === "pending"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-white/10 text-gray-300 border border-white/10"
                    }`}
                  >
                    {settlementLabel}
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Se calcula sobre tus viajes internos finalizados de la semana en curso. Administración confirma el pago desde el panel de liquidaciones.
                </p>
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <span>Ganancia de la semana:</span>
                  <span className="font-semibold text-white">
                    {formatCurrency(data.earnings.weekNet)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#141721] p-5 rounded-xl border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#C5A55A]/20 border border-[#C5A55A]/40 flex items-center justify-center text-2xl">
                  🏆
                </div>
                <div>
                  <div className="text-sm font-bold text-white">
                    ¡Posición #{data.ranking.myPosition} en el Ranking!
                  </div>
                  <div className="text-xs text-gray-400">
                    Entre {data.ranking.totalDrivers} choferes activos
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

        {/* ================= TAB 2: RANKING ================= */}
        {activeTab === "ranking" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1E1B15] via-[#141721] to-black border border-[#C5A55A]/30 shadow-xl text-center space-y-3">
              <div className="inline-block p-3 rounded-full bg-[#C5A55A]/10 border border-[#C5A55A]/30 text-3xl">
                👑
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                Tabla de Clasificación de Choferes
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 max-w-lg mx-auto">
                Tu posición se calcula con tu calificación promedio y los reportes confirmados en tu contra en los últimos 90 días.
              </p>
              <div className="pt-2">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C5A55A]/20 text-[#E8D5A3] border border-[#C5A55A]/40 text-xs font-bold">
                  Tu Puesto Actual: #{data.ranking.myPosition} de {data.ranking.totalDrivers} choferes
                </span>
              </div>
            </div>

            <div className="bg-[#141721] rounded-xl border border-white/5 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Posición</span>
                <span>Chofer</span>
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
                          className={`text-sm font-bold ${isTop3 ? "text-base" : "text-gray-400"}`}
                        >
                          {medal}
                        </span>
                      </div>

                      <div className="flex-1 font-semibold text-sm">
                        <span className={entry.isMe ? "text-[#E8D5A3] font-bold" : "text-gray-200"}>
                          {entry.nombre}
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
                            <span>●</span> Activo
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

        {/* ================= TAB 3: VIAJES ================= */}
        {activeTab === "viajes" && (
          <div className="space-y-6 animate-fadeIn">
            {data.activeTrip && (
              <div className="bg-[#141721] p-5 rounded-xl border border-emerald-500/40 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                      Viaje Actual
                    </h3>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    {data.activeTrip.estado.replace("_", " ").toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <div className="text-[11px] text-gray-400">Zona</div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {ZONA_LABEL[data.activeTrip.zona] || data.activeTrip.zona}
                    </div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <div className="text-[11px] text-gray-400">Tramo</div>
                    <div className="text-sm font-bold text-white capitalize mt-0.5">
                      {data.activeTrip.tipo}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[#141721] rounded-xl border border-white/5 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Historial de Viajes</h3>
                  <p className="text-xs text-gray-400">
                    Tus últimos viajes internos finalizados y tu pago por cada uno.
                  </p>
                </div>
                <span className="text-xs text-[#E8D5A3] font-semibold bg-[#C5A55A]/10 px-2.5 py-1 rounded-md border border-[#C5A55A]/20">
                  {data.recentTrips.length} registrados
                </span>
              </div>

              {data.recentTrips.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  Aún no tienes viajes finalizados registrados.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {data.recentTrips.map((trip) => (
                    <div
                      key={trip.id}
                      className="p-4 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {formatDate(trip.fecha)}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 capitalize">
                            {trip.tipo}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300">
                            {ZONA_LABEL[trip.zona] || trip.zona}
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          Tu Pago
                        </div>
                        <div className="text-base font-bold text-emerald-400">
                          {formatCurrency(trip.driverPayout)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: REPUTACIÓN ================= */}
        {activeTab === "reputacion" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 text-center space-y-1">
                <div className="text-3xl font-extrabold text-amber-300 flex items-center justify-center gap-1">
                  <span>★</span>
                  <span>{data.reputation.ratingAverage.toFixed(1)}</span>
                </div>
                <div className="text-xs font-semibold text-white">Promedio General</div>
                <div className="text-[11px] text-gray-400">
                  {data.reputation.ratingCount} valoraciones de empleadas
                </div>
              </div>

              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 text-center space-y-1">
                <div className="text-3xl font-extrabold text-emerald-400">
                  {data.reputation.kpiScore}
                </div>
                <div className="text-xs font-semibold text-white">Puntuación KPI</div>
                <div className="text-[11px] text-gray-400">
                  {data.reputation.confirmedReports90Days > 0
                    ? `${data.reputation.confirmedReports90Days} reporte(s) confirmado(s) en 90 días`
                    : "Sin reportes confirmados en 90 días"}
                </div>
              </div>

              <div className="bg-[#141721] p-5 rounded-xl border border-white/5 text-center space-y-1">
                <div className="text-3xl font-extrabold text-[#E8D5A3]">
                  #{data.ranking.myPosition}
                </div>
                <div className="text-xs font-semibold text-white">Ranking</div>
                <div className="text-[11px] text-gray-400">
                  De {data.ranking.totalDrivers} choferes
                </div>
              </div>
            </div>

            <div className="bg-[#141721] rounded-xl border border-white/5 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-white/5">
                <h3 className="text-sm font-bold text-white">Opiniones y Comentarios</h3>
                <p className="text-xs text-gray-400">
                  Lo que las empleadas han comentado tras tus viajes.
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
      </main>

      <footer className="mt-auto border-t border-white/5 py-4 text-center text-[11px] text-gray-500">
        Colombia Sexys • Portal de Chofer en Modo Solo Lectura
      </footer>
    </div>
  );
}
