"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { logoutAction } from "@/lib/actions/auth";
import { broadcastLogout } from "@/lib/client-session";

/**
 * Sale de la sesion desde los portales.
 *
 * Hasta que las modelos y los choferes entraron con correo y contraseña esto no
 * hacia falta: se llegaba con un enlace del bot y no habia sesion que cerrar.
 * Ahora la aplicacion queda instalada en su telefono, y sin esto no hay forma
 * de salir --por ejemplo, si presta el aparato o si el correo quedo mal puesto
 * y hay que entrar con otro.
 *
 * `broadcastLogout` avisa a las demas pestañas abiertas, igual que en el panel:
 * cerrar en una y seguir dentro en otra es peor que no cerrar.
 */
export default function CerrarSesion({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function salir() {
    startTransition(async () => {
      try {
        await logoutAction();
        broadcastLogout();
        router.replace("/admin");
      } catch {
        toast.error("No se pudo cerrar la sesión. Intenta de nuevo.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={pendiente}
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      className={
        className ??
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A] disabled:opacity-50"
      }
    >
      <LogOut size={17} />
    </button>
  );
}
