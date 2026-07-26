import { formatCurrency } from "@/lib/calculations";
import type { CutResult } from "./types";

interface Props {
  cut: CutResult;
}

type BreakdownItem = {
  label: string;
  value: number;
};

export default function LiquidationBreakdown({ cut }: Props) {
  const companyIncome: BreakdownItem[] = [
    { label: "Comisión de la empresa", value: cut.companyCommission },
    { label: "Cargos de transporte al cliente", value: cut.customerTransportCharges },
    { label: "Efectivo pendiente de entrega", value: cut.employeeCashDue },
    ...(cut.finesTotal > 0
      ? [{ label: "Multas a favor de la empresa", value: cut.finesTotal }]
      : []),
  ];

  const deductions: BreakdownItem[] = [
    { label: "Pagos electrónicos", value: cut.cardTotal },
    { label: "Extras para la empleada", value: cut.calculatedExtras },
    { label: "Membresías utilizadas", value: cut.membershipTotal },
    { label: "Bonificaciones de promoción", value: cut.promotionTotal },
    { label: "Transporte", value: cut.transportTotal },
    { label: "Reembolso de Uber a la empleada", value: cut.employeeUberReimbursements },
  ].filter((item) => item.value > 0);

  const resultStyles =
    cut.direction === "company_owes_employee"
      ? "border-brand-gold/30 bg-brand-gold/10 text-brand-gold"
      : cut.direction === "employee_owes_company"
        ? "border-red-500/30 bg-red-500/10 text-red-400"
        : "border-zinc-700 bg-zinc-900 text-zinc-300";

  const resultLabel =
    cut.direction === "company_owes_employee"
      ? "Pagar a empleada"
      : cut.direction === "employee_owes_company"
        ? "Debe a oficina"
        : "Corte saldado";

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-md sm:p-6">
      <header className="border-b border-zinc-800 pb-5">
        <h2 className="font-serif text-xl font-semibold text-zinc-100">
          Desglose de liquidación
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500">
          Detalle de los conceptos utilizados para calcular el corte.
        </p>
      </header>

      <div className="mt-6 space-y-5">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Venta de referencia
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-zinc-100">
            {formatCurrency(cut.salesTotal)}
          </p>
        </div>

        <BreakdownGroup
          title="A favor de la empresa"
          items={companyIncome}
          valueClassName="text-green-400"
          prefix="+"
        />

        {deductions.length > 0 && (
          <BreakdownGroup
            title="Descuentos y salidas"
            items={deductions}
            valueClassName="text-red-400"
            prefix="-"
          />
        )}
      </div>

      <div className={`mt-7 rounded-2xl border p-5 ${resultStyles}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">
              Resultado del corte
            </p>
            <p className="mt-1 text-sm font-medium">{resultLabel}</p>
          </div>
          <p className="font-serif text-3xl font-bold leading-none sm:text-right sm:text-4xl">
            {formatCurrency(Math.abs(cut.result))}
          </p>
        </div>
      </div>
    </section>
  );
}

function BreakdownGroup({
  title,
  items,
  prefix,
  valueClassName,
}: {
  title: string;
  items: BreakdownItem[];
  prefix: "+" | "-";
  valueClassName: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/20">
      <h3 className="border-b border-zinc-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h3>
      <div className="divide-y divide-zinc-800/80 px-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5"
          >
            <span className="text-sm leading-snug text-zinc-400">{item.label}</span>
            <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${valueClassName}`}>
              {prefix}{formatCurrency(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
