"use client";

import { Check, Link2Off } from "lucide-react";

import TelegramOtpButton from "@/components/erp/telegram-otp-button";

/**
 * Si esta persona tiene ya su cuenta de Telegram vinculada.
 *
 * Las tablas del panel enseñaban el boton de generar el codigo de vinculacion,
 * pero no si hacia falta usarlo: no habia forma de saber de un vistazo quien
 * estaba vinculado y quien no. Y sin Telegram vinculado no se recibe nada --ni
 * la oferta de un viaje, ni la autorizacion de un servicio-- asi que es de lo
 * primero que hay que poder mirar cuando alguien dice que no le llega nada.
 *
 * Cuando ya esta vinculado no se ofrece el codigo: generarlo ahi es una accion
 * rara --se rehace el vinculo, normalmente porque cambio de telefono-- y no
 * merece estar delante en cada fila. Queda detras del estado, en pequeño.
 */
export default function EstadoDeTelegram({
  usuarioId,
  telegramChatId,
}: {
  /** Id del usuario, no el de la empleada o el chofer. */
  usuarioId: string | null | undefined;
  /** Lo que decide el estado: con chat vinculado, hay Telegram. */
  telegramChatId?: string | null;
}) {
  if (!usuarioId) {
    return (
      <span className="text-[11px] text-zinc-600">Sin cuenta de acceso</span>
    );
  }

  if (telegramChatId) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
          <Check size={11} />
          Vinculado
        </span>
        <details className="group">
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wider text-zinc-600 transition-colors hover:text-[#C5A55A]">
            Revincular
          </summary>
          <div className="mt-2">
            <TelegramOtpButton usuarioId={usuarioId} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
        <Link2Off size={11} />
        Sin vincular
      </span>
      <TelegramOtpButton usuarioId={usuarioId} />
    </div>
  );
}
