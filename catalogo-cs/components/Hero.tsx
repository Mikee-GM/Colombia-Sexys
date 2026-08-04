"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Modelo } from "@/types";
import { FaTelegramPlane } from "react-icons/fa";
import { getGroupServiceTelegramUrl } from "@/lib/telegram-links";

// Componente para particulas doradas flotantes
function GoldParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(15)].map((_, i) => {
        // Valores deterministas basados en el índice i para evitar desajustes de hidratación (hydration mismatch) en Next.js SSR
        const left = ((i * 37 + 13) % 95) + 2;
        const top = ((i * 53 + 17) % 90) + 5;
        const size = ((i * 19) % 3) + 1.5;
        const duration = ((i * 23) % 15) + 15;
        const delay = ((i * 29) % 50) / 10;
        const yOffset = -(((i * 41) % 150) + 50);
        const xOffset = ((i * 47) % 100) - 50;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full bg-[#C5A55A]"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${size}px`,
              height: `${size}px`,
              boxShadow: "0 0 10px rgba(197, 165, 90, 0.5)",
              willChange: "transform, opacity",
            }}
            initial={{ opacity: 0, y: 0, x: 0 }}
            animate={{
              opacity: [0, 0.4, 0],
              y: [0, yOffset],
              x: [0, xOffset],
            }}
            transition={{
              duration,
              repeat: Infinity,
              ease: "linear",
              delay,
            }}
          />
        );
      })}
    </div>
  );
}

interface HeroProps {
  onViewCatalog: () => void;
  modelos?: Modelo[];
  onSelectModelo?: (m: Modelo) => void;
}

export default function Hero({ onViewCatalog, modelos, onSelectModelo }: HeroProps) {
  const groupServiceTelegramUrl = getGroupServiceTelegramUrl();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Desplazamiento automático del carrusel cada 12 segundos para mayor dinamismo
  useEffect(() => {
    if (!modelos || modelos.length <= 1) return;
    const interval = setInterval(() => {
      if (isHovered) return;
      const el = carouselRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 5) return; // Si todo cabe en pantalla, no desplazar

      const cardWidth = 280; // Ancho aproximado de tarjeta + espacio
      if (el.scrollLeft + cardWidth >= maxScroll - 20) {
        // Al llegar al final, regresar suavemente al inicio (ciclo continuo)
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: cardWidth, behavior: "smooth" });
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [modelos, isHovered]);

  const scrollCarousel = (direction: "left" | "right") => {
    const el = carouselRef.current;
    if (!el) return;
    const cardWidth = 300;
    el.scrollBy({
      left: direction === "left" ? -cardWidth : cardWidth,
      behavior: "smooth",
    });
  };

  return (
    <section
      id="hero"
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-black"
    >
      {/* Video Background - Optimizado con aceleración por GPU para eliminar lag/stutter en Desktop */}
      <div className="absolute inset-0 z-0 overflow-hidden" style={{ transform: "translateZ(0)" }}>
        <video
          src="/Colombia-Slider-1.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover transform-gpu"
          style={{ willChange: "transform" }}
        />
      </div>

      {/* Capas de oscurecimiento y gradientes (sin mix-blend-overlay para evitar lag de pintura por píxel) */}
      <div className="absolute inset-0 z-0 bg-black/40 sm:bg-black/50" />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-black via-black/30 sm:via-black/40 to-transparent" />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black via-black/10 sm:via-black/20 to-transparent opacity-80" />
      <div
        className="absolute inset-0 z-0 opacity-25"
        style={{
          background: "radial-gradient(circle at center, rgba(197, 165, 90, 0.25) 0%, transparent 65%)",
        }}
      />

      {/* Particulas animadas */}
      <GoldParticles />

      {/* Contenido Central */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center text-center px-4 sm:px-8 max-w-4xl mx-auto w-full mt-10"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: "easeOut" }}
          className="mb-8 relative"
        >
          <div className="w-[320px] h-[320px] sm:w-[450px] sm:h-[450px] lg:w-[550px] lg:h-[550px] relative">
            <Image
              src="/logo-vertical.webp"
              alt="Colombia Sexys"
              fill
              sizes="(max-width: 640px) 320px, (max-width: 1024px) 450px, 550px"
              className="object-contain scale-[1.6] md:scale-[1.8] drop-shadow-[0_0_25px_rgba(0,0,0,0.8)]"
              priority
            />
          </div>
        </motion.div>

        {/* Separador elegante */}
        <div className="flex items-center gap-4 w-full max-w-[200px] mb-8 opacity-60">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#C5A55A]" />
          <div className="w-1.5 h-1.5 rotate-45 bg-[#E8D5A3]" />
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#C5A55A]" />
        </div>

        {/* Subtitulo animado letra por letra (opcional, o fade simple) */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="font-body text-sm sm:text-base lg:text-lg font-light text-zinc-300 leading-relaxed tracking-[0.2em] uppercase max-w-2xl mb-12 drop-shadow-lg"
        >
          El pináculo de la belleza colombiana.
        </motion.p>

        {/* Boton Ultra-Premium de Lujo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="mt-6 flex w-full flex-col items-center justify-center sm:flex-row"
        >
          <div className="group relative w-full max-w-xs sm:w-auto">
            {/* Aura de resplandor dorado escultural */}
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#AA771C] opacity-50 blur-md transition-all duration-700 group-hover:opacity-90 group-hover:scale-105" />
            <button
              onClick={onViewCatalog}
              className="relative flex w-full items-center justify-center gap-4 overflow-hidden rounded-full border border-[#D4AF37]/80 bg-gradient-to-b from-[#1a1814] via-[#0c0a08] to-[#050505] px-10 py-5 shadow-[0_0_35px_rgba(212,175,55,0.25)] backdrop-blur-xl transition-all duration-500 group-hover:border-[#F3E5AB] group-hover:shadow-[0_0_50px_rgba(212,175,55,0.45)] sm:w-auto sm:px-14"
            >
              {/* Brillo especular dinámico al pasar el cursor */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#F3E5AB]/20 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
              
              <span className="relative z-10 font-heading text-xs sm:text-sm font-semibold uppercase tracking-[0.35em] text-[#E8D5A3] transition-colors duration-500 group-hover:text-white">
                Ver catálogo
              </span>
              
              <svg
                className="relative z-10 h-4 w-4 text-[#D4AF37] transition-all duration-500 group-hover:translate-y-1 group-hover:text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
              </svg>
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Carrusel de Preview de Modelos - Full Width en Computadora, Mobile First */}
      {modelos && modelos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="relative z-10 w-full max-w-[1500px] mx-auto mt-12 sm:mt-16 mb-6 px-4 sm:px-8 group/carousel"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={() => setIsHovered(true)}
          onTouchEnd={() => setIsHovered(false)}
        >
          {/* Botón Navegación Izquierda (Desktop) */}
          <button
            type="button"
            onClick={() => scrollCarousel("left")}
            className="hidden md:flex absolute left-1 lg:left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 border border-[#C5A55A]/40 text-[#E8D5A3] items-center justify-center shadow-lg backdrop-blur-md opacity-0 group-hover/carousel:opacity-100 hover:bg-[#C5A55A] hover:text-black transition-all duration-300"
            aria-label="Modelo anterior"
          >
            ←
          </button>

          {/* Botón Navegación Derecha (Desktop) */}
          <button
            type="button"
            onClick={() => scrollCarousel("right")}
            className="hidden md:flex absolute right-1 lg:right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 border border-[#C5A55A]/40 text-[#E8D5A3] items-center justify-center shadow-lg backdrop-blur-md opacity-0 group-hover/carousel:opacity-100 hover:bg-[#C5A55A] hover:text-black transition-all duration-300"
            aria-label="Modelo siguiente"
          >
            →
          </button>

          <div
            ref={carouselRef}
            className="flex items-center gap-3.5 sm:gap-5 overflow-x-auto snap-x snap-mandatory customized-scrollbar pb-6 justify-start"
          >
            {modelos.slice(0, 12).map((m) => (
              <button
                key={m._id}
                onClick={() => onSelectModelo?.(m)}
                className="relative flex-shrink-0 w-36 h-48 sm:w-48 sm:h-64 md:w-56 md:h-72 lg:w-64 lg:h-80 xl:w-72 xl:h-96 snap-center overflow-hidden rounded-xl border border-zinc-800 hover:border-[#C5A55A] transition-all duration-500 group cursor-pointer shadow-2xl shadow-black/80 transform-gpu"
                aria-label={`Ver perfil de ${m.nombre}`}
              >
                <Image
                  src={m.fotoPrincipal}
                  alt={m.nombre}
                  fill
                  sizes="(max-width: 640px) 144px, (max-width: 1024px) 224px, 288px"
                  className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="absolute bottom-4 inset-x-0 text-center text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase text-zinc-300 group-hover:text-[#E8D5A3] drop-shadow-md transition-colors duration-500">
                  {m.nombre}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Gradiente inferior para fusionar con el fondo negro del catalogo */}
      <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-black to-transparent z-10 pointer-events-none" />
    </section>
  );
}
