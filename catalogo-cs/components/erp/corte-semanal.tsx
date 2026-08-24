import Link from "next/link";
import { AlertTriangle, Banknote, CreditCard, Landmark } from "lucide-react";

import {
  Empty,
  ErpTable,
  KpiCard,
  KpiGrid,
  Panel,
  PersonCell,
  StatusBadge,
  Td,
  TFootRow,
  Th,
} from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import type { WeeklySettlementSummary } from "@/components/liquidations/types";

/**
 * Corte semanal con todas las empleadas del periodo.
 *
 * Es la vista que faltaba: el panel solo permitia mirar una empleada a la vez,
 * asi que no habia forma de ver el total de la nomina de la semana ni quien
 * queda con deuda. Cada fila abre el detalle de esa empleada.
 */
export default function CorteSemanal({
  summary,
  startDate,
  endDate,
}: {
  summary: WeeklySettlementSummary[];
  startDate: string;
  endDate: string;
}) {
  const totales = summary.reduce(
    (acc, fila) => ({
      servicios: acc.servicios + fila.servicesCount,
      bruto: acc.bruto + fila.grossEmployeePay,
      retenido: acc.retenido + fila.cashOffset,
      neto: acc.neto + fila.netEmployeePay,
      deuda: acc.deuda + fila.remainingCashDebt,
      comision: acc.comision + fila.companyCommission,
      multas: acc.multas + fila.finesTotal,
    }),
    {
      servicios: 0,
      bruto: 0,
      retenido: 0,
      neto: 0,
      deuda: 0,
      comision: 0,
      multas: 0,
    },
  );

  const confirmadas = summary.filter((fila) => fila.status === "confirmed").length;
  const conDeuda = summary.filter((fila) => fila.remainingCashDebt > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid columns={4}>
        <KpiCard
          label="Nomina bruta"
          icon={CreditCard}
          value={formatCurrency(totales.bruto)}
          footnote={`${totales.servicios} ${
            totales.servicios === 1 ? "servicio" : "servicios"
          } liquidados`}
        />
        <KpiCard
          label="Efectivo retenido"
          icon={Banknote}
          value={formatCurrency(totales.retenido)}
          footnote="Compensado contra obligaciones"
        />
        <KpiCard
          label="Neto a pagar"
          icon={Landmark}
          value={formatCurrency(totales.neto)}
          footnote={`${confirmadas} de ${summary.length} cortes confirmados`}
        />
        <KpiCard
          label="Deuda remanente"
          icon={AlertTriangle}
          value={formatCurrency(totales.deuda)}
          footnote={
            conDeuda > 0
              ? `${conDeuda} ${
                  conDeuda === 1 ? "empleada" : "empleadas"
                } con saldo abierto`
              : "Sin saldos abiertos"
          }
        />
      </KpiGrid>

      <Panel
        title="Corte semanal por empleada"
        subtitle={`empleadas_liquidacion_semanal - del ${startDate} al ${endDate}`}
        flush
        action={
          <StatusBadge tone={confirmadas === summary.length ? "green" : "amber"}>
            {confirmadas === summary.length
              ? "Semana cerrada"
              : `${summary.length - confirmadas} por confirmar`}
          </StatusBadge>
        }
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Empleada</Th>
              <Th numeric>Servicios</Th>
              <Th numeric>Ventas</Th>
              <Th numeric>Comision empresa</Th>
              <Th numeric>Bruto</Th>
              <Th numeric>Efectivo retenido</Th>
              <Th numeric>Neto a pagar</Th>
              <Th numeric>Deuda remanente</Th>
              <Th>Estado</Th>
            </tr>
          </thead>

          <tbody>
            {summary.length === 0 ? (
              <tr>
                <Td colSpan={9} className="py-10 text-center text-zinc-500">
                  No hay servicios liquidados en esta semana.
                </Td>
              </tr>
            ) : (
              summary.map((fila) => (
                <tr key={fila.employeeId}>
                  <Td>
                    <PersonCell
                      name={fila.employeeName}
                      meta={
                        fila.finesTotal > 0
                          ? `Multas: ${formatCurrency(fila.finesTotal)}`
                          : "Sin multas"
                      }
                      href={`/admin/liquidations/${fila.employeeId}?start=${startDate}&end=${endDate}`}
                    />
                  </Td>

                  <Td numeric>{fila.servicesCount}</Td>
                  <Td numeric>{formatCurrency(fila.salesTotal)}</Td>
                  <Td numeric className="text-zinc-500">
                    {formatCurrency(fila.companyCommission)}
                  </Td>
                  <Td numeric>{formatCurrency(fila.grossEmployeePay)}</Td>
                  <Td numeric className="text-zinc-500">
                    {fila.cashOffset > 0 ? (
                      formatCurrency(fila.cashOffset)
                    ) : (
                      <Empty />
                    )}
                  </Td>
                  <Td numeric>
                    <span className="font-semibold text-white">
                      {formatCurrency(fila.netEmployeePay)}
                    </span>
                  </Td>
                  <Td numeric>
                    {fila.remainingCashDebt > 0 ? (
                      <span className="font-semibold text-red-400">
                        {formatCurrency(fila.remainingCashDebt)}
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </Td>
                  <Td>
                    {fila.status === "confirmed" ? (
                      <StatusBadge tone="green">Confirmada</StatusBadge>
                    ) : (
                      <StatusBadge tone="amber">Por confirmar</StatusBadge>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>

          {summary.length > 0 ? (
            <tfoot>
              <TFootRow>
                <Td>
                  Total &middot; {summary.length}{" "}
                  {summary.length === 1 ? "empleada" : "empleadas"}
                </Td>
                <Td numeric>{totales.servicios}</Td>
                <Td numeric>
                  {formatCurrency(
                    summary.reduce((sum, fila) => sum + fila.salesTotal, 0),
                  )}
                </Td>
                <Td numeric>{formatCurrency(totales.comision)}</Td>
                <Td numeric>{formatCurrency(totales.bruto)}</Td>
                <Td numeric>{formatCurrency(totales.retenido)}</Td>
                <Td numeric>{formatCurrency(totales.neto)}</Td>
                <Td numeric>{formatCurrency(totales.deuda)}</Td>
                <Td />
              </TFootRow>
            </tfoot>
          ) : null}
        </ErpTable>
      </Panel>

      {totales.multas > 0 ? (
        <Panel
          title="Multas del periodo"
          subtitle="descontadas del bruto de la empleada"
          flush
          action={
            <Link
              href="/admin/reports"
              className="text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
            >
              Ver disciplina
            </Link>
          }
        >
          <div className="flex flex-col">
            {summary
              .filter((fila) => fila.finesTotal > 0)
              .map((fila) => (
                <div
                  key={fila.employeeId}
                  className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                >
                  <span className="font-semibold text-white">
                    {fila.employeeName}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-red-400">
                    {formatCurrency(fila.finesTotal)}
                  </span>
                </div>
              ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
