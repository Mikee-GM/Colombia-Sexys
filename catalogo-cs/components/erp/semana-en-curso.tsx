import Link from "next/link";

import IngresoPorDiaChart from "@/components/erp/ingreso-por-dia-chart";

import { Panel, StatusBadge } from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import { APP_TIME_ZONE } from "@/lib/locale";
import type { Service } from "@/lib/types";
import type { WeeklySettlementSummary } from "@/components/liquidations/types";

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

export default function SemanaEnCurso({
  services,
  summary,
  startDate,
  endDate,
}: {
  services: Service[];
  summary: WeeklySettlementSummary[];
  startDate: string;
  endDate: string;
}) {
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

  const ingresoSemana = porDia.reduce((suma, item) => suma + item.total, 0);

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

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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

            <IngresoPorDiaChart datos={porDia} />
          </>
        )}
      </Panel>

      <div className="flex flex-col gap-6">
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
      </div>
    </div>
  );
}
