"use client";

import { useRef, useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import Hero from "@/components/Hero";
import ModelGrid from "@/components/ModelGrid";
import ModelProfile from "@/components/ModelProfile";
import Footer from "@/components/Footer";
import { AnimateIn } from "@/components/AnimateIn";
import { getCatalogModelosAction as getModelos } from "@/lib/actions/modelos";
import type { Modelo } from "@/types";

export default function Home() {
  const catalogRef = useRef<HTMLElement | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModelo, setSelectedModelo] = useState<Modelo | null>(null);

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    let cancelled = false;

    async function loadModelos() {
      try {
        const data = await getModelos(false);
        if (!cancelled) {
          setModelos((current) => {
            if (current.length === 0) return data;
            const latest = new Map(data.map((modelo) => [modelo._id, modelo]));
            const retained = current
              .map((modelo) => latest.get(modelo._id))
              .filter((modelo): modelo is Modelo => Boolean(modelo));
            const retainedIds = new Set(retained.map((modelo) => modelo._id));
            return [
              ...retained,
              ...data.filter((modelo) => !retainedIds.has(modelo._id)),
            ];
          });
          setSelectedModelo((current) =>
            current
              ? data.find((modelo) => modelo._id === current._id) ?? null
              : null,
          );
        }
      } catch (error) {
        console.error("Error cargando modelos:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadModelos();
    const interval = window.setInterval(() => {
      void loadModelos();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <>
      <main className="relative">
        <Hero 
          onViewCatalog={scrollToCatalog} 
          modelos={modelos} 
          onSelectModelo={setSelectedModelo} 
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
              {loading ? (
                <div className="py-24 flex items-center justify-center">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-[#C5A55A]/40 rounded-full animate-pulse"
                        style={{ animationDelay: `${i * 200}ms` }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <ModelGrid
                  modelos={modelos}
                  onSelectModelo={setSelectedModelo}
                />
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
            onClose={() => setSelectedModelo(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
