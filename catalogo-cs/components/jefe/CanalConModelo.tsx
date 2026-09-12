"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw, Send, X } from "lucide-react";
import { toast } from "sonner";

import { escribirAModelo, leerCanalDeModelo } from "@/lib/actions/team-channel";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { Employee, MensajeDelCanalJefe } from "@/lib/types";

/**
 * Conversación con una modelo, desde el panel.
 *
 * Es opcional y sirve para aclarar dudas: nada del flujo operativo depende de
 * ella. Antes esto solo existía dentro del chat de un servicio, que muere con
 * el servicio, o en el grupo, donde lee todo el mundo.
 *
 * Del lado de ella nunca aparece quién escribe: los mensajes le llegan como
 * "Coordinación". Aquí sí se ve con quién se habla y quién contestó, porque
 * coordinar a ciegas no tiene sentido.
 */
export default function CanalConModelo({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const [mensajes, setMensajes] = useState<MensajeDelCanalJefe[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, startTransition] = useTransition();
  const finDelHilo = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    const resultado = await leerCanalDeModelo(employee.id);
    if (!resultado.success) toast.error(resultado.error);
    else setMensajes(resultado.mensajes);
    setCargando(false);
  }, [employee.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* El panel ya tiene su canal en vivo: aquí solo se escucha lo que llega. */
  useEffect(() => {
    function alEvento(evento: Event) {
      const detalle = (evento as CustomEvent).detail as {
        type?: string;
        data?: { empleadaId?: string };
      };
      if (
        detalle?.type === "team_channel_message" &&
        detalle.data?.empleadaId === employee.id
      ) {
        void cargar();
      }
    }
    window.addEventListener("jefe-realtime-event", alEvento);
    return () => window.removeEventListener("jefe-realtime-event", alEvento);
  }, [cargar, employee.id]);

  useEffect(() => {
    finDelHilo.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes]);

  function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;

    startTransition(async () => {
      const resultado = await escribirAModelo(employee.id, cuerpo);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      setMensajes((actuales) => [...actuales, resultado.mensaje]);
      setTexto("");
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-3"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="canal-modelo-title"
        className="flex w-full max-h-[85vh] flex-col rounded-t-3xl border border-b-0 border-zinc-800 bg-[#050505] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:border-b"
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A55A]">
              Canal privado
            </p>
            <h2 id="canal-modelo-title" className="mt-1 truncate font-heading text-2xl">
              {employee.nombreArtistico}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Ella lo ve como mensajes de Coordinación: tu nombre no aparece.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void cargar()}
              aria-label="Actualizar la conversación"
              className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-white"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg border border-zinc-800 p-2 text-zinc-500 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          {cargando ? (
            <p className="py-8 text-center text-sm text-zinc-600">Abriendo…</p>
          ) : mensajes.length === 0 ? (
            <p className="py-8 text-center text-sm leading-relaxed text-zinc-600">
              Todavía no hay nada escrito. Lo que mandes le llega a su portal y a
              su chat.
            </p>
          ) : (
            mensajes.map((mensaje) => (
              <article
                key={mensaje.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  mensaje.emisor === "jefe"
                    ? "ml-auto bg-[#C5A55A] text-black"
                    : "border border-zinc-800 bg-zinc-900/70 text-zinc-200"
                }`}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {mensaje.autor ?? "Coordinación"}
                  {mensaje.tipo === "jornada" && " · jornada"}
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

        <div className="flex items-end gap-2 border-t border-zinc-800 p-3">
          <textarea
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={1}
            maxLength={2000}
            placeholder="Escribe tu mensaje"
            className="min-h-11 flex-1 resize-none rounded-lg border border-zinc-800 bg-black px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
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
    </div>
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
