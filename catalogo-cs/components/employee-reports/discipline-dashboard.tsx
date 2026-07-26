"use client";

import { useMemo, useState, useTransition } from "react";
import { ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";
import {
  closeConductReport,
  createSanction,
  getDossier,
  revokeSanction,
  type ConductReport,
  type DisciplinarySanction,
  type Dossier,
  type PersonType,
  type RatingDirection,
} from "@/lib/actions/discipline";

const personLabels: Record<PersonType, string> = {
  client: "Cliente",
  employee: "Empleada",
  driver: "Chofer",
};
const directionLabels: Record<RatingDirection, string> = {
  client_to_employee: "Cliente a empleada",
  employee_to_client: "Empleada a cliente",
  driver_to_employee: "Chofer a empleada",
  employee_to_driver: "Empleada a chofer",
};

type Props = {
  role: "admin" | "jefe";
  initialReports: ConductReport[];
  initialSanctions: DisciplinarySanction[];
};

export default function DisciplineDashboard({
  role,
  initialReports,
  initialSanctions,
}: Props) {
  const [reports] = useState(initialReports);
  const [sanctions] = useState(initialSanctions);
  const [personFilter, setPersonFilter] = useState<"all" | PersonType>("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | RatingDirection>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [selected, setSelected] = useState<Dossier | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      reports.filter(
        (report) =>
          (personFilter === "all" || report.subjectType === personFilter) &&
          (directionFilter === "all" || report.direction === directionFilter) &&
          (statusFilter === "all" || report.status === statusFilter) &&
          (categoryFilter === "all" || report.category === categoryFilter) &&
          (priorityFilter === "all" || report.priority === priorityFilter) &&
          (outcomeFilter === "all" || report.outcome === outcomeFilter),
      ),
    [categoryFilter, directionFilter, outcomeFilter, personFilter, priorityFilter, reports, statusFilter],
  );

  function openDossier(report: ConductReport) {
    startTransition(async () => {
      try {
        setSelected(await getDossier(report.subjectType, report.subjectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo cargar el expediente");
      }
    });
  }

  function close(report: ConductReport, outcome: "confirmado" | "no_sustentado") {
    const resolution = window.prompt("Escribe el resultado de la revisión");
    if (!resolution || resolution.trim().length < 3) return;
    startTransition(async () => {
      try {
        await closeConductReport(report.id, outcome, resolution.trim());
        toast.success("Reporte cerrado");
        window.location.reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo cerrar el reporte");
      }
    });
  }

  function sanction(dossier: Dossier, type: "suspension" | "permanent_ban", days?: number) {
    const reason = window.prompt("Motivo de la sanción");
    if (!reason || reason.trim().length < 3) return;
    const startsAt = new Date();
    const endsAt = days
      ? new Date(startsAt.getTime() + days * 86_400_000).toISOString()
      : undefined;
    startTransition(async () => {
      try {
        await createSanction({
          subjectType: dossier.subjectType,
          subjectId: dossier.subjectId,
          type,
          reason: reason.trim(),
          startsAt: startsAt.toISOString(),
          endsAt,
        });
        toast.success("Sanción aplicada");
        setSelected(await getDossier(dossier.subjectType, dossier.subjectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo aplicar la sanción");
      }
    });
  }

  function customSuspension(dossier: Dossier) {
    const startsAt = window.prompt("Inicio en formato ISO", new Date().toISOString());
    const endsAt = window.prompt("Fin en formato ISO");
    const reason = window.prompt("Motivo de la suspensión");
    if (!startsAt || !endsAt || !reason || reason.trim().length < 3) return;
    startTransition(async () => {
      try {
        await createSanction({
          subjectType: dossier.subjectType,
          subjectId: dossier.subjectId,
          type: "suspension",
          reason: reason.trim(),
          startsAt,
          endsAt,
        });
        toast.success("Suspensión programada");
        setSelected(await getDossier(dossier.subjectType, dossier.subjectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo programar la suspensión");
      }
    });
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#C5A55A]">Control operativo</p>
        <h1 className="mt-2 font-heading text-3xl text-white">Panel disciplinario</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Calificaciones, reportes y sanciones conservan su dirección para identificar el origen de cada incidencia.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Reportes abiertos" value={reports.filter((report) => report.status !== "cerrado").length} />
        <Metric label="Confirmados" value={reports.filter((report) => report.outcome === "confirmado").length} />
        <Metric label="Sanciones activas" value={sanctions.filter((item) => item.status === "active").length} />
      </section>

      <section className="border border-zinc-800 bg-[#050505]">
        <div className="grid gap-3 border-b border-zinc-800 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <Filter value={personFilter} onChange={(value) => setPersonFilter(value as typeof personFilter)}>
            <option value="all">Todas las personas</option><option value="client">Clientes</option><option value="employee">Empleadas</option><option value="driver">Choferes</option>
          </Filter>
          <Filter value={directionFilter} onChange={(value) => setDirectionFilter(value as typeof directionFilter)}>
            <option value="all">Todas las direcciones</option>
            {Object.entries(directionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Filter>
          <Filter value={statusFilter} onChange={setStatusFilter}>
            <option value="all">Todos los estados</option><option value="nuevo">Nuevo</option><option value="en_revision">En revisión</option><option value="cerrado">Cerrado</option>
          </Filter>
          <Filter value={categoryFilter} onChange={setCategoryFilter}>
            <option value="all">Todas las categorías</option><option value="trato_inadecuado">Trato inadecuado</option><option value="demora_impuntualidad">Demora o impuntualidad</option><option value="incumplimiento">Incumplimiento</option><option value="cobro">Cobro</option><option value="seguridad">Seguridad</option><option value="otro">Otro</option>
          </Filter>
          <Filter value={priorityFilter} onChange={setPriorityFilter}>
            <option value="all">Todas las prioridades</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
          </Filter>
          <Filter value={outcomeFilter} onChange={setOutcomeFilter}>
            <option value="all">Todos los resultados</option><option value="confirmado">Confirmado</option><option value="no_sustentado">No sustentado</option>
          </Filter>
        </div>
        <div className="divide-y divide-zinc-900">
          {filtered.map((report) => (
            <article key={report.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="border border-[#C5A55A]/30 px-2 py-1 text-[10px] uppercase tracking-wider text-[#E8D5A3]">{directionLabels[report.direction]}</span>
                  <span className="text-xs text-zinc-500">{report.category.replaceAll("_", " ")}</span>
                  <span className="text-xs text-zinc-600">{report.priority}</span>
                </div>
                <p className="mt-3 text-sm text-zinc-300">{report.description}</p>
                <p className="mt-2 text-[11px] text-zinc-600">{personLabels[report.subjectType]} · {new Date(report.createdAt).toLocaleString("es-MX")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Action onClick={() => openDossier(report)} disabled={pending}>Ver expediente</Action>
                {role === "admin" && report.status !== "cerrado" && <><Action onClick={() => close(report, "confirmado")} disabled={pending}>Confirmar</Action><Action onClick={() => close(report, "no_sustentado")} disabled={pending}>No sustentado</Action></>}
              </div>
            </article>
          ))}
          {!filtered.length && <p className="p-10 text-center text-sm text-zinc-600">No hay resultados para estos filtros.</p>}
        </div>
      </section>

      {selected && (
        <section className="border border-[#C5A55A]/30 bg-[#050505] p-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[10px] uppercase tracking-[0.2em] text-[#C5A55A]">Expediente individual</p><h2 className="mt-1 font-heading text-2xl text-white">{personLabels[selected.subjectType]}</h2><p className="mt-1 break-all text-xs text-zinc-600">{selected.subjectId}</p></div>
            <button onClick={() => setSelected(null)} className="text-xs text-zinc-500 hover:text-white">Cerrar</button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selected.ratings.map((rating) => (
              <div key={rating.direction} className="border border-zinc-800 p-4">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">{directionLabels[rating.direction]}</p>
                <p className="mt-2 flex items-center gap-2 text-xl text-[#E8D5A3]"><Star size={15} className="fill-[#C5A55A] text-[#C5A55A]" />{Number(rating.average).toFixed(2)}</p>
                <p className="mt-1 text-xs text-zinc-600">{rating.count} valoraciones</p>
              </div>
            ))}
            {!selected.ratings.length && <p className="text-sm text-zinc-600">Sin calificaciones para este expediente.</p>}
          </div>
          {role === "admin" && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-800 pt-5">
              {[1, 3, 7, 30].map((days) => <Action key={days} onClick={() => sanction(selected, "suspension", days)} disabled={pending}>Suspender {days} {days === 1 ? "día" : "días"}</Action>)}
              <Action onClick={() => customSuspension(selected)} disabled={pending}>Suspensión personalizada</Action>
              <button onClick={() => sanction(selected, "permanent_ban")} disabled={pending} className="border border-red-700 px-3 py-2 text-xs text-red-300 hover:bg-red-950 disabled:opacity-40">Baneo permanente</button>
            </div>
          )}
          <div className="mt-5 space-y-2">
            {selected.sanctions.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 p-3 text-xs">
                <span className="text-zinc-300">{item.type === "suspension" ? "Suspensión" : "Baneo permanente"} · {item.status}</span>
                {role === "admin" && item.status === "active" && <button disabled={pending} onClick={() => { const reason = window.prompt("Motivo de revocación"); if (!reason) return; startTransition(async () => { await revokeSanction(item.id, reason); setSelected(await getDossier(selected.subjectType, selected.subjectId)); }); }} className="text-[#C5A55A] hover:text-[#E8D5A3]">Revocar</button>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border border-zinc-800 bg-[#050505] p-4"><ShieldAlert size={17} className="text-[#C5A55A]" aria-hidden="true" /><p className="mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>;
}
function Filter({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-300 outline-none focus:border-[#C5A55A]">{children}</select>;
}
function Action({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="border border-[#C5A55A]/50 px-3 py-2 text-xs text-[#E8D5A3] hover:bg-[#C5A55A] hover:text-black disabled:opacity-40">{children}</button>;
}
