"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  HandCoins,
  Receipt,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";

import {
  ErpPageHeader,
  KpiCard,
  KpiGrid,
  Panel,
  StatusBadge,
} from "@/components/erp/primitives";
import TendenciaChart from "@/components/erp/dinero/tendencia-chart";
import PanelEfectivo from "@/components/erp/dinero/panel-efectivo";
import PanelDeudas from "@/components/erp/dinero/panel-deudas";
import { formatCurrency, formatDate } from "@/lib/calculations";
import {
  deshacerLiquidacion,
  marcarComoPagada,
} from "@/app/admin/dinero/actions";
import type { EmployeeMoneyDetail } from "@/components/erp/dinero/types";

/** Fila etiqueta-valor de los desgloses. */
function Fila({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/55 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <span className="text-[13px] text-zinc-400">{label}</span>
        {hint ? (
          <p className="text-[11px] leading-tight text-zinc-600">{hint}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-zinc-100">
        {value}
      </span>
    </div>
  );
}

/** Variacion contra el periodo anterior, para el pie de un indicador. */
function Delta({ valor, sufijo }: { valor: number | null; sufijo?: string }) {
  if (valor === null) {
    return <span className="text-zinc-600">Sin semana anterior</span>;
  }
  const positivo = valor >= 0;
  return (
    <span className={positivo ? "text-green-400" : "text-red-400"}>
      {positivo ? "+" : ""}
      {valor}% {sufijo ?? "vs. semana anterior"}
    </span>
  );
}

export default function DineroFicha({
  detalle,
  startDate,
  endDate,
  esAdmin,
}: {
  detalle: EmployeeMoneyDetail;
  startDate: string;
  endDate: string;
  esAdmin: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [confirmandoDeshacer, setConfirmandoDeshacer] = useState(false);

  const {
    employee,
    finalCut,
    weeklySettlement,
    performance,
    paymentMix,
    comparison,
    trend,
    balance,
  } = detalle;

  const liquidada = weeklySettlement.status === "confirmed";

  function liquidar() {
    iniciar(async () => {
      try {
        await marcarComoPagada(employee.id, startDate, endDate);
        toast.success(`${employee.name} queda marcada como pagada`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo liquidar",
        );
      }
    });
  }

  function deshacer() {
    iniciar(async () => {
      try {
        await deshacerLiquidacion(employee.id, startDate, endDate);
        setConfirmandoDeshacer(false);
        toast.success("Liquidación deshecha y efectivo devuelto al saldo");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo deshacer",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/admin/dinero?start=${startDate}&end=${endDate}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500 transition-colors hover:text-[#C5A55A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al listado
        </Link>
      </div>

      <ErpPageHeader
        title={employee.name}
        description={`Dinero de la semana del ${startDate} al ${endDate}`}
        actions={
          <StatusBadge tone={liquidada ? "green" : "amber"}>
            {liquidada
              ? `Liquidada${
                  weeklySettlement.confirmedAt
                    ? ` el ${formatDate(weeklySettlement.confirmedAt)}`
                    : ""
                }`
              : "Sin liquidar"}
          </StatusBadge>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Saldo consolidado: la respuesta a "que hago hoy con esta persona"   */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title="Saldo"
        subtitle="Lo que se le paga esta semana, menos lo que debe"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              className={`font-heading text-[40px] font-semibold leading-none tabular-nums ${
                balance.total < 0 ? "text-red-400" : "text-[#E8D5A3]"
              }`}
            >
              {formatCurrency(balance.total)}
            </p>
            <p className="mt-2 text-[12px] text-zinc-500">
              {balance.total < 0
                ? "Saldo en contra: debe más de lo que se le paga."
                : "A favor de ella: esto es lo que hay que entregarle."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!liquidada ? (
              <button
                type="button"
                onClick={liquidar}
                disabled={pendiente || !esAdmin}
                className="rounded-xl border border-[#C5A55A]/50 px-4 py-2 text-[12px] font-semibold text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Marcar como pagada
              </button>
            ) : confirmandoDeshacer ? (
              <>
                <span className="text-[12px] text-zinc-400">
                  ¿Deshacer la liquidación?
                </span>
                <button
                  type="button"
                  onClick={deshacer}
                  disabled={pendiente}
                  className="rounded-xl border border-red-400/50 px-3 py-2 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-400 hover:text-black disabled:opacity-40"
                >
                  Sí, deshacer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoDeshacer(false)}
                  className="rounded-xl border border-zinc-800 px-3 py-2 text-[12px] text-zinc-400 hover:text-zinc-200"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoDeshacer(true)}
                disabled={!esAdmin}
                className="rounded-xl border border-zinc-800 px-4 py-2 text-[12px] font-semibold text-zinc-300 transition-colors hover:border-red-400/50 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Deshacer liquidación
              </button>
            )}
          </div>
        </div>

        <div className="mt-1 grid gap-x-8 sm:grid-cols-2">
          <Fila
            label="Se le paga por sus servicios"
            value={formatCurrency(balance.netEmployeePay)}
            hint="Su parte del corte, ya descontado el efectivo que retuvo"
          />
          <Fila
            label="Efectivo que no ha entregado"
            value={formatCurrency(balance.cashOutstanding)}
            hint="Cobrado al cliente y todavía en su poder"
          />
          <Fila
            label="Deuda pendiente"
            value={formatCurrency(balance.debtOutstanding)}
            hint="Préstamos y cargos que se le registraron"
          />
          <Fila
            label="Multas de la semana"
            value={formatCurrency(finalCut.finesTotal)}
          />
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* Rendimiento                                                        */}
      {/* ------------------------------------------------------------------ */}
      <KpiGrid columns={4}>
        <KpiCard
          label="Ingreso total"
          value={formatCurrency(finalCut.totalCollected)}
          icon={Banknote}
          footnote={<Delta valor={comparison.deltas.salesTotal} />}
        />
        <KpiCard
          label="Su ganancia"
          value={formatCurrency(weeklySettlement.grossEmployeePay)}
          icon={HandCoins}
          footnote={<Delta valor={comparison.deltas.employeeGrossPay} />}
        />
        <KpiCard
          label="Servicios"
          value={performance.servicesCount}
          icon={CalendarDays}
          footnote={<Delta valor={comparison.deltas.servicesCount} />}
        />
        <KpiCard
          label="Ticket promedio"
          value={formatCurrency(performance.averageTicket)}
          icon={TrendingUp}
          footnote="Ventas entre servicios hechos"
        />
      </KpiGrid>

      <KpiGrid columns={4}>
        <KpiCard
          label="Días trabajados"
          value={performance.daysWorked}
          icon={CalendarDays}
          footnote={`${performance.servicesPerActiveDay} servicios por día activo`}
        />
        <KpiCard
          label="Cancelados"
          value={performance.cancelledCount}
          icon={XCircle}
          footnote={`${performance.cancelRate}% de los agendados`}
        />
        <KpiCard
          label="Efectivo sin entregar"
          value={formatCurrency(balance.cashOutstanding)}
          icon={Wallet}
        />
        <KpiCard
          label="Deuda"
          value={formatCurrency(balance.debtOutstanding)}
          icon={Receipt}
        />
      </KpiGrid>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Ganancia por semana"
          subtitle="Las últimas ocho semanas; la barra encendida es la que estás viendo"
        >
          <TendenciaChart puntos={trend} />
        </Panel>

        <Panel
          title="Cómo entró el dinero"
          subtitle="El efectivo es justo lo que ella tiene en la mano"
        >
          <div>
            <Fila
              label="Efectivo"
              value={formatCurrency(paymentMix.cash)}
              hint="De aquí sale lo que tiene que entregar"
            />
            <Fila
              label="Transferencia"
              value={formatCurrency(paymentMix.transfer)}
            />
            <Fila label="Tarjeta" value={formatCurrency(paymentMix.card)} />
            <Fila
              label="Extras"
              value={formatCurrency(finalCut.calculatedExtras)}
              hint="Íntegros para ella: no entran en el reparto con la casa"
            />
            <Fila
              label="Comisión de la casa"
              value={formatCurrency(finalCut.companyCommission)}
            />
            <Fila
              label="Transporte cobrado al cliente"
              value={formatCurrency(finalCut.customerTransportCharges)}
            />
          </div>
        </Panel>
      </div>

      <PanelEfectivo
        employeeId={employee.id}
        obligaciones={detalle.cashObligations}
        abonos={detalle.cashPayments}
        esAdmin={esAdmin}
      />

      <PanelDeudas
        employeeId={employee.id}
        deudas={detalle.debts}
        esAdmin={esAdmin}
      />
    </div>
  );
}
