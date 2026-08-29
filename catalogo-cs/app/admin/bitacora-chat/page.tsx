import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getServicesForChatReviewAction } from "@/lib/actions/dev-chat-log";
import ConversationLogViewer from "@/components/admin/dev/ConversationLogViewer";

export const metadata = {
  robots: "noindex, nofollow",
};

/**
 * Bitacora interna del flujo de chat, de principio a fin, por servicio.
 *
 * No es una pantalla de operacion: es para revisar si la IA o el flujo de
 * reserva se comportaron bien en un caso puntual. Por eso no tiene entrada en
 * el menu del panel -- se llega solo escribiendo la ruta -- y se restringe a
 * admin en vez de tambien a jefe.
 */
export default async function BitacoraChatPage() {
  const user = await getCurrentUser();
  if (!user || user.rol !== "admin") redirect("/admin");

  const contexto = "la bitacora de chat";
  const services = await optionalSource(
    getServicesForChatReviewAction(),
    [],
    contexto,
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">
          Bitácora de chat por servicio
        </h1>
        <p className="text-sm text-zinc-500">
          Herramienta interna para revisar el flujo completo de un servicio,
          desde el primer mensaje hasta el último. No compartir el enlace
          fuera del equipo de desarrollo.
        </p>
      </div>
      <ConversationLogViewer initialServices={services} />
    </div>
  );
}
