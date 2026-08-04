"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Modelo } from "@/types";
import CustomerRating from "@/components/ui/CustomerRating";
import { availabilityLabel } from "@/lib/availability";

interface ModelProfileProps {
  modelo: Modelo;
  onClose: () => void;
}

export default function ModelProfile({ modelo, onClose }: ModelProfileProps) {
  const allPhotos = [modelo.fotoPrincipal, ...modelo.fotos].filter(Boolean);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const status = availabilityLabel(modelo);
  const effectiveStatus =
    modelo.availabilityStatus ??
    (modelo.disponible ? "disponible" : "ocupada");
  const canContact =
    effectiveStatus === "disponible" ||
    (effectiveStatus === "ocupada" && modelo.canScheduleNext !== false);

  const goTo = (index: number) => {
    setActiveIndex(index);
  };

  const goPrev = () => {
    goTo(activeIndex === 0 ? allPhotos.length - 1 : activeIndex - 1);
  };

  const goNext = () => {
    goTo(activeIndex === allPhotos.length - 1 ? 0 : activeIndex + 1);
  };

  const minSwipeDistance = 40;
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    const distance = touchStartX - touchEndX;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe && allPhotos.length > 1) {
      goNext();
    }
    if (isRightSwipe && allPhotos.length > 1) {
      goPrev();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (allPhotos.length <= 1) return;
    if (Math.abs(e.deltaX) > 40) {
      if (e.deltaX > 0) goNext();
      else goPrev();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm overflow-y-auto p-4 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{
          duration: 0.35,
          ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
        }}
        // En desktop limitamos la altura y hacemos scroll, en movil dejamos fluir nativamente
        className="w-full max-w-4xl bg-[#050505] border border-zinc-800 shadow-2xl my-auto relative flex flex-col md:flex-row md:max-h-[85vh] overflow-hidden"
      >
        {/* Boton cerrar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 text-zinc-500 hover:text-white p-2 transition-colors bg-black/50 backdrop-blur-md border border-zinc-800 hover:border-[#C5A55A] rounded-full"
          aria-label="Cerrar"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Galeria de fotos con soporte tactil/scroll */}
        <div
          className="w-full md:w-1/2 flex-shrink-0 relative aspect-[3/4] md:aspect-auto bg-zinc-950 select-none cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={handleWheel}
        >
          {/* Mapeamos todas las fotos para pre-cargarlas en el DOM */}
          {allPhotos.map((url, i) => (
            <div
              key={url}
              className={`absolute inset-0 transition-opacity duration-700 ${
                i === activeIndex
                  ? "opacity-100 z-10"
                  : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              <Image
                src={url}
                alt={`${modelo.nombre} - Foto ${i + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority={i === 0} // Precarga fuerte solo de la 1ra foto
              />
            </div>
          ))}

          {/* Navegacion de fotos */}
          {allPhotos.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center bg-black/50 backdrop-blur-sm border border-zinc-700 text-white hover:border-[#C5A55A] hover:text-[#E8D5A3] transition-all rounded-full"
                aria-label="Foto anterior"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={goNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center bg-black/50 backdrop-blur-sm border border-zinc-700 text-white hover:border-[#C5A55A] hover:text-[#E8D5A3] transition-all rounded-full"
                aria-label="Foto siguiente"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Indicadores inferiores */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                {allPhotos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === activeIndex
                        ? "bg-[#C5A55A] w-6"
                        : "bg-white/40 hover:bg-white/70 w-2"
                    }`}
                    aria-label={`Ver foto ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Informacion de la modelo (Scrollable independiente en desktop) */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 lg:p-10 flex flex-col overflow-y-auto customized-scrollbar">
          <div className="flex-1">
            {/* Nombre */}
            <h2 className="font-heading text-3xl sm:text-4xl font-semibold text-white tracking-wide mb-2 pr-10">
              {modelo.nombre}
            </h2>
            {modelo.clientRatingAverage != null && (modelo.clientRatingCount ?? 0) > 0 && (
              <div className="mb-5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Calificación de clientes
                </p>
                <CustomerRating
                  average={modelo.clientRatingAverage}
                  count={modelo.clientRatingCount}
                />
              </div>
            )}
            <div className="mb-6 flex flex-col items-start gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Disponibilidad
              </span>
              <div
                className={`inline-flex items-center gap-2.5 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur-md shadow-lg ${
                  effectiveStatus === "disponible"
                    ? "border border-[#C5A55A]/40 bg-gradient-to-r from-[#C5A55A]/20 via-black/40 to-black/60 text-[#F3E5AB] shadow-[0_4px_20px_rgba(197,165,90,0.25)]"
                    : "border border-zinc-700/60 bg-gradient-to-r from-zinc-900/70 via-black/50 to-black/70 text-zinc-300"
                }`}
              >
                {effectiveStatus === "disponible" ? (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  </span>
                ) : (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
                  </span>
                )}
                <span>{status}</span>
              </div>
              {effectiveStatus === "ocupada" &&
                modelo.canScheduleNext !== false && (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Puedes solicitar el siguiente turno desde Telegram.
                  </p>
                )}
            </div>
            <div className="w-12 h-px bg-[#C5A55A]/60 mb-6" />

            {/* Descripcion con whitespace-pre-wrap para respetar saltos de linea */}
            {modelo.descripcion && (
              <p className="text-sm sm:text-[15px] text-zinc-300 font-light leading-relaxed mb-8 whitespace-pre-wrap">
                {modelo.descripcion}
              </p>
            )}

            {/* Servicios Extra */}
            {modelo.extras && modelo.extras.length > 0 && (
              <div className="mt-6 mb-8">
                <h3 className="font-heading text-lg font-semibold text-[#C5A55A] tracking-wider mb-3">
                  Servicios Extra
                </h3>
                <div className="space-y-3 border-t border-zinc-900 pt-3">
                  {modelo.extras.map((extra) => (
                    <div
                      key={extra.id || extra.nombre}
                      className="flex items-center justify-between text-xs sm:text-sm text-zinc-300 font-light"
                    >
                      <span className="font-sans">{extra.nombre}</span>
                      <span className="font-mono text-[#E8D5A3] font-medium">${extra.precio}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Barra flotante inferior de contacto fija en móvil para que siempre esté visible */}
            <div className="sticky bottom-0 inset-x-0 z-40 mt-6 -mx-6 -mb-6 p-4 bg-gradient-to-t from-black via-black/95 to-black/80 backdrop-blur-lg border-t border-zinc-800/80 sm:hidden">
              {modelo.contactLink && canContact ? (
                <a
                  href={modelo.contactLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 w-full py-4 bg-gradient-to-r from-[#C5A55A] via-[#E8D5A3] to-[#C5A55A] text-black font-extrabold text-xs tracking-[0.25em] uppercase transition-all duration-300 rounded-lg shadow-[0_0_20px_rgba(197,165,90,0.4)]"
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  {modelo.contactLabel || "Contacto"}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center border border-zinc-800 bg-zinc-950 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600 rounded-lg"
                >
                  {status}
                </button>
              )}
            </div>
          </div>

          {/* Links para escritorio / dentro del flujo en desktop */}
          <div className="space-y-3 mt-8 hidden sm:block">
            {/* Link de X */}
            {modelo.linkX && (
              <a
                href={modelo.linkX}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-5 py-4 border border-zinc-800 hover:border-[#C5A55A]/40 bg-zinc-900/30 hover:bg-zinc-900/60 transition-all duration-300 group rounded-lg"
              >
                <svg
                  className="w-4 h-4 text-zinc-400 group-hover:text-[#E8D5A3] transition-colors flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-xs font-medium tracking-wide text-zinc-300 group-hover:text-[#E8D5A3] transition-colors">
                  Sigueme para mas contenido
                </span>
              </a>
            )}

            {/* Link de contacto */}
            {modelo.contactLink && canContact && (
              <a
                href={modelo.contactLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full px-5 py-4 bg-[#C5A55A] hover:bg-[#D4AF37] text-black font-black text-xs tracking-[0.2em] uppercase transition-all duration-300 rounded-lg shadow-[0_0_15px_rgba(197,165,90,0.15)] hover:shadow-[0_0_25px_rgba(197,165,90,0.3)]"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                {modelo.contactLabel || "Contacto"}
              </a>
            )}
            {!canContact && (
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center border border-zinc-800 bg-zinc-950 px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600"
              >
                {status}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
