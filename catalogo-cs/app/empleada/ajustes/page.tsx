import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import PaginaDeAvisos from "@/components/ui/PaginaDeAvisos";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Avisos -- Mi Portal",
  robots: "noindex, nofollow",
};

/**
 * Los avisos son de la cuenta, asi que aqui hace falta sesion propia: quien
 * entra con un enlace de un solo uso del bot no tiene un dispositivo que
 * suscribir ni ajustes que guardar.
 */
export default async function EmpleadaAjustesPage() {
  const sesion = await getCurrentUser();
  if (!sesion) redirect("/admin");

  return (
    <div className="min-h-dvh bg-[#0B0D13] p-4 text-gray-100 sm:p-6">
      <PaginaDeAvisos volverA="/empleada/portal" volverTexto="Mi portal" />
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}
