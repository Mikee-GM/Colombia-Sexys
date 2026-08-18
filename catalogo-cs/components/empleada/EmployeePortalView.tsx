"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import type { EmployeePortalData } from "@/lib/types";

interface EmployeePortalViewProps {
  initialData: EmployeePortalData;
  token?: string;
}

type TabType = "resumen" | "ranking" | "servicios" | "reputacion" | "fotos";

export default function EmployeePortalView({ initialData }: EmployeePortalViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("resumen");
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
            { id: "resumen", label: "📊 Resumen", title: "Resumen" },
            { id: "ranking", label: "🏆 Ranking", title: "Ranking Global" },
            { id: "servicios", label: "📋 Servicios", title: "Mis Servicios" },
            { id: "reputacion", label: "⭐ Reseñas", title: "Reputación" },
            { id: "fotos", label: "📸 Mis Fotos", title: "Fotos" },
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
        {/* ================= TAB 1: RESUMEN Y FINANZAS ================= */}
        {activeTab === "resumen" && (
          <div className="space-y-6 animate-fadeIn">
            {/* SERVICIO ACTIVO ALERTA (SI EXISTE) */}
            {data.activeService && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-black border border-emerald-500/40 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Servicio en Curso / Agendado
                    </span>
                  </div>
                  <span className="text-xs text-gray-300 font-medium">
                    {data.activeService.duracionHoras} hrs pactadas
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2 pt-2 border-t border-emerald-500/20">
                  <div>
                    <div className="text-xs text-gray-400">Tu Ganancia Estimada:</div>
                    <div className="text-lg font-bold text-emerald-300">
                      {formatCurrency(data.activeService.gananciaEstimada)}
                    </div>
                  </div>
                  {data.activeService.transporte && (
                    <div className="text-xs text-gray-300 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                      🚗 Transporte:{" "}
                      <span className="font-semibold text-white">
                        {data.activeService.transporte.proveedor.toUpperCase()}
                      </span>{" "}
                      ({data.activeService.transporte.estado})
                      {data.activeService.transporte.choferNombre && (
                        <span> • Chofer: {data.activeService.transporte.choferNombre}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* KPI STATS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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
                <p className="text-xs text-gray-400 leading-relaxed">
                  Recuerda enviar tus fotos semanales cada viernes por Telegram para mantener tu perfil activo en el catálogo y tu puntuación de confiabilidad al 100%.
                </p>
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
            {/* SERVICIO ACTIVO DESTACADO */}
            {data.activeService && (
              <div className="bg-[#141721] p-5 rounded-xl border border-emerald-500/40 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                      Servicio Actual
                    </h3>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    {data.activeService.estado.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <div className="text-[11px] text-gray-400">Duración Pactada</div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {data.activeService.duracionHoras} Horas
                    </div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                    <div className="text-[11px] text-gray-400">Método de Pago</div>
                    <div className="text-sm font-bold text-white capitalize mt-0.5">
                      {data.activeService.metodoPago}
                    </div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg border border-white/5 col-span-2 sm:col-span-1">
                    <div className="text-[11px] text-gray-400">Tu Ganancia Neta</div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      {formatCurrency(data.activeService.gananciaEstimada)}
                    </div>
                  </div>
                </div>
              </div>
            )}

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
        Colombia Sexys VIP • Portal de Empleada en Modo Solo Lectura
      </footer>
    </div>
  );
}
