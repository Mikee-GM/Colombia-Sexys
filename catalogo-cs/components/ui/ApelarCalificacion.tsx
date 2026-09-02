"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, Star } from "lucide-react";
import { toast } from "sonner";

import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

/**
 * Apelar una calificacion baja.
 *
 * Una calificacion de una o dos estrellas no es solo una opinion: alimenta el
 * score de confianza y puede acabar en una sancion con multa. Apelarla era el
 * unico recurso de la persona afectada, y hasta ahora solo existia detras de un
 * boton del chat de Telegram. Quien entra al portal con correo y contrasena no
 * tenia ninguna via.
 *
 * La tarjeta no aparece si no hay nada que apelar, que es lo normal: no tiene
 * sentido recordarle todos los dias que existen las calificaciones bajas.
 */

/** Lo que el backend devuelve de cada calificacion apelable. */
export type CalificacionApelable = {
  id: string;
  direction: string;
  stars: number;
  comment: string | null;
  createdAt: string;
};

/** El minimo que exige el backend. Se avisa antes de mandar, no despues. */
const MINIMO_MOTIVO = 15;

export default function ApelarCalificacion({
  cargar,
  apelar,
  token,
}: {
  cargar: (token?: string) => Promise<CalificacionApelable[]>;
  apelar: (
    ratingId: string,
    reason: string,
    token?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  token?: string;
}) {
  const router = useRouter();
  const [calificaciones, setCalificaciones] = useState<
    CalificacionApelable[] | null
  >(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  const releer = useCallback(async () => {
    try {
      setCalificaciones(await cargar(token));
    } catch (error) {
      // Sin lista no se dibuja nada. El resto del portal sigue funcionando.
      console.error(error);
    }
  }, [cargar, token]);

  useEffect(() => {
    void releer();
  }, [releer]);

  function enviar(ratingId: string) {
    const texto = motivo.trim();
    if (texto.length < MINIMO_MOTIVO) {
      toast.error("Explica un poco mas: quien lo revise solo tiene esto.");
      return;
    }
    startTransition(async () => {
      const resultado = await apelar(ratingId, texto, token);
      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Apelacion enviada. La va a revisar un jefe.");
      setAbierta(null);
      setMotivo("");
      await releer();
      router.refresh();
    });
  }

  if (!calificaciones || calificaciones.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        <Scale size={16} className="mt-0.5 shrink-0 text-[#C5A55A]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Calificaciones que puedes apelar
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Si alguna no refleja lo que pasó, explícalo y un jefe la revisa. Una
            calificación baja cuenta para tu reputación.
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {calificaciones.map((calificacion) => (
              <li
                key={calificacion.id}
                className="rounded-lg border border-zinc-800 bg-black/40 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="flex items-center gap-0.5"
                    aria-label={`${calificacion.stars} de 5 estrellas`}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={13}
                        aria-hidden
                        className={
                          n <= calificacion.stars
                            ? "fill-[#C5A55A] text-[#C5A55A]"
                            : "text-zinc-700"
                        }
                      />
                    ))}
                  </span>
                  <span className="text-[11px] tabular-nums text-zinc-500">
                    {new Date(calificacion.createdAt).toLocaleDateString(
                      APP_LOCALE,
                      { timeZone: APP_TIME_ZONE, day: "numeric", month: "short" },
                    )}
                  </span>
                </div>

                {calificacion.comment && (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    {calificacion.comment}
                  </p>
                )}

                {abierta === calificacion.id ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <textarea
                      value={motivo}
                      onChange={(evento) => setMotivo(evento.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Qué pasó realmente"
                      className="w-full resize-none rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => {
                          setAbierta(null);
                          setMotivo("");
                        }}
                        className="rounded-lg border border-zinc-800 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => enviar(calificacion.id)}
                        className="rounded-lg border border-[#C5A55A]/50 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[#E8D5A3] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
                      >
                        {pendiente ? "Enviando" : "Apelar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAbierta(calificacion.id);
                      setMotivo("");
                    }}
                    className="mt-3 w-full rounded-lg border border-zinc-800 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A]"
                  >
                    Apelar esta
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
