import Link from "next/link";
import { CalendarRange, CreditCard, UserMinus, Wallet } from "lucide-react";

import {
  Down,
  KpiCard,
  Panel,
  RecordLink,
  StatusBadge,
  type BadgeTone,
} from "@/components/erp/primitives";
import type { GodEyeOverview } from "@/lib/actions/god-eye";
import type { OffDutyPerson } from "@/lib/actions/work-shift";
import type { BloqueTablero } from "@/components/erp/tablero-personalizable";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

/**
 * Centro de Mando: capa de resumen del panel.
 *
 * Responde "como va la operacion" con las metricas que el backend ya calcula
 * en /admin/god-eye/overview. Se apoya en las mismas cifras que el tablero
 * detallado que aparece debajo, de modo que ambos no pueden discrepar.
 *
 * La pantalla esta repartida en zonas con una pregunta cada una: que tengo que
 * hacer (la bandeja, que se construye en `asuntos-pendientes.ts`), que esta
 * pasando ahora, cuanto dinero hay, y el analisis a fondo detras de una puerta.
 * Estos bloques son los de las dos zonas centrales.
 */

const ESTADO_TONE: Record<string, BadgeTone> = {
  en_curso: "green",
  agendado: "gold",
  pendiente: "zinc",
  transporte_pendiente: "red",
  finalizado: "blue",
  cancelado: "red",
};

/**
 * Dias corridos de la semana en curso, contando el de hoy.
 *
 * Se usa para el promedio diario del facturado semanal: dividir siempre entre
 * siete haria parecer que un lunes por la tarde la operacion va siete veces
 * peor de lo que va. La semana empieza en lunes, igual que el corte.
 */
function diasTranscurridosDeLaSemana() {
  const nombre = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(new Date());

  const posicion: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return posicion[nombre] ?? 1;
}

function hora(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

/**
 * Una celda de la tira de contadores.
 *
 * Deliberadamente mas pequeña que una `KpiCard`: son cifras de vigilancia, no
 * de negocio, y cuatro tarjetas grandes ahi arriba desplazaban el dinero por
 * debajo del pliegue.
 */
function Contador({
  etiqueta,
  valor,
  sufijo,
  pie,
  tono = "text-white",
}: {
  etiqueta: string;
  valor: string | number;
  /** Se pinta apagado detras del valor: el "/ 5" de "3 / 5". */
  sufijo?: string;
  pie?: string;
  tono?: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-black/40 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
        {etiqueta}
      </p>
      <p
        className={`font-heading text-[22px] font-semibold leading-none tabular-nums ${tono}`}
      >
        {valor}
        {sufijo ? (
          <span className="text-[13px] font-medium text-zinc-600">
            {sufijo}
          </span>
        ) : null}
      </p>
      {pie ? <p className="text-[11px] text-zinc-500">{pie}</p> : null}
    </div>
  );
}

/**
 * Bloques del Centro de Mando.
 *
 * Devuelve las piezas sueltas en vez de una pantalla ya montada porque el
 * administrador reordena y oculta cada una por su cuenta; el ensamblado lo hace
 * `TableroPersonalizable` desde la pagina.
 */
export function bloquesDeCentroDeMando({
  overview,
  offDuty = [],
}: {
  overview: GodEyeOverview;
  /** Personal que cerro su jornada, de cualquier rol. */
  offDuty?: OffDutyPerson[];
}): {
  contadores: BloqueTablero[];
  ahora: BloqueTablero[];
  dinero: BloqueTablero[];
} {
  const { metrics, activeServices } = overview;

  const enCurso = activeServices.filter((s) => s.estado === "en_curso");
  const agendados = activeServices.filter((s) => s.estado === "agendado");

  /*
   * La lista lleva a la pantalla del rol de quien cerro su jornada mas
   * reciente. Antes apuntaba siempre a choferes, asi que al cerrar una modelo
   * su dia el admin acababa en una lista donde ella no aparece.
   */
  const PAGINA_POR_ROL: Record<OffDutyPerson["rol"], string> = {
    empleada: "/admin/modelos",
    chofer: "/admin/choferes",
    jefe: "/admin/jefes",
    // No hay pantalla propia de administradores: /admin/jefes es donde se ve
    // al personal de coordinacion.
    admin: "/admin/jefes",
  };

  /*
   * La hora del cambio es el dato que el admin necesita: sin ella solo sabe
   * que alguien cerro, no si fue hace cinco minutos o a media manana.
   */
  const horaDeCierre = (persona: OffDutyPerson) => {
    if (!persona.jornadaActualizadaAt) return null;
    return new Date(persona.jornadaActualizadaAt).toLocaleString(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const contadores: BloqueTablero[] = [
    {
      id: "contadores-operacion",
      titulo: "Contadores de la operacion",
      anchoCompleto: true,
      contenido: (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800/60 sm:grid-cols-4">
          <Contador
            etiqueta="En curso"
            valor={enCurso.length}
            pie={`de ${activeServices.length} ${
              activeServices.length === 1 ? "activo" : "activos"
            }`}
            tono={enCurso.length > 0 ? "text-green-400" : "text-white"}
          />
          <Contador etiqueta="Agendados" valor={agendados.length} />
          <Contador
            etiqueta="Modelos libres"
            valor={metrics.employeesAvailable}
            sufijo={` / ${metrics.employeesTotal}`}
            pie={`${metrics.employeesBusy} en servicio`}
            tono={
              metrics.employeesAvailable > 0
                ? "text-green-400"
                : "text-amber-400"
            }
          />
          <Contador
            etiqueta="Choferes"
            valor={metrics.driversActive}
            sufijo={` / ${metrics.driversTotal}`}
            pie={`${metrics.pendingOffers} ${
              metrics.pendingOffers === 1
                ? "oferta sin aceptar"
                : "ofertas sin aceptar"
            }`}
            tono={metrics.driversActive > 0 ? "text-white" : "text-amber-400"}
          />
        </div>
      ),
    },
  ];

  const ahora: BloqueTablero[] = [
    {
      id: "operacion-en-vivo",
      titulo: "Operacion en vivo",
      contenido: (
        <Panel
          title="Operacion en vivo"
          subtitle={`${activeServices.length} ${
            activeServices.length === 1
              ? "servicio en curso o agendado"
              : "servicios en curso o agendados"
          }`}
          flush
          action={
            enCurso.length > 0 ? (
              <StatusBadge tone="green" dot>
                {enCurso.length} en curso
              </StatusBadge>
            ) : (
              <StatusBadge tone="zinc">Sin servicios activos</StatusBadge>
            )
          }
        >
          {activeServices.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">
              No hay servicios activos en este momento.
            </p>
          ) : (
            <div className="flex flex-col">
              {activeServices.slice(0, 8).map((servicio) => {
                const inicio = hora(servicio.horaInicioServicio);

                return (
                  <div
                    key={servicio.id}
                    className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <RecordLink
                        href={`/admin/services`}
                        className="w-fit text-[13px]"
                      >
                        {servicio.empleadaNombre}
                      </RecordLink>

                      <span className="truncate text-[11px] text-zinc-500">
                        {servicio.clienteNombre}
                        {inicio ? ` - desde las ${inicio}` : ""}
                        {servicio.serviceType === "grupal" ? " - grupal" : ""}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[13px] tabular-nums text-zinc-300">
                        {formatCurrency(servicio.totalFinal)}
                      </span>

                      <StatusBadge
                        tone={ESTADO_TONE[servicio.estado] ?? "zinc"}
                        dot={servicio.estado === "en_curso"}
                      >
                        {servicio.estado.replaceAll("_", " ")}
                      </StatusBadge>
                    </div>
                  </div>
                );
              })}

              {activeServices.length > 8 ? (
                <Link
                  href="/admin/services"
                  className="border-t border-zinc-800 px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
                >
                  Ver los {activeServices.length} servicios
                </Link>
              ) : null}
            </div>
          )}
        </Panel>
      ),
    },
    // Solo aparece cuando alguien cerro su jornada: un panel vacio ocupa el
    // mismo espacio que uno lleno y no dice nada.
    ...(offDuty.length > 0
      ? [
          {
            id: "fuera-de-jornada",
            titulo: "Personal fuera de jornada",
            contenido: (
              <Panel
                title="Personal fuera de jornada"
                subtitle="No recibe servicios hasta que vuelva a abrirla"
                flush
                action={
                  <StatusBadge tone="amber">{offDuty.length}</StatusBadge>
                }
              >
                <div className="flex flex-col">
                  {offDuty.slice(0, 6).map((persona) => (
                    <Link
                      key={persona.id}
                      href={PAGINA_POR_ROL[persona.rol] ?? "/admin/jefes"}
                      className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] transition-colors last:border-b-0 hover:bg-zinc-900/40"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <UserMinus className="h-[15px] w-[15px] shrink-0 text-amber-400" />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[13px] font-semibold text-white">
                            {persona.nombre}
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            {persona.rol}
                          </span>
                        </div>
                      </div>

                      <span className="shrink-0 text-[11px] text-zinc-500">
                        {horaDeCierre(persona) ?? "Sin hora registrada"}
                      </span>
                    </Link>
                  ))}

                  {offDuty.length > 6 ? (
                    <p className="border-t border-zinc-800 px-5 py-3 text-center text-[11px] text-zinc-500">
                      {`y ${offDuty.length - 6} personas mas`}
                    </p>
                  ) : null}
                </div>
              </Panel>
            ),
          } satisfies BloqueTablero,
        ]
      : []),
  ];

  const dinero: BloqueTablero[] = [
    {
      id: "kpi-facturado-hoy",
      titulo: "Facturado hoy",
      contenido: (
        <KpiCard
          label="Facturado hoy"
          icon={CreditCard}
          value={formatCurrency(metrics.revenueToday)}
          footnote={`${metrics.activeServices} ${
            metrics.activeServices === 1
              ? "servicio activo"
              : "servicios activos"
          }`}
        />
      ),
    },
    {
      /*
        La semana corre de lunes a domingo en hora de Ciudad de Mexico, igual
        que el corte: el backend la calcula con date_trunc sobre esa zona, no
        sobre UTC, para que un servicio de la noche del domingo no se cuente en
        la semana siguiente.
      */
      id: "kpi-facturado-semana",
      titulo: "Facturado en la semana",
      contenido: (
        <KpiCard
          label="Facturado en la semana"
          icon={CalendarRange}
          value={formatCurrency(metrics.revenueWeek)}
          footnote={
            metrics.revenueWeek > 0
              ? `Promedio diario: ${formatCurrency(
                  metrics.revenueWeek / diasTranscurridosDeLaSemana(),
                )}`
              : "Sin facturacion en la semana"
          }
        />
      ),
    },
    {
      id: "kpi-efectivo-calle",
      titulo: "Efectivo en calle",
      contenido: (
        <KpiCard
          label="Efectivo en calle"
          icon={Wallet}
          value={formatCurrency(metrics.cashInStreet)}
          footnote={
            metrics.cashInStreet > 0 ? (
              <Down>Pendiente de conciliar</Down>
            ) : (
              "Todo conciliado"
            )
          }
        />
      ),
    },
  ];

  return { contadores, ahora, dinero };
}
