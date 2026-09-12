"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MessageCircle, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { escribirEnCanal, leerCanal } from "@/lib/actions/employee-portal";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { MensajeDelCanal } from "@/lib/types";

/**
 * Canal con coordinación: dudas, avisos y lo que haga falta aclarar.
 *
 * Es opcional. Nada del trabajo depende de escribir aquí: existe para la duda
 * que antes había que resolver por el chat del servicio --que solo vive
 * mientras hay servicio-- o por el grupo, donde escribe todo el mundo.
 *
 * Del otro lado nunca hay un nombre. Lo que ella ve es "Coordinación", y el
 * backend no manda quién escribió, así que aquí no hay forma de averiguarlo
 * aunque se quisiera. Al revés sí: quien la coordina sabe con quién habla.
 */
export default function CanalCoordinacion({ token }: { token?: string }) {
  const [mensajes, setMensajes] = useState<MensajeDelCanal[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, startTransition] = useTransition();
  const finDelHilo = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    const resultado = await leerCanal(token);
    if (resultado.success) setMensajes(resultado.mensajes);
    setCargando(false);
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /*
   * Se recarga cuando llega un mensaje nuevo por el canal en vivo. El aviso lo
   * emite el backend al destinatario, así que no hace falta preguntar cada
   * pocos segundos por algo que casi nunca cambia.
   */
  useEffect(() => {
    function alEvento(evento: Event) {
      const detalle = (evento as CustomEvent).detail as { type?: string };
      if (detalle?.type === "team_channel_message") void cargar();
    }
    window.addEventListener("portal-realtime-event", alEvento);
    return () => window.removeEventListener("portal-realtime-event", alEvento);
  }, [cargar]);

  useEffect(() => {
    finDelHilo.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes]);

  function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;

    startTransition(async () => {
      const resultado = await escribirEnCanal(cuerpo, token);
      if (!resultado.success || !resultado.mensaje) {
        toast.error(resultado.error ?? "No se pudo enviar tu mensaje");
        return;
      }
      setMensajes((actuales) => [...actuales, resultado.mensaje!]);
      setTexto("");
    });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="flex items-center gap-2">
          <MessageCircle size={16} className="text-[#C5A55A]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#E8D5A3]">
            Coordinación
          </span>
        </span>
        <button
          type="button"
          onClick={() => void cargar()}
          aria-label="Actualizar la conversación"
          className="rounded-lg border border-white/10 p-2 text-gray-400 transition-colors hover:text-white"
        >
          <RefreshCw size={14} />
        </button>
      </header>

      <div className="max-h-96 space-y-2.5 overflow-y-auto px-4 py-4">
        {cargando ? (
          <p className="py-6 text-center text-xs text-gray-500">Abriendo…</p>
        ) : mensajes.length === 0 ? (
          <p className="py-6 text-center text-xs leading-relaxed text-gray-500">
            Aquí puedes preguntar cualquier duda. Es opcional y lo lee quien te
            coordina.
          </p>
        ) : (
          mensajes.map((mensaje) => (
            <article
              key={mensaje.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                mensaje.emisor === "empleada"
                  ? "ml-auto bg-[#C5A55A] text-black"
                  : "border border-white/10 bg-white/5 text-gray-200"
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">
                {mensaje.emisor === "empleada" ? "Tú" : "Coordinación"}
              </span>
              {mensaje.cuerpo}
              <span className="mt-1 block text-[10px] opacity-60">
                {formatFecha(mensaje.createdAt)}
              </span>
            </article>
          ))
        )}
        <div ref={finDelHilo} />
      </div>

      <div className="flex items-end gap-2 border-t border-white/10 p-3">
        <textarea
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          rows={1}
          maxLength={2000}
          placeholder="Escribe tu duda"
          className="min-h-11 flex-1 resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#C5A55A]"
        />
        <button
          type="button"
          disabled={enviando || !texto.trim()}
          aria-busy={enviando}
          onClick={enviar}
          aria-label="Enviar"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#C5A55A] text-black transition-colors hover:bg-[#E8D5A3] disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </section>
  );
}

function formatFecha(iso: string) {
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}
