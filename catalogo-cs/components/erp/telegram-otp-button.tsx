"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { generateTelegramOtpAction } from "@/lib/actions/jefes";

/**
 * Generacion del codigo OTP para vincular Telegram.
 *
 * Hasta ahora este bloque estaba duplicado en ChoferesDashboard, JefesDashboard
 * y ModelosDashboard con la misma logica y el mismo marcado. El ERP lo usa en
 * los tres roles y en el expediente, asi que vive en un solo sitio.
 *
 * Llama a POST /users/{id}/telegram-otp, que exige rol admin o jefe.
 */

type Props = {
  /** Id del usuario, no el de la empleada o el chofer. */
  usuarioId: string;
  /** Codigo ya emitido y aun vigente, si la vista lo conoce. */
  initialCode?: string | null;
};

export default function TelegramOtpButton({ usuarioId, initialCode }: Props) {
  const [code, setCode] = useState<string | null>(initialCode ?? null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const res = await generateTelegramOtpAction(usuarioId);
      if (!res.success || !res.code) {
        throw new Error(res.error || "No se pudo generar el OTP");
      }

      setCode(res.code);
      toast.success("OTP generado correctamente.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al generar OTP";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(`/vincular ${code}`);
      toast.success("Copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el comando");
    }
  };

  if (code) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-[#C5A55A]/30 bg-[#C5A55A]/10 px-3 py-1.5 font-mono text-sm font-bold tracking-[0.08em] text-[#C5A55A]">
          {code}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          title="Copiar comando de vinculacion"
          className="p-1 text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={loading}
      className="text-xs font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3] disabled:opacity-50"
    >
      {loading ? "Generando..." : "Generar OTP"}
    </button>
  );
}
