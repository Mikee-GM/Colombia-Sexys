import Link from "next/link";
import { Banknote, CreditCard, Landmark, Wallet } from "lucide-react";

import {
  Empty,
  ErpPageHeader,
  ErpTable,
  KpiCard,
  KpiGrid,
  Panel,
  RecordLink,
  StatusBadge,
  Td,
  TFootRow,
  Th,
} from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { LiquidationReport } from "@/components/liquidations/types";
import ComisionExtrasTarjeta from "@/components/liquidations/comision-extras-tarjeta";

/**
 * Detalle del corte de una empleada en una semana.
 *
 * Reemplaza el marcador que ocupaba esta ruta y decia que el modulo llegaria
 * cuando el backend tuviera el endpoint: GET /liquidations/report ya existia.
 */

function fecha(iso: string) {
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function LiquidacionEmpleada({
  report,
  startDate,
  endDate,
  puedeEditarComision = false,
}: {
  report: LiquidationReport;
  startDate: string;
  endDate: string;
  /** Solo admin puede cambiar la regla de comision de extras con tarjeta. */
  puedeEditarComision?: boolean;
}) {
  const { weeklySettlement: corte, finalCut: cut } = report;
  const registros = report.officeRecords ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title={report.employee.name}
        description={`Corte de la semana del ${startDate} al ${endDate}`}
        actions={
          <>
            <StatusBadge
              tone={corte.status === "confirmed" ? "green" : "amber"}
            >
              {corte.status === "confirmed" ? "Confirmada" : "Por confirmar"}
            </StatusBadge>

            <Link
              href="/admin/liquidations"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white"
            >
              Volver al corte
            </Link>
          </>
        }
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Bruto de la empleada"
          icon={CreditCard}
          value={formatCurrency(corte.grossEmployeePay)}
          footnote={`${cut.count} ${
            cut.count === 1 ? "servicio" : "servicios"
          } en el periodo`}
        />
        <KpiCard
          label="Efectivo retenido"
          icon={Banknote}
          value={formatCurrency(corte.cashOffset)}
          footnote={`Efectivo en calle: ${formatCurrency(corte.cashOutstanding)}`}
        />
        <KpiCard
          label="Neto a pagar"
          icon={Landmark}
          value={formatCurrency(corte.netEmployeePay)}
          footnote={
            corte.confirmedAt
              ? `Confirmado el ${fecha(corte.confirmedAt)}`
              : "Pendiente de confirmar"
          }
        />
        <KpiCard
          label="Deuda remanente"
          icon={Wallet}
          value={formatCurrency(corte.remainingCashDebt)}
          footnote={
            corte.remainingCashDebt > 0
              ? "Pasa a la semana siguiente"
              : "Sin saldo abierto"
          }
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Reparto del periodo" subtitle="liquidaciones_registro">
          <div className="flex flex-col">
            <Fila label="Ventas totales" value={formatCurrency(cut.salesTotal)} />
            <Fila
              label="Comision de la empresa"
              value={formatCurrency(cut.companyCommission)}
            />
            {/*
              Los extras son integros de la empleada: no entran en el reparto
              con la casa. Se dice explicitamente porque la etiqueta anterior
              ("Extras calculados") no aclaraba de quien era ese dinero, y
              ademas el calculo le retenia un 15 % que no aparecia por ningun
              lado.
            */}
            <Fila
              label="Extras (integros para ella)"
              value={formatCurrency(cut.calculatedExtras)}
            />
            <ComisionExtrasTarjeta
              settings={report.commissionSettings}
              editable={puedeEditarComision}
            />
            <Fila
              label="Membresias"
              value={formatCurrency(cut.membershipTotal)}
            />
            <Fila label="Multas" value={formatCurrency(cut.finesTotal)} negativo />
            <Fila
              label="Bruto de la empleada"
              value={formatCurrency(cut.employeeGrossPay)}
              destacado
            />
          </div>
        </Panel>

        <Panel title="Transporte y efectivo" subtitle="del periodo">
          <div className="flex flex-col">
            <Fila
              label="Transporte cobrado al cliente"
              value={formatCurrency(cut.customerTransportCharges)}
            />
            <Fila
              label="Costo de transporte"
              value={formatCurrency(cut.transportTotal)}
              negativo
            />
            <Fila
              label="Reembolsos de Uber a la empleada"
              value={formatCurrency(cut.employeeUberReimbursements)}
            />
            <Fila
              label="Efectivo recibido por la empleada"
              value={formatCurrency(cut.cashTotal)}
            />
            <Fila
              label="Efectivo que debe entregar"
              value={formatCurrency(cut.employeeCashDue)}
              destacado
            />
          </div>
        </Panel>
      </div>

      <Panel
        title="Servicios del periodo"
        subtitle="registros que componen el corte"
        flush
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Servicio</Th>
              <Th>Ocurrido</Th>
              <Th>Metodo</Th>
              <Th numeric>Total</Th>
              <Th numeric>Efectivo</Th>
              <Th numeric>Extras</Th>
              <Th numeric>Debe entregar</Th>
              <Th>Multa</Th>
            </tr>
          </thead>

          <tbody>
            {registros.length === 0 ? (
              <tr>
                <Td colSpan={8} className="py-10 text-center text-zinc-500">
                  No hay registros en este periodo.
                </Td>
              </tr>
            ) : (
              registros.map((registro) => (
                <tr key={registro.id}>
                  <Td>
                    {registro.serviceId ? (
                      <RecordLink href={`/admin/services/${registro.serviceId}`}>
                        SR-{registro.serviceId.slice(-6).toUpperCase()}
                      </RecordLink>
                    ) : (
                      <span className="text-zinc-500">Manual</span>
                    )}
                  </Td>
                  <Td className="text-zinc-500">{fecha(registro.occurredAt)}</Td>
                  <Td className="capitalize">{registro.paymentMethod}</Td>
                  <Td numeric>{formatCurrency(registro.serviceTotal)}</Td>
                  <Td numeric>{formatCurrency(registro.cashAmount)}</Td>
                  <Td numeric>{formatCurrency(registro.extraAmount)}</Td>
                  <Td numeric>{formatCurrency(registro.employeeCashDue)}</Td>
                  <Td>
                    {registro.isFine ? (
                      <StatusBadge tone="red">
                        {formatCurrency(registro.fineAmount)}
                      </StatusBadge>
                    ) : (
                      <Empty />
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>

          {registros.length > 0 ? (
            <tfoot>
              <TFootRow>
                <Td>
                  Total &middot; {registros.length}{" "}
                  {registros.length === 1 ? "registro" : "registros"}
                </Td>
                <Td />
                <Td />
                <Td numeric>{formatCurrency(cut.salesTotal)}</Td>
                <Td numeric>{formatCurrency(cut.cashTotal)}</Td>
                <Td numeric>{formatCurrency(cut.calculatedExtras)}</Td>
                <Td numeric>{formatCurrency(cut.employeeCashDue)}</Td>
                <Td numeric>{formatCurrency(cut.finesTotal)}</Td>
              </TFootRow>
            </tfoot>
          ) : null}
        </ErpTable>
      </Panel>

      {report.discrepancy?.exists ? (
        <Panel
          title="Discrepancia entre cortes"
          subtitle="lo registrado por la oficina no coincide con lo de la empleada"
        >
          <p className="text-[13px] leading-relaxed text-amber-400">
            Diferencia de {formatCurrency(report.discrepancy.difference)} entre
            el corte de oficina y el de la empleada. Conviene revisar los
            registros antes de confirmar la semana.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}

function Fila({
  label,
  value,
  destacado = false,
  negativo = false,
}: {
  label: string;
  value: string;
  destacado?: boolean;
  negativo?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/50 py-[9px] last:border-b-0">
      <span
        className={
          destacado ? "text-xs font-semibold text-zinc-200" : "text-xs text-zinc-500"
        }
      >
        {label}
      </span>

      <span
        className={`tabular-nums ${
          destacado
            ? "font-heading text-base font-semibold text-[#E8D5A3]"
            : negativo
              ? "text-[13px] font-semibold text-red-400"
              : "text-[13px] font-semibold text-zinc-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
