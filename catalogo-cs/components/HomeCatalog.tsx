"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import Hero from "@/components/Hero";
import ModelGrid from "@/components/ModelGrid";
import ModelProfile from "@/components/ModelProfile";
import Footer from "@/components/Footer";
import { AnimateIn } from "@/components/AnimateIn";
import type { Modelo } from "@/types";

interface HomeCatalogProps {
  /** Catalogo ya resuelto en el servidor: llega renderizado en el HTML inicial. */
  modelos: Modelo[];
  /** Cada cuantos ms se pide al servidor una version fresca del catalogo. */
  refreshIntervalMs?: number;
}

/**
 * Capa interactiva de la portada. Recibe el catalogo ya resuelto por el Server
 * Component, asi que no hace fetch en el montaje: el HTML inicial ya trae las
 * modelos (SEO y LCP) y aqui solo vive el estado de la UI.
 */
export default function HomeCatalog({
  modelos,
  refreshIntervalMs = 60_000,
}: HomeCatalogProps) {
  const router = useRouter();
  const catalogRef = useRef<HTMLElement | null>(null);
  const [selectedModeloId, setSelectedModeloId] = useState<string | null>(null);

  // Derivar del prop en vez de duplicar en estado: cuando el servidor manda un
  // catalogo nuevo, el modal abierto se actualiza solo y se cierra si esa
  // modelo dejo de estar publicada.
  const selectedModelo =
    modelos.find((modelo) => modelo._id === selectedModeloId) ?? null;

  // El carrusel del Hero arranca en otra modelo que la rejilla, para no repetir
  // la misma foto dos veces en el primer pantallazo. Es una rotacion
  // determinista (no aleatoria) para que SSR e hidratacion coincidan.
  const heroModelos = useMemo(() => {
    if (modelos.length <= 1) return modelos;
    const mitad = Math.floor(modelos.length / 2);
    return [...modelos.slice(mitad), ...modelos.slice(0, mitad)];
  }, [modelos]);

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Refresco periodico sin volver a montar la pagina: el servidor revalida el
  // catalogo y React reconcilia el arbol.
  useEffect(() => {
    if (refreshIntervalMs <= 0) return;

    const refresh = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    };

    const interval = window.setInterval(refresh, refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [router, refreshIntervalMs]);

  return (
    <>
      <main className="relative">
        <Hero
          onViewCatalog={scrollToCatalog}
          modelos={heroModelos}
          onSelectModelo={(modelo) => setSelectedModeloId(modelo._id)}
        />

        {/* Seccion Catalogo */}
        <section
          id="catalogo"
          ref={catalogRef as React.RefObject<HTMLElement>}
          className="relative w-full bg-black py-16 sm:py-24"
        >
          {/* Fondo decorativo */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(197, 165, 90, 0.03) 0%, transparent 60%)",
            }}
          />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <AnimateIn className="mb-12 sm:mb-16">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="text-[10px] font-semibold tracking-[0.35em] text-[#C5A55A]/60 uppercase">
                  Nuestras modelos
                </span>
                <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-semibold text-white tracking-wide">
                  Catalogo
                </h2>
                <div className="w-12 h-px line-gold mt-1" />
              </div>
            </AnimateIn>

            <AnimateIn delay={0.15}>
              {modelos.length > 0 ? (
                <ModelGrid
                  modelos={modelos}
                  onSelectModelo={(modelo) => setSelectedModeloId(modelo._id)}
                />
              ) : (
                <p className="py-24 text-center text-sm font-light text-zinc-500">
                  Por el momento no hay modelos publicadas. Vuelve en un rato.
                </p>
              )}
            </AnimateIn>
          </div>
        </section>

        <Footer />
      </main>

      {/* Modal de perfil */}
      <AnimatePresence>
        {selectedModelo && (
          <ModelProfile
            modelo={selectedModelo}
            onClose={() => setSelectedModeloId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
