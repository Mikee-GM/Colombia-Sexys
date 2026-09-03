import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Toaster } from "sonner";

import ServicioAhora from "@/components/empleada/ServicioAhora";
import ActualizarEnVivo from "@/components/ui/ActualizarEnVivo";
import { getEmployeePortalData } from "@/lib/actions/employee-portal";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Mi servicio -- Colombia Sexys",
  robots: "noindex, nofollow",
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * El servicio en curso, solo.
 *
 * En el portal esto vivia por encima de las pestañas, con las ganancias, el
 * ranking y las fotos alrededor. Mientras se hace un servicio nada de eso
 * importa: lo que hace falta es la duracion, el pago, y los botones de
 * finalizar, extender, cobrar un extra o pedir prorroga. Aqui no hay nada mas,
 * y a esta pantalla apuntan los avisos que se mandan durante el servicio.
 */
export default async function EmpleadaServicioPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const sesion = await getCurrentUser();
  if (!sesion && !token) redirect("/admin");

  const resultado = await getEmployeePortalData(token);
  if (!resultado.success || !resultado.data) redirect("/empleada/portal");

  return (
    <div className="min-h-dvh bg-[#0B0D13] text-gray-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0D13]/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Link
            href="/empleada/portal"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-[#C5A55A]"
          >
            <ArrowLeft size={14} />
            Mi portal
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C5A55A]">
            {resultado.data.profile.nombreArtistico}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
        {/* Lo que autoriza o cambia el jefe tiene que llegar sin recargar. */}
        <ActualizarEnVivo canal="empleada" />
        <ServicioAhora servicio={resultado.data.activeService} token={token} />
      </main>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}
