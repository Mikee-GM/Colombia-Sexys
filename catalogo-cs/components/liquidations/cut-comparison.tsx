import { formatCurrency, formatDateTime } from "@/lib/calculations";
import type { LiquidationRecord, LiquidationReport } from "./types";

interface Props {
  report: LiquidationReport;
}

function SourceBadge({ role }: { role: LiquidationRecord["sourceRole"] }) {
  return (
    <span className="rounded-md border border-blue-900/50 bg-blue-900/30 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-400">
      {role === "admin" ? "Administración" : "Oficina"}
    </span>
  );
}

export default function CutComparison({ report }: Props) {
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-md">
      <header className="border-b border-zinc-800 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold text-zinc-100">
              Registros del corte oficial
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Servicios finalizados registrados automáticamente por la oficina.
            </p>
          </div>
          <span className="w-fit rounded-full border border-brand-gold/20 bg-brand-gold/10 px-3 py-1 text-xs font-bold text-brand-gold">
            {formatCurrency(report.officeCut.result)}
          </span>
        </div>
      </header>

      <div className="space-y-3 p-5 sm:p-6">
        {report.officeRecords.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-zinc-600">
            No hay servicios finalizados en este periodo.
          </p>
        ) : (
          report.officeRecords.map((record) => {
            const transport =
              Number(record.companyTransportExpense) + Number(record.transportExcess);
            return (
              <article key={record.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {formatDateTime(record.occurredAt)}
                    </span>
                    <SourceBadge role={record.sourceRole} />
                  </div>
                  <span className="text-sm font-bold text-zinc-200">
                    {formatCurrency(record.serviceTotal)}
                  </span>
                </div>
                <p className="text-sm capitalize text-zinc-400">{record.paymentMethod}</p>
                {record.extraAmount > 0 && (
                  <p className="mt-1 text-xs text-zinc-400">
                    Extras: {formatCurrency(record.extraAmount)}
                  </p>
                )}
                {transport > 0 && (
                  <p className="mt-1 text-xs text-red-400">
                    Transporte: -{formatCurrency(transport)}
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
