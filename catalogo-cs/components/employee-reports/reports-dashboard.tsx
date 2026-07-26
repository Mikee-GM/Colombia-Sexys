"use client";

import { useState, useTransition } from "react";
import {
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FilterX,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  getEmployeeReportDashboard,
  getEmployeeReports,
} from "@/lib/actions/employee-reports";
import type {
  ApiUser,
  EmployeeReport,
  EmployeeReportFilters,
  EmployeeReportsPage,
  EmployeeReportSummary,
  EmployeeTolerance,
} from "@/lib/types";
import PageHeader from "@/components/ui/page-header";
import ReportDetailSheet from "./report-detail-sheet";
import {
  categoryLabels,
  formatReportDate,
  originLabels,
  priorityClass,
  priorityLabels,
  statusClass,
  statusLabels,
} from "./report-labels";

type Props = {
  role: "admin" | "jefe";
  initialReports: EmployeeReportsPage;
  initialSummary: EmployeeReportSummary;
  initialTolerance: EmployeeTolerance[];
  admins?: ApiUser[];
};

const emptyFilters: EmployeeReportFilters = { page: 1, limit: 20 };

export default function ReportsDashboard({
  role,
  initialReports,
  initialSummary,
  initialTolerance,
  admins = [],
}: Props) {
  const [reports, setReports] = useState(initialReports);
  const [summary, setSummary] = useState(initialSummary);
  const [tolerance, setTolerance] = useState(initialTolerance);
  const [filters, setFilters] = useState<EmployeeReportFilters>(emptyFilters);
  const [activeFilters, setActiveFilters] = useState<EmployeeReportFilters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"reports" | "tolerance">("reports");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pending, startTransition] = useTransition();

  async function loadList(next: EmployeeReportFilters) {
    setReports(await getEmployeeReports(normalizeDates(next)));
  }

  async function refreshDashboard() {
    const data = await getEmployeeReportDashboard();
    setSummary(data.summary);
    setTolerance(data.tolerance);
  }

  async function refreshAll() {
    try {
      await Promise.all([loadList(activeFilters), refreshDashboard()]);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron actualizar los reportes");
    }
  }

  function applyFilters() {
    const next = { ...filters, page: 1 };
    setFilters(next);
    setActiveFilters(next);
    startTransition(() => {
      void loadList(next).catch((error) => toast.error(error instanceof Error ? error.message : "No se pudieron aplicar los filtros"));
    });
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setActiveFilters(emptyFilters);
    startTransition(() => void loadList(emptyFilters));
  }

  function changePage(page: number) {
    const next = { ...activeFilters, page };
    setFilters((current) => ({ ...current, page }));
    setActiveFilters(next);
    startTransition(() => void loadList(next));
  }

  const employeeOptions = Array.from(
    new Map(
      [
        ...tolerance.map((item) => [item.employeeId, item.employeeName] as const),
        ...reports.items
          .filter((item) => item.employee)
          .map((item) => [item.employeeId, item.employee!.nombreArtistico] as const),
      ],
    ),
  );

  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <PageHeader
          title="Reportes de empleadas"
          description={role === "admin" ? "Bandeja de atención, seguimiento y tolerancia operativa." : "Consulta los reportes y niveles de tolerancia de tu operación."}
        />
        <button disabled={pending} onClick={() => startTransition(() => void refreshAll())} className="flex shrink-0 items-center justify-center gap-2 border border-zinc-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 transition hover:border-[#C5A55A] hover:text-[#C5A55A] disabled:opacity-50">
          <RefreshCw size={15} className={pending ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-800" role="tablist" aria-label="Secciones de reportes">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "reports"}
          onClick={() => setActiveTab("reports")}
          className={`relative shrink-0 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${activeTab === "reports" ? "text-[#C5A55A] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#C5A55A]" : "text-zinc-600 hover:text-zinc-300"}`}
        >
          Reportes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "tolerance"}
          onClick={() => setActiveTab("tolerance")}
          className={`relative shrink-0 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${activeTab === "tolerance" ? "text-[#C5A55A] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#C5A55A]" : "text-zinc-600 hover:text-zinc-300"}`}
        >
          Niveles de tolerancia
        </button>
      </div>

      {activeTab === "reports" && (
        <div className="flex flex-col gap-4 mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiCard label="Casos nuevos" value={summary.newCases} icon={CircleAlert} tone="sky" />
            <KpiCard label="Casos urgentes" value={summary.urgentCases} icon={AlertOctagon} tone="red" />
          </div>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FilterSelect label="Estado" value={filters.status || ""} onChange={(value) => setFilters((current) => ({ ...current, status: value as EmployeeReportFilters["status"] }))} options={statusLabels} />
              <FilterSelect label="Prioridad" value={filters.priority || ""} onChange={(value) => setFilters((current) => ({ ...current, priority: value as EmployeeReportFilters["priority"] }))} options={priorityLabels} />
              <FilterSelect label="Categoría" value={filters.category || ""} onChange={(value) => setFilters((current) => ({ ...current, category: value as EmployeeReportFilters["category"] }))} options={categoryLabels} />
              <FilterSelect label="Origen" value={filters.origin || ""} onChange={(value) => setFilters((current) => ({ ...current, origin: value as EmployeeReportFilters["origin"] }))} options={originLabels} />
              <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Empleada<select value={filters.employeeId || ""} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value || undefined }))} className="block w-full border border-zinc-800 bg-black px-3 py-3 text-sm font-normal normal-case tracking-normal text-zinc-300 outline-none focus:border-[#C5A55A]"><option value="">Todas</option>{employeeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
              <DateFilter label="Desde" value={filters.from || ""} onChange={(value) => setFilters((current) => ({ ...current, from: value || undefined }))} />
              <DateFilter label="Hasta" value={filters.to || ""} onChange={(value) => setFilters((current) => ({ ...current, to: value || undefined }))} />
              <div className="flex items-end gap-2"><button disabled={pending} onClick={applyFilters} className="flex-1 bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-50">Filtrar</button><button title="Limpiar filtros" disabled={pending} onClick={clearFilters} className="border border-zinc-800 p-3 text-zinc-500 hover:text-white"><FilterX size={18} /></button></div>
            </div>
          </section>

          <section className={`overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 transition-opacity ${pending ? "opacity-60" : ""}`}>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-4">Fecha</th><th className="px-5 py-4">Empleada</th><th className="px-5 py-4">Reportante</th><th className="px-5 py-4">Categoría</th><th className="px-5 py-4">Prioridad</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4">Responsable</th></tr></thead>
                <tbody>{reports.items.map((report) => <ReportRow key={report.id} report={report} onClick={() => setSelectedId(report.id)} />)}</tbody>
              </table>
            </div>
            <div className="divide-y divide-zinc-900 md:hidden">{reports.items.map((report) => <ReportCard key={report.id} report={report} onClick={() => setSelectedId(report.id)} />)}</div>
            {!reports.items.length && <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center text-zinc-600"><CircleAlert size={28} /><p className="text-sm">No hay reportes que coincidan con los filtros.</p></div>}
            <footer className="flex flex-col items-center justify-between gap-3 border-t border-zinc-800 px-5 py-4 text-xs text-zinc-600 sm:flex-row"><span>{reports.total} reporte{reports.total === 1 ? "" : "s"} · Página {reports.page} de {Math.max(reports.pages, 1)}</span><div className="flex gap-2"><button disabled={pending || reports.page <= 1} onClick={() => changePage(reports.page - 1)} className="border border-zinc-800 p-2 text-zinc-400 disabled:opacity-30"><ChevronLeft size={16} /></button><button disabled={pending || reports.page >= reports.pages} onClick={() => changePage(reports.page + 1)} className="border border-zinc-800 p-2 text-zinc-400 disabled:opacity-30"><ChevronRight size={16} /></button></div></footer>
          </section>
        </div>
      )}

      {activeTab === "tolerance" && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:max-w-sm">
            <KpiCard label="Sobre tolerancia" value={summary.employeesOverTolerance} icon={ShieldAlert} tone="gold" />
          </div>

          <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <header className="flex flex-col justify-between gap-2 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center">
              <div><h2 className="font-heading text-lg text-white">Tolerancia por empleada</h2><p className="mt-1 text-xs text-zinc-600">Reportes de 90 días y prórrogas de 30 días.</p></div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C5A55A]">Límites: 3 reportes · 5 prórrogas</span>
            </header>
            {tolerance.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left">
                  <thead className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-5 py-3">Empleada</th><th className="px-5 py-3">Reportes 90d</th><th className="px-5 py-3">Prórrogas 30d</th><th className="px-5 py-3">Histórico</th><th className="px-5 py-3">Nivel</th></tr></thead>
                  <tbody>{tolerance.map((item) => { const alerted = item.reportsOverTolerance || item.extensionsOverTolerance; return <tr key={item.employeeId} className="border-b border-zinc-900 text-sm last:border-0"><td className="px-5 py-4 font-medium text-zinc-200">{item.employeeName}</td><td className="px-5 py-4 text-zinc-400"><Meter value={Number(item.reports90Days)} max={item.reportTolerance} alerted={item.reportsOverTolerance} /></td><td className="px-5 py-4 text-zinc-400"><Meter value={Number(item.extensions30Days)} max={item.extensionTolerance} alerted={item.extensionsOverTolerance} /></td><td className="px-5 py-4 text-xs text-zinc-500">{item.reportsHistorical} reportes · {item.extensionsHistorical} prórrogas</td><td className="px-5 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${alerted ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{alerted ? "Revisar" : "Normal"}</span></td></tr>; })}</tbody>
                </table>
              </div>
            ) : <div className="p-8 text-center text-sm text-zinc-600">No hay métricas de empleadas disponibles.</div>}
          </section>
        </div>
      )}

      <ReportDetailSheet reportId={selectedId} open={selectedId !== null} role={role} admins={admins} refreshKey={refreshKey} onOpenChange={(value) => !value && setSelectedId(null)} onChanged={refreshAll} />
    </>
  );
}

function normalizeDates(filters: EmployeeReportFilters): EmployeeReportFilters {
  return {
    ...filters,
    from: filters.from ? `${filters.from}T00:00:00.000` : undefined,
    to: filters.to ? `${filters.to}T23:59:59.999` : undefined,
  };
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof CircleAlert; tone: "sky" | "red" | "gold" }) {
  const colors = tone === "red" ? "text-red-400 bg-red-500/10" : tone === "sky" ? "text-sky-400 bg-sky-500/10" : "text-[#C5A55A] bg-[#C5A55A]/10";
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p><span className={`rounded-xl p-2.5 ${colors}`}><Icon size={19} /></span></div><p className="mt-4 text-4xl font-semibold text-white">{value}</p></div>;
}

function Meter({ value, max, alerted }: { value: number; max: number; alerted: boolean }) {
  return <div className="flex items-center gap-3"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${alerted ? "bg-red-500" : "bg-[#C5A55A]"}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div><span className={alerted ? "font-semibold text-red-300" : ""}>{value}/{max}</span></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Record<string, string> }) {
  return <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="block w-full border border-zinc-800 bg-black px-3 py-3 text-sm font-normal normal-case tracking-normal text-zinc-300 outline-none focus:border-[#C5A55A]"><option value="">Todos</option>{Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="block w-full border border-zinc-800 bg-black px-3 py-[11px] text-sm font-normal normal-case tracking-normal text-zinc-300 outline-none focus:border-[#C5A55A]" /></label>;
}

function ReportRow({ report, onClick }: { report: EmployeeReport; onClick: () => void }) {
  const reporter = report.origin === "cliente" ? report.client?.nombreTelegram || "Cliente" : report.driver?.nombre || "Chofer";
  return <tr onClick={onClick} className="cursor-pointer border-b border-zinc-900 text-sm transition hover:bg-zinc-900/60"><td className="px-5 py-4 text-xs text-zinc-500">{formatReportDate(report.createdAt)}</td><td className="px-5 py-4 font-medium text-zinc-200">{report.employee?.nombreArtistico || "—"}</td><td className="px-5 py-4"><p className="text-zinc-300">{reporter}</p><p className="text-[10px] uppercase tracking-wider text-zinc-600">{originLabels[report.origin]}</p></td><td className="px-5 py-4 text-zinc-400">{categoryLabels[report.category]}</td><td className="px-5 py-4"><Pill className={priorityClass(report.priority)}>{priorityLabels[report.priority]}</Pill></td><td className="px-5 py-4"><Pill className={statusClass(report.status)}>{statusLabels[report.status]}</Pill></td><td className="px-5 py-4 text-xs text-zinc-500">{report.assignedAdmin?.email || "Sin asignar"}</td></tr>;
}

function ReportCard({ report, onClick }: { report: EmployeeReport; onClick: () => void }) {
  return <button onClick={onClick} className="w-full space-y-3 p-4 text-left hover:bg-zinc-900/50"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-zinc-200">{report.employee?.nombreArtistico || "Empleada"}</p><p className="mt-1 text-xs text-zinc-600">{formatReportDate(report.createdAt)}</p></div><Pill className={statusClass(report.status)}>{statusLabels[report.status]}</Pill></div><p className="line-clamp-2 text-sm leading-5 text-zinc-400">{report.description}</p><div className="flex flex-wrap items-center gap-2"><Pill className={priorityClass(report.priority)}>{priorityLabels[report.priority]}</Pill><span className="text-xs text-zinc-600">{originLabels[report.origin]} · {categoryLabels[report.category]}</span></div></button>;
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${className}`}>{children}</span>;
}
