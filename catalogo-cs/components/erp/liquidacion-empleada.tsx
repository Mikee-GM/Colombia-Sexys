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
import CorteSimulacion from "@/components/liquidations/corte-simulacion";
import ComprobantesTransferencia from "@/components/erp/comprobantes-transferencia";
import ConciliacionOficinaEmpleada from "@/components/erp/conciliacion-oficina-empleada";
import CutComparison from "@/components/liquidations/cut-comparison";
import type { EvidenceItem } from "@/lib/types";

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
  comprobantes = [],
}: {
  report: LiquidationReport;
  startDate: string;
  endDate: string;
  /** Solo admin puede cambiar la regla de comision de extras con tarjeta. */
  puedeEditarComision?: boolean;
  /** Comprobantes de transferencia de sus servicios en el periodo. */
  comprobantes?: EvidenceItem[];
}) {
  const { weeklySettlement: corte, finalCut: cut } = report;
  const registros = report.officeRecords ?? [];

  const capturas = comprobantes.map((evidencia) => ({
    id: evidencia.id,
    url: evidencia.url,
    estado: evidencia.status,
    monto: evidencia.amount,
    createdAt: evidencia.createdAt,
    servicioId: evidencia.serviceId,
    clienteTelegram: evidencia.clientName,
    observaciones: evidencia.observations,
  }));

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

      <CorteSimulacion report={report} isAdmin={puedeEditarComision} />

      <CutComparison 
        report={report} 
        isAdmin={puedeEditarComision} 
        locked={corte.status === "confirmed"} 
      />

      {/*
        Las capturas de los cobros del periodo, debajo de la tabla que las
        contabiliza: cuadrar una transferencia obligaba a salir a Evidencias y
        emparejarla a mano por fecha y monto.
      */}
      <ComprobantesTransferencia
        comprobantes={capturas}
        subtitle={`transferencias de sus servicios del ${startDate} al ${endDate}`}
        mostrarServicio
        vacio="No se recibieron comprobantes de transferencia en este periodo."
      />

      <ConciliacionOficinaEmpleada report={report} />
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
