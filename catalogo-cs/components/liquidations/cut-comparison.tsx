import { formatCurrency, formatDateTime } from "@/lib/calculations";
import LiquidationRecordEditor from "./liquidation-record-editor";
import type { LiquidationRecord, LiquidationReport } from "./types";

interface Props {
  report: LiquidationReport;
  isAdmin?: boolean;
  locked?: boolean;
  onRecordUpdated?: () => void;
}

function SourceBadge({ role }: { role: LiquidationRecord["sourceRole"] }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${role === 'admin' || role === 'jefe' ? 'border-brand-gold/50 bg-brand-gold/10 text-brand-gold' : 'border-blue-900/50 bg-blue-900/30 text-blue-400'}`}>
      {role === "admin" || role === "jefe" ? "Oficina" : "Empleada"}
    </span>
  );
}

export default function CutComparison({
  report,
  isAdmin = false,
  locked = false,
  onRecordUpdated = () => {},
}: Props) {
  // En el nuevo sistema, los registros se hacen en conjunto.
  // Unificamos y ordenamos cronológicamente.
  const allRecords = [...(report.officeRecords || [])].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  const fines = allRecords.filter((r) => r.isFine);
  const regularServices = allRecords.filter((r) => !r.isFine);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-xl shadow-2xl">
        <header className="border-b border-zinc-800/80 p-5 sm:p-6 bg-gradient-to-r from-zinc-900/50 to-zinc-950/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-zinc-100 flex items-center gap-2">
                <span className="h-6 w-1 rounded-full bg-brand-gold"></span>
                Historial de Servicios
              </h2>
              <p className="mt-1 text-sm text-zinc-400 font-medium">
                Desglose detallado de los servicios realizados en la semana.
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Total Semanal</span>
              <span className="w-fit rounded-full border border-brand-gold/30 bg-brand-gold/10 px-4 py-1.5 text-sm font-black text-brand-gold shadow-[0_0_15px_rgba(197,165,90,0.15)]">
                {formatCurrency(report.finalCut.result)}
              </span>
            </div>
          </div>
        </header>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 text-zinc-400 text-[10px] uppercase tracking-wider">
                <th className="p-4 font-semibold border-b border-zinc-800/50 whitespace-nowrap">Fecha / Hora</th>
                <th className="p-4 font-semibold border-b border-zinc-800/50 whitespace-nowrap">Registro</th>
                <th className="p-4 font-semibold border-b border-zinc-800/50 hidden sm:table-cell">Lugar</th>
                <th className="p-4 font-semibold border-b border-zinc-800/50">Método</th>
                <th className="p-4 font-semibold border-b border-zinc-800/50 text-right">Servicio</th>
                <th className="p-4 font-semibold border-b border-zinc-800/50 text-right">Extra</th>
                <th className="p-4 font-semibold border-b border-zinc-800/50 text-right">Transporte</th>
                {isAdmin && <th className="p-4 font-semibold border-b border-zinc-800/50 text-center">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {regularServices.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="p-10 text-center">
                    <p className="text-zinc-500 text-sm italic">No hay servicios registrados en este periodo.</p>
                  </td>
                </tr>
              ) : (
                regularServices.map((record) => {
                  const transport = Number(record.companyTransportExpense) + Number(record.transportExcess);
                  const isCancelled = record.cancelled;

                  return (
                    <tr 
                      key={record.id} 
                      className={`transition-colors hover:bg-zinc-900/40 ${isCancelled ? 'opacity-50 grayscale' : ''}`}
                    >
                      <td className="p-4 whitespace-nowrap text-zinc-300 font-medium">
                        {formatDateTime(record.occurredAt)}
                        {isCancelled && <span className="ml-2 rounded border border-red-800 bg-red-950 px-1.5 py-0.5 text-[9px] text-red-400 font-bold uppercase">Cancelado</span>}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <SourceBadge role={record.sourceRole} />
                      </td>
                      <td className="p-4 text-zinc-400 capitalize hidden sm:table-cell max-w-[150px] truncate">
                        {record.place || "-"}
                      </td>
                      <td className="p-4 text-zinc-300 capitalize text-[11px] font-semibold">
                        {record.paymentMethod}
                      </td>
                      <td className="p-4 text-right font-bold text-zinc-100">
                        {formatCurrency(record.serviceTotal)}
                      </td>
                      <td className="p-4 text-right">
                        {record.extraAmount > 0 ? (
                          <span className="text-emerald-400 font-medium">+{formatCurrency(record.extraAmount)}</span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {transport > 0 ? (
                          <span className="text-red-400 font-medium">-{formatCurrency(transport)}</span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="p-4 text-center">
                          <div className="scale-75 origin-center inline-block">
                            <LiquidationRecordEditor
                              record={record}
                              locked={locked}
                              onUpdated={onRecordUpdated}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {fines.length > 0 && (
        <section className="rounded-2xl border border-red-900/40 bg-red-950/10 overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4">
           <div className="bg-red-950/40 p-4 border-b border-red-900/30 flex items-center gap-3">
             <span className="h-5 w-1 rounded-full bg-red-500"></span>
             <div>
               <h3 className="text-red-400 font-bold uppercase tracking-wider text-sm">Multas Aplicadas ({fines.length})</h3>
               <p className="text-xs text-red-400/60 mt-0.5">Estas multas se descuentan del pago de la empleada.</p>
             </div>
           </div>
           <div className="p-5 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
             {fines.map(m => (
                <div key={m.id} className="rounded-xl bg-black/40 border border-red-900/30 p-4 flex flex-col justify-between hover:border-red-500/50 transition-colors">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-bold uppercase text-zinc-500">{formatDateTime(m.occurredAt)}</span>
                       <span className="text-lg font-black text-red-500">-{formatCurrency(m.fineAmount)}</span>
                    </div>
                    <p className="text-sm italic text-zinc-300">{m.place || 'Sanción monetaria'}</p>
                  </div>
                  {isAdmin && (
                    <div className="mt-4 pt-3 border-t border-red-900/20 text-right">
                       <LiquidationRecordEditor record={m} locked={locked} onUpdated={onRecordUpdated} />
                    </div>
                  )}
                </div>
             ))}
           </div>
        </section>
      )}
    </div>
  );
}
