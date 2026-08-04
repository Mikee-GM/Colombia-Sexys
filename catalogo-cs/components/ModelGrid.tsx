"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Modelo } from "@/types";
import CustomerRating from "@/components/ui/CustomerRating";
import { availabilityLabel } from "@/lib/availability";

interface ModelCardProps {
  modelo: Modelo;
  index: number;
  onSelect: (modelo: Modelo) => void;
}

function ModelCard({ modelo, index, onSelect }: ModelCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const status = availabilityLabel(modelo);
  const available = modelo.availabilityStatus
    ? modelo.availabilityStatus === "disponible"
    : modelo.disponible;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group cursor-pointer relative overflow-hidden"
      onClick={() => onSelect(modelo)}
    >
      {/* Imagen */}
      <div className="relative aspect-[3/4] bg-zinc-950 overflow-hidden">
        {!imgLoaded && (
          <div className="absolute inset-0 bg-zinc-900 animate-pulse" />
        )}
        {modelo.fotoPrincipal ? (
          <Image
            src={modelo.fotoPrincipal}
            alt={modelo.nombre}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={`object-cover transition-all duration-700 ease-out group-hover:scale-105 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-900 border border-zinc-800/50">
            <span className="text-zinc-600 text-[10px] uppercase tracking-widest text-center px-4 font-bold">
              Sin Foto
            </span>
          </div>
        )}

        {/* Overlay gradiente */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-500" />

        {/* Borde dorado sutil al hover */}
        <div className="absolute inset-0 border border-[#C5A55A]/0 group-hover:border-[#C5A55A]/30 transition-all duration-500" />

        {/* Etiqueta editorial de cristal ahumado de alta costura */}
        <div className="absolute left-4 top-4 z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C5A55A]/35 bg-black/65 px-3.5 py-1.5 backdrop-blur-md shadow-md">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                available
                  ? "bg-[#E8D5A3] shadow-[0_0_6px_rgba(232,213,163,0.8)]"
                  : "bg-zinc-500"
              }`}
            />
            <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-zinc-100">
              {status}
            </span>
          </div>
        </div>

        {/* Nombre sobre la imagen */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
          <h3 className="font-heading text-lg sm:text-xl lg:text-2xl font-semibold text-white tracking-wide leading-tight">
            {modelo.nombre}
          </h3>
          <CustomerRating
            average={modelo.clientRatingAverage}
            count={modelo.clientRatingCount}
            compact
            className="mt-2"
          />
          <div className="w-8 h-px bg-[#C5A55A]/60 mt-2 group-hover:w-12 transition-all duration-500" />
        </div>

        {/* Indicador "Ver perfil" al hover */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
          <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-[#E8D5A3] bg-black/60 backdrop-blur-sm px-3 py-1.5 border border-[#C5A55A]/30">
            Ver perfil
          </span>
        </div>
      </div>
    </motion.div>
  );
}

interface ModelGridProps {
  modelos: Modelo[];
  onSelectModelo: (modelo: Modelo) => void;
}

export default function ModelGrid({ modelos, onSelectModelo }: ModelGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
      {modelos.map((modelo, index) => (
        <ModelCard
          key={modelo._id}
          modelo={modelo}
          index={index}
          onSelect={onSelectModelo}
        />
      ))}
      {modelos.length === 0 && (
        <p className="py-16 text-center text-zinc-600 text-sm font-light tracking-wide col-span-2 md:col-span-3 lg:col-span-4">
          No hay modelos disponibles en este momento
        </p>
      )}
    </div>
  );
}
