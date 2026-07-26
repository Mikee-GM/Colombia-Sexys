"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileText, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  addEmployeeReportNote,
  assignEmployeeReport,
  changeEmployeeReportPriority,
  closeEmployeeReport,
  getEmployeeReportDetail,
  startEmployeeReportReview,
  takeEmployeeReport,
} from "@/lib/actions/employee-reports";
import type { ApiUser, EmployeeReport, EmployeeReportPriority } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  categoryLabels,
  formatReportDate,
  historyLabels,
  originLabels,
  priorityClass,
  priorityLabels,
  statusClass,
  statusLabels,
} from "./report-labels";

type Props = {
  reportId: string | null;
  open: boolean;
  role: "admin" | "jefe";
  admins: ApiUser[];
  refreshKey: number;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
};

export default function ReportDetailSheet({
  reportId,
  open,
  role,
  admins,
  refreshKey,
  onOpenChange,
  onChanged,
}: Props) {
  const [report, setReport] = useState<EmployeeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState<"resolve" | "dismiss" | null>(null);
  const [resolution, setResolution] = useState("");
  const [pending, startTransition] = useTransition();

  async function loadDetail(id: string) {
    setLoading(true);
    try {
      setReport(await getEmployeeReportDetail(id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && reportId) void loadDetail(reportId);
  }, [open, reportId, refreshKey]);

  async function runAction(
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
  ) {
    const result = await action();
    if (!result.success) {
      toast.error(result.error || "No se pudo actualizar el reporte");
      return;
    }
    toast.success(successMessage);
    if (reportId) await loadDetail(reportId);
    await onChanged();
  }

  function scheduleAction(
    action: () => Promise<{ success: boolean; error?: string }>,
    message: string,
  ) {
    startTransition(() => void runAction(action, message));
  }

  const closed = report?.status === "resuelto" || report?.status === "descartado";
  const reporterName =
    report?.origin === "cliente"
      ? report.client?.nombreTelegram || "Cliente"
      : report?.driver?.nombre || "Chofer";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto border-zinc-800 bg-[#070707] p-0 text-white sm:max-w-2xl">
          <SheetHeader className="border-b border-zinc-800 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2 pr-10">
              {report && (
                <>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${priorityClass(report.priority)}`}>
                    {priorityLabels[report.priority]}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusClass(report.status)}`}>
                    {statusLabels[report.status]}
                  </span>
                </>
              )}
            </div>
            <SheetTitle className="mt-2 text-xl text-white">Detalle del reporte</SheetTitle>
            <SheetDescription className="text-zinc-500">
              {report ? `Caso #${report.id.slice(-8).toUpperCase()}` : "Expediente e historial del caso"}
            </SheetDescription>
          </SheetHeader>

          {loading && !report ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-zinc-900" />)}
            </div>
          ) : report ? (
            <div className="space-y-6 p-5 sm:p-6">
              <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="mb-4 flex items-center gap-2 text-[#C5A55A]"><FileText size={17} /><h3 className="text-xs font-bold uppercase tracking-[0.16em]">Incidente</h3></div>
                <p className="text-sm leading-6 text-zinc-200">{report.description}</p>
                <div className="mt-5 grid gap-4 border-t border-zinc-800 pt-4 sm:grid-cols-2">
                  <Detail label="Categoría" value={categoryLabels[report.category]} />
                  <Detail label="Registrado" value={formatReportDate(report.createdAt)} />
                  <Detail label="Reportado por" value={`${originLabels[report.origin]} · ${reporterName}`} />
                  <Detail label="Empleada" value={report.employee?.nombreArtistico || "Sin nombre"} />
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="mb-4 flex items-center gap-2 text-[#C5A55A]"><Clock3 size={17} /><h3 className="text-xs font-bold uppercase tracking-[0.16em]">Servicio y prórrogas</h3></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Servicio" value={`#${report.serviceId.slice(-8).toUpperCase()}`} />
                  <Detail label="Estado" value={report.service?.estado || "—"} />
                  <Detail label="Calificación" value={report.service?.calificacion ? `${report.service.calificacion} estrellas` : "Sin calificar"} />
                  <Detail label="Prórrogas usadas" value={String(report.service?.prorrogasUsadas ?? 0)} />
                </div>
                {!!report.service?.prorrogases?.length && (
                  <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
                    {report.service.prorrogases.map((extension) => (
                      <div key={extension.id} className="flex items-center justify-between rounded-lg bg-black px-3 py-2 text-xs text-zinc-400">
                        <span>Prórroga {extension.numeroProrroga} · {extension.minutosSolicitados} min</span>
                        <span>{formatReportDate(extension.solicitadaAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {role === "admin" && !closed && (
                <section className="rounded-2xl border border-[#C5A55A]/30 bg-[#C5A55A]/5 p-5">
                  <div className="mb-4 flex items-center gap-2 text-[#C5A55A]"><UserRound size={17} /><h3 className="text-xs font-bold uppercase tracking-[0.16em]">Gestión del caso</h3></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button disabled={pending} onClick={() => scheduleAction(() => takeEmployeeReport(report.id), "Caso asignado a ti")} className="border border-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#C5A55A] transition hover:bg-[#C5A55A] hover:text-black disabled:opacity-50">Tomar caso</button>
                    {report.status === "nuevo" && <button disabled={pending} onClick={() => scheduleAction(() => startEmployeeReportReview(report.id), "Revisión iniciada")} className="bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-50">Iniciar revisión</button>}
                    <label className="space-y-1.5 text-xs text-zinc-500">
                      Responsable
                      <select disabled={pending} value={report.assignedAdminId || ""} onChange={(event) => event.target.value && scheduleAction(() => assignEmployeeReport(report.id, event.target.value), "Responsable actualizado")} className="w-full border border-zinc-800 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#C5A55A]">
                        <option value="">Sin asignar</option>
                        {admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.email}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1.5 text-xs text-zinc-500">
                      Prioridad
                      <select disabled={pending} value={report.priority} onChange={(event) => scheduleAction(() => changeEmployeeReportPriority(report.id, event.target.value as EmployeeReportPriority), "Prioridad actualizada")} className="w-full border border-zinc-800 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#C5A55A]">
                        {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 space-y-2">
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} rows={3} placeholder="Agregar nota interna…" className="w-full resize-none border border-zinc-800 bg-black p-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-[#C5A55A]" />
                    <button disabled={pending || note.trim().length < 2} onClick={() => scheduleAction(async () => { const result = await addEmployeeReportNote(report.id, note.trim()); if (result.success) setNote(""); return result; }, "Nota agregada")} className="w-full border border-zinc-700 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:border-zinc-500 disabled:opacity-40">Agregar nota</button>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-5">
                    <button onClick={() => setClosing("dismiss")} className="border border-zinc-700 px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:border-red-500/60 hover:text-red-300">Descartar</button>
                    <button onClick={() => setClosing("resolve")} className="bg-emerald-500 px-4 py-3 text-xs font-bold uppercase tracking-wider text-black hover:bg-emerald-400">Resolver</button>
                  </div>
                </section>
              )}

              {report.resolution && (
                <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
                  <div className="mb-3 flex items-center gap-2 text-emerald-400"><CheckCircle2 size={17} /><h3 className="text-xs font-bold uppercase tracking-[0.16em]">Resolución</h3></div>
                  <p className="text-sm leading-6 text-zinc-300">{report.resolution}</p>
                </section>
              )}

              <section>
                <div className="mb-4 flex items-center gap-2 text-[#C5A55A]"><Clock3 size={17} /><h3 className="text-xs font-bold uppercase tracking-[0.16em]">Historial</h3></div>
                <div className="space-y-0 border-l border-zinc-800 pl-5">
                  {(report.history || []).map((event) => (
                    <div key={event.id} className="relative pb-5 before:absolute before:-left-[25px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-[#C5A55A]">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-zinc-200">{historyLabels[event.action] || event.action}</p><time className="text-[10px] text-zinc-600">{formatReportDate(event.createdAt)}</time></div>
                      <p className="mt-1 text-xs text-zinc-500">{event.actor?.email || "Sistema"}</p>
                      {event.note && <p className="mt-2 rounded-lg bg-zinc-950 p-3 text-sm leading-5 text-zinc-400">{event.note}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center text-zinc-500"><AlertTriangle /><p>No se pudo cargar el expediente.</p></div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={closing !== null} onOpenChange={(value) => !value && setClosing(null)}>
        <DialogContent className="border border-zinc-800 bg-[#0a0a0a] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{closing === "resolve" ? "Resolver reporte" : "Descartar reporte"}</DialogTitle>
            <DialogDescription className="text-zinc-500">La explicación quedará registrada permanentemente en el historial.</DialogDescription>
          </DialogHeader>
          <textarea autoFocus value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={4000} rows={5} placeholder="Describe la resolución…" className="w-full resize-none border border-zinc-800 bg-black p-3 text-sm outline-none focus:border-[#C5A55A]" />
          <DialogFooter className="border-zinc-800 bg-transparent">
            <button onClick={() => setClosing(null)} className="border border-zinc-700 px-4 py-2 text-xs text-zinc-400">Cancelar</button>
            <button disabled={pending || resolution.trim().length < 3} onClick={() => { if (!report || !closing) return; const action = closing; scheduleAction(async () => { const result = await closeEmployeeReport(report.id, action, resolution.trim()); if (result.success) { setClosing(null); setResolution(""); } return result; }, action === "resolve" ? "Reporte resuelto" : "Reporte descartado"); }} className="bg-[#C5A55A] px-4 py-2 text-xs font-bold text-black disabled:opacity-40">Confirmar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{label}</dt><dd className="mt-1 text-sm text-zinc-300">{value}</dd></div>;
}
