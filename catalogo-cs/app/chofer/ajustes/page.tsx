import { redirect } from "next/navigation";
import { Toaster } from "sonner";

import PaginaDeAvisos from "@/components/ui/PaginaDeAvisos";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Avisos -- Portal de chofer",
  robots: "noindex, nofollow",
};

export default async function ChoferAjustesPage() {
  const sesion = await getCurrentUser();
  if (!sesion) redirect("/admin");

  return (
    <div className="min-h-dvh bg-[#0B0D13] p-4 text-gray-100 sm:p-6">
      <PaginaDeAvisos volverA="/chofer/portal" volverTexto="Mi portal" />
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}
