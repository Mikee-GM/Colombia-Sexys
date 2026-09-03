import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Toaster } from "sonner";

import ViajeAhora from "@/components/chofer/ViajeAhora";
import OfertaDeViaje from "@/components/chofer/OfertaDeViaje";
import ActualizarEnVivo from "@/components/ui/ActualizarEnVivo";
import { ZONA_LABEL } from "@/components/chofer/zonas";
import { getDriverPortalData } from "@/lib/actions/driver-portal";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Mi viaje -- Colombia Sexys",
  robots: "noindex, nofollow",
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * El viaje en curso, solo.
 *
 * Mismo criterio que en el portal de la empleada: durante el viaje lo unico que
 * hace falta es el viaje y sus botones. Las ofertas pendientes si entran aqui
 * porque caducan, y perderselas por estar en otra pantalla cuesta un servicio.
 */
export default async function ChoferServicioPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const sesion = await getCurrentUser();
  if (!sesion && !token) redirect("/admin");

  const resultado = await getDriverPortalData(token);
  if (!resultado.success || !resultado.data) redirect("/chofer/portal");

  return (
    <div className="min-h-dvh bg-[#0B0D13] text-gray-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0D13]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href="/chofer/portal"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-[#C5A55A]"
          >
            <ArrowLeft size={14} />
            Mi portal
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C5A55A]">
            Mi viaje
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
        <ActualizarEnVivo canal="chofer" />
        {resultado.data.pendingOffers.map((oferta) => (
          <OfertaDeViaje key={oferta.id} oferta={oferta} />
        ))}
        <ViajeAhora viaje={resultado.data.activeTrip} zonaLabel={ZONA_LABEL} />
      </main>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}
