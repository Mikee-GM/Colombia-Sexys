"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Flag, Scale, Star } from "lucide-react";

import {
  codigoServicio,
  ErpPageHeader,
  Panel,
  StatusBadge,
  type BadgeTone,
} from "@/components/erp/primitives";
import PromptDialog from "@/components/ui/PromptDialog";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import {
  closeConductReport,
  resolveAppeal,
  type CasoDelServicio,
  type ConductReport,
  type PersonType,
  type RatingAppeal,
  type RatingDirection,
} from "@/lib/actions/discipline";

/**
 * El caso de un servicio.
 *
 * Un incidente casi nunca deja un solo rastro: el cliente reporta, la modelo
 * reporta lo contrario, el chofer añade lo suyo y alguien apela su
 * calificacion. Cada pieza se resolvia por su cuenta desde una lista distinta,
 * sin ver las otras, asi que la decision se tomaba con la mitad de la historia.
 *
 * Aqui salen todas en una cuadricula de tarjetas de la misma forma y la misma
 * altura, para leerlas en paralelo, y cada una lleva encima los botones con los
 * que se cierra.
 */

const PERSONA_LABEL: Record<PersonType, string> = {
  client: "Cliente",
  employee: "Empleada",
  driver: "Chofer",
  boss: "Jefe de zona",
};

const MOTIVO_LABEL: Record<string, string> = {
  trato_inadecuado: "Trato inadecuado",
  demora_impuntualidad: "Demora o impuntualidad",
  incumplimiento: "Incumplimiento",
  cobro: "Cobro",
  seguridad: "Seguridad",
  otro: "Otro",
};

const DIRECCION_LABEL: Record<RatingDirection, string> = {
  client_to_employee: "Cliente a empleada",
  employee_to_client: "Empleada a cliente",
  driver_to_employee: "Chofer a empleada",
  employee_to_driver: "Empleada a chofer",
};

const PRIORIDAD_TONE: Record<ConductReport["priority"], BadgeTone> = {
  urgente: "red",
  alta: "amber",
  normal: "zinc",
};

const ESTADO_TONE: Record<ConductReport["status"], BadgeTone> = {
  nuevo: "amber",
  en_revision: "blue",
  cerrado: "zinc",
};

const ESTADO_LABEL: Record<ConductReport["status"], string> = {
  nuevo: "Nuevo",
  en_revision: "En revision",
  cerrado: "Cerrado",
};

type Filtro = "todos" | "abiertos" | "reportes" | "calificaciones";

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "abiertos", label: "Sin resolver" },
  { id: "reportes", label: "Reportes" },
  { id: "calificaciones", label: "Calificaciones" },
];

function fechaHora(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** El boton comun a todas las tarjetas; solo cambia el enfasis. */
function botonClase(principal = false) {
  return principal
    ? "rounded-xl border border-[#C5A55A] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-40"
    : "rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-400 transition-colors hover:text-white disabled:opacity-40";
}

/**
 * Quien reporta y a quien, de un vistazo.
 *
 * La flecha entre los dos nombres dice la direccion sin tener que leer una
 * etiqueta larga; la etiqueta queda debajo para el caso ambiguo.
 */
function Entre({ de, a, pie }: { de: string; a: string; pie: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-zinc-500">
      <span className="font-semibold text-zinc-300">{de}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-zinc-600" />
      <span className="font-semibold text-zinc-300">{a}</span>
      <span>{`- ${pie}`}</span>
    </div>
  );
}

export default function CasoDelServicioPanel({
  caso,
}: {
  caso: CasoDelServicio;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [pending, startTransition] = useTransition();
  const [cierre, setCierre] = useState<{
    report: ConductReport;
    outcome: "confirmado" | "no_sustentado";
  } | null>(null);

  const { servicio, reports, ratings } = caso;

  /*
   * Los nombres de quienes intervienen. El caso trae los ids en cada fila y los
   * nombres una sola vez, en la cabecera: sin este mapa la cuadricula enseñaria
   * UUIDs.
   */
  const nombre = useMemo(() => {
    const mapa = new Map<string, string>();
    if (servicio.empleadaId) {
      mapa.set(servicio.empleadaId, servicio.empleadaNombre ?? "Empleada");
    }
    if (servicio.clienteId) {
      mapa.set(servicio.clienteId, servicio.clienteNombre ?? "Cliente");
    }
    for (const chofer of servicio.choferes ?? []) {
      mapa.set(chofer.id, chofer.nombre);
    }
    return (tipo: PersonType, id: string) =>
      mapa.get(id) ?? PERSONA_LABEL[tipo];
  }, [servicio]);

  const abiertos =
    reports.filter((report) => report.status !== "cerrado").length +
    ratings.filter((rating) => rating.appealStatus === "pending").length;

  const reportesVisibles =
    filtro === "calificaciones"
      ? []
      : filtro === "abiertos"
        ? reports.filter((report) => report.status !== "cerrado")
        : reports;

  const calificacionesVisibles =
    filtro === "reportes"
      ? []
      : filtro === "abiertos"
        ? ratings.filter((rating) => rating.appealStatus === "pending")
        : ratings;

  const total = reports.length + ratings.length;
  const visibles = reportesVisibles.length + calificacionesVisibles.length;

  const cerrarReporte = (resolution: string) => {
    if (!cierre) return;
    const { report, outcome } = cierre;
    startTransition(async () => {
      try {
        await closeConductReport(report.id, outcome, resolution);
        setCierre(null);
        toast.success(
          outcome === "confirmado"
            ? "Reporte confirmado"
            : "Reporte cerrado como no sustentado",
        );
        router.refresh();
      } catch {
        toast.error("No se pudo cerrar el reporte");
      }
    });
  };

  const decidirApelacion = (
    rating: RatingAppeal,
    decision: "upheld" | "overturned",
  ) => {
    startTransition(async () => {
      try {
        await resolveAppeal(rating.id, decision);
        toast.success(
          decision === "overturned"
            ? "Calificacion anulada"
            : "Calificacion confirmada",
        );
        router.refresh();
      } catch {
        toast.error("No se pudo resolver la apelacion");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/dashboard"
        className="flex w-fit items-center gap-2 text-[12px] text-zinc-500 transition-colors hover:text-[#E8D5A3]"
      >
        <ArrowLeft className="h-3.5 w-3.5 text-[#C5A55A]" />
        <span className="font-semibold text-[#C5A55A]">Pendiente de ti</span>
        <span>/ Caso del servicio</span>
      </Link>

      <ErpPageHeader
        title={`Caso del servicio ${codigoServicio(servicio.id)}`}
        description={
          total === 1
            ? "Lo unico que se puso sobre este servicio"
            : `Los ${total} reportes y calificaciones de este servicio, juntos para poder compararlos`
        }
        actions={
          <Link
            href="/admin/services"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white"
          >
            Ver el servicio
          </Link>
        }
      />

      {/* Contexto: de que noche estamos hablando y quien estuvo */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-black/40">
        <div className="grid grid-cols-2 gap-px bg-zinc-800/60 sm:grid-cols-4">
          <div className="bg-[#050505] px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              Servicio
            </p>
            <p className="mt-1 text-[14px] font-semibold text-white">
              {fechaHora(servicio.horaInicioServicio ?? servicio.createdAt) ??
                "Sin fecha"}
              {servicio.duracionPactadaHoras
                ? ` - ${servicio.duracionPactadaHoras} h`
                : ""}
            </p>
          </div>
          <div className="bg-[#050505] px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              Importe
            </p>
            <p className="mt-1 text-[14px] font-semibold tabular-nums text-white">
              {formatCurrency(Number(servicio.totalFinal ?? 0))}
            </p>
          </div>
          <div className="bg-[#050505] px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              Estado
            </p>
            <p className="mt-1">
              <StatusBadge tone="zinc">
                {servicio.estado.replaceAll("_", " ")}
              </StatusBadge>
            </p>
          </div>
          <div className="bg-[#050505] px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
              Jefe que autorizo
            </p>
            <p className="mt-1 truncate text-[14px] font-semibold text-white">
              {servicio.jefeEmail ?? "Sin asignar"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            Involucrados
          </span>

          {[
            { nombre: servicio.empleadaNombre, rol: "Empleada" },
            { nombre: servicio.clienteNombre, rol: "Cliente" },
            ...(servicio.choferes ?? []).map((chofer) => ({
              nombre: chofer.nombre,
              rol: "Chofer",
            })),
          ]
            .filter((persona) => persona.nombre)
            .map((persona) => (
              <span
                key={`${persona.rol}-${persona.nombre}`}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5"
              >
                <span className="text-[12.5px] font-semibold text-white">
                  {persona.nombre}
                </span>
                <span className="text-[11px] text-zinc-600">{persona.rol}</span>
              </span>
            ))}
        </div>
      </div>

      {/* Filtro y recuento */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFiltro(item.id)}
              className={`rounded-xl border px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors ${
                filtro === item.id
                  ? "border-[#C5A55A] bg-[#C5A55A]/10 text-[#E8D5A3]"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <span className="text-[12px] text-zinc-500">
          {`${total} en total`}
          {abiertos > 0 ? (
            <>
              {" - "}
              <span className="font-semibold text-red-400">
                {abiertos === 1 ? "1 sin resolver" : `${abiertos} sin resolver`}
              </span>
            </>
          ) : null}
        </span>
      </div>

      {visibles === 0 ? (
        <Panel>
          <p className="py-8 text-center text-sm text-zinc-500">
            {total === 0
              ? "Este servicio no tiene reportes ni calificaciones."
              : "Nada que mostrar con este filtro."}
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {reportesVisibles.map((report) => {
            const cerrado = report.status === "cerrado";

            return (
              <article
                key={report.id}
                className={`flex flex-col gap-3 rounded-xl border bg-zinc-950 p-4 ${
                  report.priority === "urgente" && !cerrado
                    ? "border-red-400/35"
                    : "border-zinc-800"
                } ${cerrado ? "opacity-75" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[11px] text-zinc-400">
                    <Flag className="h-3.5 w-3.5 text-[#8B7635]" />
                    Reporte de conducta
                  </span>
                  <StatusBadge tone={PRIORIDAD_TONE[report.priority]}>
                    {report.priority}
                  </StatusBadge>
                </div>

                <Entre
                  de={nombre(report.reporterType, report.reporterId)}
                  a={nombre(report.subjectType, report.subjectId)}
                  pie={DIRECCION_LABEL[report.direction]}
                />

                <h3 className="font-heading text-[16px] font-semibold text-white">
                  {MOTIVO_LABEL[report.category] ??
                    report.category.replaceAll("_", " ")}
                </h3>

                <p className="flex-1 text-[12.5px] leading-relaxed text-zinc-400">
                  {report.description}
                </p>

                <div className="flex flex-col gap-2 border-t border-zinc-800/60 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={ESTADO_TONE[report.status]}>
                        {ESTADO_LABEL[report.status]}
                      </StatusBadge>
                      {report.outcome ? (
                        <StatusBadge
                          tone={
                            report.outcome === "confirmado" ? "green" : "zinc"
                          }
                        >
                          {report.outcome === "confirmado"
                            ? "Confirmado"
                            : "No sustentado"}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-600">
                      {fechaHora(report.createdAt)}
                    </span>
                  </div>

                  {report.resolution ? (
                    <p className="text-[11.5px] leading-relaxed text-zinc-600">
                      {`Resolucion: ${report.resolution}`}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {cerrado ? null : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setCierre({ report, outcome: "confirmado" })
                        }
                        disabled={pending}
                        aria-busy={pending}
                        className={botonClase(true)}
                      >
                        Confirmar
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setCierre({ report, outcome: "no_sustentado" })
                        }
                        disabled={pending}
                        aria-busy={pending}
                        className={botonClase()}
                      >
                        Desestimar
                      </button>
                    </>
                  )}

                  {/*
                    La sancion no se crea aqui: vive en el panel disciplinario,
                    con sus tramos, la multa y el baneo. El enlace abre el
                    expediente de la persona ya seleccionado.
                  */}
                  <Link
                    href={`/admin/reports?expediente=${report.subjectType}:${report.subjectId}`}
                    className={botonClase()}
                  >
                    {report.outcome === "confirmado"
                      ? "Sancionar"
                      : "Expediente"}
                  </Link>
                </div>
              </article>
            );
          })}

          {calificacionesVisibles.map((rating) => {
            const apelacionAbierta = rating.appealStatus === "pending";
            /*
             * Hubo apelacion, este o no resuelta. Se mira el motivo y no solo
             * el estado porque hay filas antiguas con un estado que ya no se
             * usa, y sin esto una calificacion apelada y resuelta se anunciaba
             * como "sin apelacion" y justo debajo enseñaba el motivo.
             */
            const huboApelacion =
              apelacionAbierta ||
              rating.appealStatus === "upheld" ||
              rating.appealStatus === "overturned" ||
              Boolean(rating.appealReason);

            return (
              <article
                key={rating.id}
                className={`flex flex-col gap-3 rounded-xl border bg-zinc-950 p-4 ${
                  apelacionAbierta
                    ? "border-[#C5A55A]/35"
                    : "border-zinc-800 opacity-75"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[11px] text-zinc-400">
                    {huboApelacion ? (
                      <Scale className="h-3.5 w-3.5 text-[#8B7635]" />
                    ) : (
                      <Star className="h-3.5 w-3.5 text-[#8B7635]" />
                    )}
                    {huboApelacion
                      ? "Apelacion de calificacion"
                      : "Calificacion"}
                  </span>
                  <StatusBadge tone={rating.stars <= 2 ? "red" : "gold"}>
                    {`${rating.stars} de 5`}
                  </StatusBadge>
                </div>

                <div className="text-[11.5px] text-zinc-500">
                  {DIRECCION_LABEL[rating.direction]}
                </div>

                <h3 className="font-heading text-[16px] font-semibold text-white">
                  {apelacionAbierta
                    ? "Pide anular la calificacion"
                    : huboApelacion
                      ? "Apelacion ya resuelta"
                      : "Sin apelacion"}
                </h3>

                <div className="flex flex-1 flex-col gap-2.5">
                  {rating.comment ? (
                    <p className="border-l-2 border-zinc-800 pl-2.5 text-[12.5px] leading-relaxed text-zinc-500">
                      {`"${rating.comment}"`}
                    </p>
                  ) : (
                    <p className="text-[12.5px] text-zinc-600">
                      Sin comentario.
                    </p>
                  )}

                  {rating.appealReason ? (
                    <p className="text-[12.5px] leading-relaxed text-zinc-400">
                      {`Motivo: ${rating.appealReason}`}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-3">
                  <StatusBadge tone={apelacionAbierta ? "gold" : "zinc"}>
                    {apelacionAbierta
                      ? "Sin resolver"
                      : rating.appealStatus === "overturned"
                        ? "Calificacion anulada"
                        : rating.appealStatus === "upheld"
                          ? "Calificacion confirmada"
                          : huboApelacion
                            ? "Resuelta"
                            : "Sin apelar"}
                  </StatusBadge>
                  <span className="shrink-0 text-[11px] text-zinc-600">
                    {fechaHora(rating.createdAt)}
                  </span>
                </div>

                {apelacionAbierta ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => decidirApelacion(rating, "overturned")}
                      disabled={pending}
                      aria-busy={pending}
                      className={botonClase(true)}
                    >
                      Anular calificacion
                    </button>

                    <button
                      type="button"
                      onClick={() => decidirApelacion(rating, "upheld")}
                      disabled={pending}
                      aria-busy={pending}
                      className={botonClase()}
                    >
                      Confirmar calificacion
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <PromptDialog
        isOpen={!!cierre}
        title={
          cierre?.outcome === "confirmado"
            ? "Confirmar reporte de conducta"
            : "Desestimar reporte por falta de sustento"
        }
        description={`Escribe la resolucion oficial para ${
          cierre?.outcome === "confirmado"
            ? "dar por veridico este reporte y proceder conforme a reglamento"
            : "descartar este reporte por falta de sustento"
        }.`}
        placeholder="Ej: Los dos reportes del mismo servicio coinciden en la hora, y el registro del bot lo confirma..."
        labelConfirm={
          cierre?.outcome === "confirmado"
            ? "Confirmar reporte"
            : "Cerrar como no sustentado"
        }
        variant={cierre?.outcome === "confirmado" ? "gold" : "blue"}
        minLength={3}
        maxLength={2000}
        isLoading={pending}
        onConfirm={cerrarReporte}
        onCancel={() => setCierre(null)}
      />
    </div>
  );
}
