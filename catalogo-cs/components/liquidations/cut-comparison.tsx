import { formatCurrency, formatDateTime } from "@/lib/calculations";
import { buildCutComparisonRows } from "./cut-comparison-model";
import LiquidationRecordEditor from "./liquidation-record-editor";
import type { CutResult, LiquidationRecord, LiquidationReport } from "./types";

interface Props {
  report: LiquidationReport;
  isAdmin?: boolean;
  locked?: boolean;
  onRecordUpdated?: () => void;
}

function CutTotals({ label, cut }: { label: string; cut: CutResult }) {
  return (
    <section className="min-w-0 rounded-2xl border border-zinc-800 bg-black/30 p-4" aria-label={`Totales de ${label.toLowerCase()}`}>
      <h3 className="font-serif text-xl text-brand-gold">{label}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <Amount label="Total registrado" value={cut.salesTotal} />
        <Amount label="Efectivo" value={cut.cashTotal} />
        <Amount label="Pago bruto" value={cut.employeeGrossPay} />
        <Amount label={cut.direction === "employee_owes_company" ? "Debe a oficina" : cut.direction === "company_owes_employee" ? "Pagar a empleada" : "Corte saldado"} value={Math.abs(cut.result)} />
      </dl>
    </section>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="font-medium tabular-nums text-zinc-100">{formatCurrency(value)}</dd>
    </div>
  );
}

function RecordDetail({
  record,
  editable,
  locked,
  onUpdated,
}: {
  record: LiquidationRecord;
  editable: boolean;
  locked: boolean;
  onUpdated: () => void;
}) {
  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-zinc-800 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs capitalize text-zinc-300">{record.isFine ? "Multa" : record.paymentMethod}</span>
        {record.cancelled && <span className="rounded border border-red-900 px-2 py-1 text-xs text-red-300">Cancelado</span>}
      </div>
      <p className="break-words text-xs text-zinc-400">{record.place || "Sin lugar registrado"}</p>
      <dl className="space-y-2 text-xs">
        {record.isFine ? <Amount label="Multa" value={record.fineAmount} /> : (
          <>
            <Amount label="Servicio" value={record.serviceTotal} />
            <Amount label="Efectivo" value={record.cashAmount} />
            <Amount label="Extras" value={record.extraAmount} />
            <Amount label="Transporte" value={Number(record.companyTransportExpense) + Number(record.transportExcess)} />
          </>
        )}
      </dl>
      {editable && (
        <details className="border-t border-zinc-800 pt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-brand-gold">Revisar registro de oficina</summary>
          <LiquidationRecordEditor record={record} locked={locked} onUpdated={onUpdated} />
        </details>
      )}
    </div>
  );
}

export default function CutComparison({
  report,
  isAdmin = false,
  locked = false,
  onRecordUpdated = () => {},
}: Props) {
  const rows = buildCutComparisonRows(report);

  return (
    <section className="min-w-0 space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6" aria-label="Comparación del corte">
      <header>
        <h2 className="font-serif text-2xl text-zinc-100">Oficina y empleada</h2>
        <p className="mt-1 text-sm text-zinc-400">Compara lo registrado por ambas partes en la semana seleccionada.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <CutTotals label="Oficina" cut={report.officeCut} />
        <CutTotals label="Empleada" cut={report.employeeCut} />
      </div>

      <div className={`rounded-xl border p-4 text-sm ${report.discrepancy.exists ? "border-amber-800/60 bg-amber-950/20 text-amber-200" : "border-zinc-800 text-zinc-300"}`} role="status">
        {report.discrepancy.exists ? (
          <>
            <p className="font-semibold">{report.serviceDiscrepancies.length} registros por revisar</p>
            <p className="mt-1">Diferencia reportada (oficina menos empleada): {formatCurrency(report.discrepancy.difference)}.</p>
          </>
        ) : <p>Sin diferencias de total reportadas entre registros vinculados.</p>}
        <p className="mt-2 text-xs text-zinc-400">Los ajustes independientes se muestran por separado. El corte final conserva el cálculo de oficina.</p>
      </div>

      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 text-xs font-semibold uppercase tracking-wide text-zinc-400 lg:grid" aria-hidden="true">
        <span>Registro de oficina</span>
        <span>Registro de empleada</span>
      </div>
      <div className="space-y-4">
        {rows.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">No hay registros en este periodo.</p>}
        {rows.map((row) => (
          <article key={row.key} className="min-w-0 rounded-2xl border border-zinc-800 p-3 sm:p-4" aria-label={row.serviceId ? `Registro ${row.serviceId.slice(0, 8)}` : "Ajuste independiente"}>
            <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-200">{row.serviceId ? `Registro ${row.serviceId.slice(0, 8).toUpperCase()}` : "Ajuste independiente"}</h3>
                <p className="mt-1 text-xs text-zinc-400">{formatDateTime(row.occurredAt)}</p>
              </div>
              <span className={`rounded-lg border px-2 py-1 text-xs ${row.discrepancy ? "border-amber-800/60 text-amber-200" : "border-zinc-700 text-zinc-400"}`}>
                {!row.serviceId ? "Sin vínculo a servicio" : row.discrepancy ? "Por revisar" : row.office.length && row.employee.length ? "Sin diferencia reportada" : "Sin contraparte"}
              </span>
            </header>
            {row.discrepancy && (
              <p className="mb-3 text-xs text-amber-200">
                {row.discrepancy.officeTotal === null ? "Falta registro de oficina." : row.discrepancy.employeeTotal === null ? "Falta registro de empleada." : `Diferencia de total: ${formatCurrency(row.discrepancy.difference)} (oficina menos empleada).`}
              </p>
            )}
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {(["office", "employee"] as const).map((side) => (
                <div key={side} className="min-w-0 space-y-2">
                  <h4 className="text-xs font-semibold text-brand-gold lg:sr-only">{side === "office" ? "Oficina" : "Empleada"}</h4>
                  {row[side].length ? row[side].map((record) => (
                    <RecordDetail key={record.id} record={record} editable={isAdmin && side === "office"} locked={locked} onUpdated={onRecordUpdated} />
                  )) : <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">Sin registro</p>}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
