"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { ReporteSobreMi } from "@/lib/types";

/**
 * Contar su version de un reporte.
 *
 * Un reporte de conducta se resolvia con un solo relato delante, el de quien lo
 * levanto. La persona señalada se enteraba --si acaso-- cuando ya tenia una
 * sancion encima, y lo unico que podia apelar era una calificacion, nunca el
 * reporte en si. Aqui escribe lo suyo, y quien decide lee las dos partes.
 *
 * Sirve igual para una modelo y para un chofer: las dos pueden ser reportadas y
 * las dos tienen derecho a responder. Por eso recibe las funciones de su portal
 * en vez de llamar a unas concretas.
 *
 * No se dibuja si no hay nada abierto, que es lo normal: no tiene sentido
 * recordarle todos los dias que existen los reportes.
 */

/** El minimo que exige el backend. Se avisa antes de mandar, no despues. */
const MINIMO_VERSION = 15;

const MOTIVO_LABEL: Record<string, string> = {
  trato_inadecuado: "Trato inadecuado",
  demora_impuntualidad: "Demora o impuntualidad",
  incumplimiento: "Incumplimiento",
  cobro: "Cobro",
  seguridad: "Seguridad",
  otro: "Otro",
};

export default function MiVersionDelReporte({
  cargar,
  responder,
  token,
}: {
  cargar: (token?: string) => Promise<ReporteSobreMi[]>;
  responder: (
    reportId: string,
    statement: string,
    token?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  token?: string;
}) {
  const router = useRouter();
  const [reportes, setReportes] = useState<ReporteSobreMi[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pendiente, startTransition] = useTransition();

  const releer = useCallback(async () => {
    try {
      setReportes(await cargar(token));
    } catch (error) {
      // Sin lista no se dibuja nada. El resto del portal sigue funcionando.
      console.error("No se pudieron leer los reportes propios:", error);
      setReportes([]);
    }
  }, [cargar, token]);

  useEffect(() => {
    void releer();
  }, [releer]);

  /*
   * Solo los que siguen abiertos: un reporte cerrado ya no admite version, y
   * enseñarlo con un formulario que el backend va a rechazar es peor que no
   * enseñarlo.
   */
  const pendientes = (reportes ?? []).filter(
    (reporte) => reporte.status !== "cerrado",
  );

  if (pendientes.length === 0) return null;

  function enviar(reporte: ReporteSobreMi) {
    const version = texto.trim();
    if (version.length < MINIMO_VERSION) {
      toast.error(`Escribe al menos ${MINIMO_VERSION} caracteres`);
      return;
    }

    startTransition(async () => {
      const resultado = await responder(reporte.id, version, token);
      if (!resultado.success) {
        toast.error(resultado.error ?? "No se pudo enviar tu versión");
        return;
      }
      toast.success("Tu versión quedó registrada");
      setAbierto(null);
      setTexto("");
      await releer();
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.06] p-4">
      <header className="flex items-center gap-2">
        <MessageSquareWarning size={17} className="shrink-0 text-amber-300" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-200">
          Reportes sobre ti
        </h3>
      </header>

      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
        Antes de que se resuelvan puedes contar lo que pasó desde tu lado. Lo lee
        quien toma la decisión.
      </p>

      <div className="mt-3 space-y-2.5">
        {pendientes.map((reporte) => {
          const editando = abierto === reporte.id;
          return (
            <article
              key={reporte.id}
              className="rounded-xl border border-white/10 bg-black/40 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold text-white">
                  {MOTIVO_LABEL[reporte.category] ??
                    reporte.category.replaceAll("_", " ")}
                </p>
                <span className="shrink-0 text-[10px] text-gray-600">
                  {formatFecha(reporte.createdAt)}
                </span>
              </div>

              <p className="mt-1.5 text-[12px] leading-relaxed text-gray-400">
                {reporte.description}
              </p>

              {reporte.subjectStatement && !editando ? (
                <div className="mt-2.5 rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">
                    Tu versión
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-gray-300">
                    {reporte.subjectStatement}
                  </p>
                </div>
              ) : null}

              {editando ? (
                <div className="mt-2.5 space-y-2">
                  <textarea
                    value={texto}
                    onChange={(evento) => setTexto(evento.target.value)}
                    rows={4}
                    maxLength={2000}
                    autoFocus
                    placeholder="Cuenta lo que pasó desde tu lado"
                    className="w-full resize-none rounded-lg border border-amber-500/40 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-amber-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        setAbierto(null);
                        setTexto("");
                      }}
                      className="rounded-lg border border-white/10 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-white disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={pendiente}
                      aria-busy={pendiente}
                      onClick={() => enviar(reporte)}
                      className="rounded-lg bg-amber-400 py-2.5 text-[11px] font-bold uppercase tracking-wider text-black transition-colors hover:bg-amber-300 disabled:opacity-50"
                    >
                      {pendiente ? "Enviando" : "Enviar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(reporte.id);
                    setTexto(reporte.subjectStatement ?? "");
                  }}
                  className="mt-2.5 w-full rounded-lg border border-amber-500/40 py-2.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-500/10"
                >
                  {reporte.subjectStatement
                    ? "Corregir mi versión"
                    : "Dar mi versión"}
                </button>
              )}
            </article>
          );
        })}
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
