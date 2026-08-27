import Link from "next/link";

import { Panel, StatusBadge } from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { Service } from "@/lib/types";
import type { WeeklySettlementSummary } from "@/components/liquidations/types";
import type { BloqueTablero } from "@/components/erp/tablero-personalizable";

/**
 * La semana del Centro de Mando: ingreso por dia, de que se compone y como va
 * el cierre.
 *
 * El resumen de god-eye responde por el dia en curso, no por la semana, asi
 * que estos tres bloques se derivan de lo que ya devuelven /services y
 * /liquidations/weekly-summary en lugar de pedir un endpoint nuevo.
 */

const num = (value: unknown) => Number(value ?? 0) || 0;

/** Lunes a domingo, el mismo orden que usa el resto del ERP. */
const DIAS = [
  { dia: 1, corto: "Lun" },
  { dia: 2, corto: "Mar" },
  { dia: 3, corto: "Mie" },
  { dia: 4, corto: "Jue" },
  { dia: 5, corto: "Vie" },
  { dia: 6, corto: "Sab" },
  { dia: 0, corto: "Dom" },
] as const;

/** Dia de la semana de una fecha, leido en la zona horaria de la operacion y no en UTC. */
function diaSemanaLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const nombre = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(date);

  const mapa: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return mapa[nombre] ?? null;
}

function fechaLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Suma un importe al acumulado de una modelo, creando la fila si hace falta. */
function acumularModelo(
  destino: Map<string, { nombre: string; total: number }>,
  employeeId: string | undefined,
  nombreArtistico: string | undefined,
  importe: number,
) {
  if (!employeeId || importe <= 0) return;

  const fila = destino.get(employeeId);
  if (fila) {
    fila.total += importe;
    return;
  }

  destino.set(employeeId, {
    nombre: nombreArtistico ?? "Sin asignar",
    total: importe,
  });
}

/** Cifra compacta para las barras: 4.820k en lugar de 4.820.000. */
function compacto(valor: number) {
  if (valor >= 1_000_000) {
    return `${(valor / 1_000_000).toLocaleString(APP_LOCALE, {
      maximumFractionDigits: 1,
    })}M`;
  }
  if (valor >= 1_000) return `${Math.round(valor / 1_000)}k`;
  return String(Math.round(valor));
}

/**
 * Bloques de la semana en curso.
 *
 * Igual que el Centro de Mando, devuelve piezas sueltas en vez de una rejilla
 * montada: cada panel se reordena y se oculta por separado desde el tablero.
 */
export function bloquesDeSemanaEnCurso({
  services,
  summary,
  startDate,
  endDate,
}: {
  services: Service[];
  summary: WeeklySettlementSummary[];
  startDate: string;
  endDate: string;
}): BloqueTablero[] {
  /*
   * Un servicio cuenta en el dia en que se presto y no en el que se creo, y
   * los cancelados no facturan. La fecha se resuelve en la zona horaria de la operacion porque un
   * servicio de las 22:00 cae al dia siguiente en UTC.
   */
  const facturables = services.filter((service) => {
    if (service.estado === "cancelado") return false;
    const referencia =
      service.horaInicioServicio ?? service.fechaProgramada ?? service.createdAt;
    const dia = fechaLocal(referencia);
    return dia !== null && dia >= startDate && dia <= endDate;
  });

  const porDia = DIAS.map(({ dia, corto }) => {
    const total = facturables
      .filter((service) => {
        const referencia =
          service.horaInicioServicio ??
          service.fechaProgramada ??
          service.createdAt;
        return diaSemanaLocal(referencia) === dia;
      })
      .reduce((suma, service) => suma + num(service.totalFinal), 0);

    return { corto, total };
  });

  const mayor = Math.max(...porDia.map((item) => item.total), 0);
  const ingresoSemana = porDia.reduce((suma, item) => suma + item.total, 0);

  /*
   * Cuanto genero cada modelo en la semana.
   *
   * Un servicio grupal no se le puede acreditar entero a la responsable: se
   * reparte por el subtotal confirmado de cada participante, que es la misma
   * cifra con la que se liquida. Los individuales van completos a su empleada.
   */
  const porModelo = new Map<string, { nombre: string; total: number }>();

  for (const service of facturables) {
    const participantes = (service.participantes ?? []).filter(
      (participante) => participante.status !== "cancelada",
    );

    if (service.serviceType === "grupal" && participantes.length > 0) {
      for (const participante of participantes) {
        acumularModelo(
          porModelo,
          participante.employeeId,
          participante.employee?.nombreArtistico,
          num(participante.confirmedSubtotal),
        );
      }
      continue;
    }

    acumularModelo(
      porModelo,
      service.empleadaId,
      service.empleada?.nombreArtistico,
      num(service.totalFinal),
    );
  }

  const ranking = [...porModelo.values()]
    .filter((fila) => fila.total > 0)
    .sort((a, b) => b.total - a.total);

  const mayorModelo = ranking[0]?.total ?? 0;
  /* Solo caben unas cuantas barras legibles; el resto se agrupa al final. */
  const VISIBLES = 8;
  const visibles = ranking.slice(0, VISIBLES);
  const restantes = ranking.slice(VISIBLES);
  const totalRestantes = restantes.reduce((suma, fila) => suma + fila.total, 0);

  /*
   * Composicion del ingreso. Solo se declaran los tres componentes que el
   * servicio guarda; el resto queda como "otros" en lugar de repartirlo a ojo.
   */
  const base = facturables.reduce((s, item) => s + num(item.totalBase), 0);
  const extras = facturables.reduce((s, item) => s + num(item.totalExtras), 0);
  const transporte = facturables.reduce(
    (s, item) =>
      s +
      (item.customerTransportCharge != null
        ? num(item.customerTransportCharge)
        : num(item.transportFeeSnapshot)),
    0,
  );

  const otros = Math.max(0, ingresoSemana - base - extras - transporte);
  const composicion = [
    { label: "Base por hora", valor: base },
    { label: "Extras y extensiones", valor: extras },
    { label: "Transporte cobrado", valor: transporte },
    { label: "Otros conceptos", valor: otros },
  ].filter((fila) => fila.valor > 0);

  /* Cierre semanal: cuantos cortes estan confirmados y que falta por pagar. */
  const confirmadas = summary.filter((row) => row.status === "confirmed").length;
  const netoAPagar = summary.reduce((s, row) => s + num(row.netEmployeePay), 0);
  const deudaRemanente = summary.reduce(
    (s, row) => s + num(row.remainingCashDebt),
    0,
  );
  const efectivoPendiente = summary.reduce(
    (s, row) => s + num(row.cashOutstanding),
    0,
  );

  return [
    {
      id: "ingreso-por-dia",
      titulo: "Ingreso por dia",
      contenido: (
      <Panel
        title="Ingreso por dia"
        subtitle={`Semana del ${startDate} al ${endDate}`}
      >
        {ingresoSemana === 0 ? (
          <p className="text-[13px] text-zinc-500">
            Sin servicios facturados en la semana.
          </p>
        ) : (
          <>
            <p className="font-heading text-[26px] font-semibold leading-none text-white tabular-nums">
              {formatCurrency(ingresoSemana)}
            </p>

            <div className="mt-2 flex h-[160px] items-end gap-2">
              {porDia.map((item) => (
                <div
                  key={item.corto}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <span className="text-[11px] tabular-nums text-zinc-500">
                    {item.total ? compacto(item.total) : ""}
                  </span>

                  <div
                    className="w-full rounded-t-md bg-[#C5A55A]"
                    style={{
                      height: mayor
                        ? `${Math.max(2, (item.total / mayor) * 100)}%`
                        : "2px",
                    }}
                  />

                  <span className="text-[11px] text-zinc-500">{item.corto}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
      ),
    },
    {
      /*
        Comparativa por modelo: quien esta generando el dinero de la semana.
        Va justo detras del ingreso por dia porque responden a la misma
        pregunta desde dos ejes: cuando entro el dinero y por quien entro.
      */
      id: "ingreso-por-modelo",
      titulo: "Ingreso por modelo",
      contenido: (
      <Panel
        title="Ingreso por modelo"
        subtitle="comparativa de la semana en curso"
        action={
          ranking.length > 0 ? (
            <StatusBadge tone="gold">
              {`${ranking.length} ${
                ranking.length === 1 ? "modelo" : "modelos"
              }`}
            </StatusBadge>
          ) : null
        }
      >
        {ranking.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            Ninguna modelo ha facturado en la semana.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibles.map((fila, indice) => (
              <div key={fila.nombre + indice} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-4 shrink-0 text-[11px] tabular-nums text-zinc-600">
                      {indice + 1}
                    </span>
                    <span className="truncate text-[13px] text-zinc-300">
                      {fila.nombre}
                    </span>
                  </span>

                  <span className="shrink-0 text-[11px] text-zinc-500">
                    <span className="font-semibold text-white tabular-nums">
                      {formatCurrency(fila.total)}
                    </span>
                    {ingresoSemana > 0
                      ? ` - ${Math.round((fila.total / ingresoSemana) * 100)} %`
                      : ""}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                  <div
                    className={`h-full rounded-full ${
                      indice === 0 ? "bg-[#D4AF37]" : "bg-[#C5A55A]"
                    }`}
                    style={{
                      width: mayorModelo
                        ? `${Math.max(2, (fila.total / mayorModelo) * 100)}%`
                        : "2px",
                    }}
                  />
                </div>
              </div>
            ))}

            {restantes.length > 0 ? (
              <p className="border-t border-zinc-800/55 pt-3 text-[11px] text-zinc-500">
                {`Otras ${restantes.length} modelos suman `}
                <span className="font-semibold text-zinc-300 tabular-nums">
                  {formatCurrency(totalRestantes)}
                </span>
              </p>
            ) : null}
          </div>
        )}
      </Panel>
      ),
    },
    {
      id: "composicion-ingreso",
      titulo: "Composicion del ingreso",
      contenido: (
        <Panel
          title="Composicion del ingreso"
          subtitle="sobre lo facturado en la semana"
        >
          {composicion.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Sin ingreso que desglosar.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {composicion.map((fila) => (
                <div key={fila.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-zinc-300">
                      {fila.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-500">
                      <span className="font-semibold text-white tabular-nums">
                        {formatCurrency(fila.valor)}
                      </span>
                      {` - ${Math.round((fila.valor / ingresoSemana) * 100)} %`}
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-[#C5A55A]"
                      style={{
                        width: `${Math.round((fila.valor / ingresoSemana) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ),
    },
    {
      id: "cierre-semanal",
      titulo: "Cierre semanal",
      contenido: (
        <Panel
          title="Cierre semanal"
          subtitle="liquidaciones_semanales - estado del corte"
          action={
            <Link
              href="/admin/liquidations"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white"
            >
              Abrir corte
            </Link>
          }
        >
          {summary.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Sin cortes en la semana en curso.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-zinc-300">
                  Liquidaciones confirmadas
                </span>
                <StatusBadge
                  tone={confirmadas === summary.length ? "green" : "amber"}
                >
                  {`${confirmadas} / ${summary.length}`}
                </StatusBadge>
              </div>

              {[
                { label: "Neto a pagar", valor: netoAPagar },
                { label: "Efectivo por recaudar", valor: efectivoPendiente },
                { label: "Deuda remanente", valor: deudaRemanente },
              ].map((fila) => (
                <div
                  key={fila.label}
                  className="flex items-center justify-between gap-3 border-t border-zinc-800/55 pt-3"
                >
                  <span className="text-[13px] text-zinc-400">{fila.label}</span>
                  <span className="font-heading text-[15px] font-semibold text-white tabular-nums">
                    {formatCurrency(fila.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ),
    },
  ];
}
