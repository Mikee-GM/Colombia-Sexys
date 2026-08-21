"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";
import {
  closeConductReport,
  createSanction,
  getDossier,
  resolveAppeal,
  revokeSanction,
  type ConductReport,
  type DisciplinarySanction,
  type Dossier,
  type PersonType,
  type RatingAppeal,
  type RatingDirection,
} from "@/lib/actions/discipline";
import PromptDialog from "@/components/ui/PromptDialog";

const personLabels: Record<PersonType, string> = {
  client: "Cliente",
  employee: "Empleada",
  driver: "Chofer",
  boss: "Jefe de Zona",
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
  initialAppeals?: RatingAppeal[];
};

export default function DisciplineDashboard({
  role,
  initialReports,
  initialSanctions,
  initialAppeals = [],
}: Props) {
  const [reports] = useState(initialReports);
  const [sanctions] = useState(initialSanctions);
  const [appeals, setAppeals] = useState(initialAppeals);
  const [personFilter, setPersonFilter] = useState<"all" | PersonType>("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | RatingDirection>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [selected, setSelected] = useState<Dossier | null>(null);
  const [pending, startTransition] = useTransition();

  // Estados para diálogos personalizados
  const [closeReportData, setCloseReportData] = useState<{
    report: ConductReport;
    outcome: "confirmado" | "no_sustentado";
  } | null>(null);

  const [sanctionData, setSanctionData] = useState<{
    dossier: Dossier;
    type: "suspension" | "permanent_ban";
    days?: number;
  } | null>(null);

  const [revokeData, setRevokeData] = useState<{
    item: DisciplinarySanction;
    dossier: Dossier;
  } | null>(null);

  const [customSuspensionDossier, setCustomSuspensionDossier] = useState<Dossier | null>(null);
  const [customStartsAt, setCustomStartsAt] = useState("");
  const [customEndsAt, setCustomEndsAt] = useState("");
  const [customReason, setCustomReason] = useState("");

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

  function handleConfirmClose(resolution: string) {
    if (!closeReportData) return;
    const { report, outcome } = closeReportData;
    startTransition(async () => {
      try {
        await closeConductReport(report.id, outcome, resolution);
        toast.success("Reporte cerrado exitosamente");
        setCloseReportData(null);
        window.location.reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo cerrar el reporte");
      }
    });
  }

  function handleConfirmSanction(reason: string) {
    if (!sanctionData) return;
    const { dossier, type, days } = sanctionData;
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
          reason,
          startsAt: startsAt.toISOString(),
          endsAt,
        });
        toast.success("Sanción aplicada");
        setSanctionData(null);
        setSelected(await getDossier(dossier.subjectType, dossier.subjectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo aplicar la sanción");
      }
    });
  }

  function handleConfirmRevoke(reason: string) {
    if (!revokeData) return;
    const { item, dossier } = revokeData;
    startTransition(async () => {
      try {
        await revokeSanction(item.id, reason);
        toast.success("Sanción revocada");
        setRevokeData(null);
        setSelected(await getDossier(dossier.subjectType, dossier.subjectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo revocar la sanción");
      }
    });
  }

  function handleConfirmCustomSuspension() {
    if (!customSuspensionDossier || !customStartsAt || !customEndsAt || customReason.trim().length < 3) return;
    startTransition(async () => {
      try {
        await createSanction({
          subjectType: customSuspensionDossier.subjectType,
          subjectId: customSuspensionDossier.subjectId,
          type: "suspension",
          reason: customReason.trim(),
          startsAt: new Date(customStartsAt).toISOString(),
          endsAt: new Date(customEndsAt).toISOString(),
        });
        toast.success("Suspensión programada");
        const subjectType = customSuspensionDossier.subjectType;
        const subjectId = customSuspensionDossier.subjectId;
        setCustomSuspensionDossier(null);
        setCustomStartsAt("");
        setCustomEndsAt("");
        setCustomReason("");
        setSelected(await getDossier(subjectType, subjectId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo programar la suspensión");
      }
    });
  }

  function resolveAppealDecision(appeal: RatingAppeal, decision: "upheld" | "overturned") {
    startTransition(async () => {
      try {
        await resolveAppeal(appeal.id, decision);
        setAppeals((prev) => prev.filter((item) => item.id !== appeal.id));
        toast.success(decision === "upheld" ? "Calificación confirmada" : "Calificación anulada");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo resolver la apelación");
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

      {role === "admin" && appeals.length > 0 && (
        <section className="border border-[#C5A55A]/40 bg-[#050505]">
          <div className="border-b border-zinc-800 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#C5A55A]">Apelaciones pendientes</p>
            <p className="mt-1 text-xs text-zinc-500">Estas calificaciones no cuentan en el promedio mientras se revisan.</p>
          </div>
          <div className="divide-y divide-zinc-900">
            {appeals.map((appeal) => (
              <article key={appeal.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#E8D5A3]">{"★".repeat(appeal.stars)}{"☆".repeat(5 - appeal.stars)}</span>
                    <span className="text-xs text-zinc-500">{directionLabels[appeal.direction]}</span>
                  </div>
                  {appeal.comment && <p className="mt-2 text-sm text-zinc-400">Comentario original: &ldquo;{appeal.comment}&rdquo;</p>}
                  {appeal.appealReason && <p className="mt-1 text-sm text-zinc-300">Motivo de la apelación: &ldquo;{appeal.appealReason}&rdquo;</p>}
                  <p className="mt-2 text-[11px] text-zinc-600">{new Date(appeal.createdAt).toLocaleString("es-MX")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Action onClick={() => resolveAppealDecision(appeal, "upheld")} disabled={pending}>Confirmar calificación</Action>
                  <Action onClick={() => resolveAppealDecision(appeal, "overturned")} disabled={pending}>Anular calificación</Action>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="border border-zinc-800 bg-[#050505]">
        <div className="grid gap-3 border-b border-zinc-800 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <Filter value={personFilter} onChange={(value) => setPersonFilter(value as typeof personFilter)}>
            <option value="all">Todas las personas</option><option value="client">Clientes</option><option value="employee">Empleadas</option><option value="driver">Choferes</option><option value="boss">Jefes de Zona</option>
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
                {(role === "admin" || role === "jefe") && report.status !== "cerrado" && (
                  <>
                    <Action
                      onClick={() => setCloseReportData({ report, outcome: "confirmado" })}
                      disabled={pending}
                    >
                      Confirmar
                    </Action>
                    <Action
                      onClick={() => setCloseReportData({ report, outcome: "no_sustentado" })}
                      disabled={pending}
                    >
                      No sustentado
                    </Action>
                  </>
                )}
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
              {[1, 3, 7, 30].map((days) => (
                <Action
                  key={days}
                  onClick={() => setSanctionData({ dossier: selected, type: "suspension", days })}
                  disabled={pending}
                >
                  Suspender {days} {days === 1 ? "día" : "días"}
                </Action>
              ))}
              <Action
                onClick={() => {
                  setCustomSuspensionDossier(selected);
                  setCustomStartsAt(new Date().toISOString().slice(0, 16));
                  setCustomEndsAt("");
                  setCustomReason("");
                }}
                disabled={pending}
              >
                Suspensión personalizada
              </Action>
              <button
                onClick={() => setSanctionData({ dossier: selected, type: "permanent_ban" })}
                disabled={pending}
                className="border border-red-700 px-3 py-2 text-xs text-red-300 hover:bg-red-950 disabled:opacity-40"
              >
                Baneo permanente
              </button>
            </div>
          )}
          <div className="mt-5 space-y-2">
            {selected.sanctions.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 p-3 text-xs">
                <span className="text-zinc-300">{item.type === "suspension" ? "Suspensión" : "Baneo permanente"} · {item.status}</span>
                {role === "admin" && item.status === "active" && (
                  <button
                    disabled={pending}
                    onClick={() => setRevokeData({ item, dossier: selected })}
                    className="text-[#C5A55A] hover:text-[#E8D5A3]"
                  >
                    Revocar
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 🟢 DIÁLOGO PERSONALIZADO: CERRAR REPORTE (CONFIRMAR O NO SUSTENTADO) */}
      <PromptDialog
        isOpen={!!closeReportData}
        title={closeReportData?.outcome === "confirmado" ? "Confirmar Reporte de Conducta" : "Descartar Reporte (No sustentado)"}
        description={`Escribe la resolución o dictamen oficial para ${closeReportData?.outcome === "confirmado" ? "dar por verídico este reporte y proceder conforme a reglamento" : "descartar este reporte por falta de sustento"}.`}
        placeholder="Ej: Se revisó la evidencia fotográfica y se corroboró el incumplimiento del protocolo..."
        labelConfirm={closeReportData?.outcome === "confirmado" ? "Confirmar Reporte" : "Cerrar como No Sustentado"}
        variant={closeReportData?.outcome === "confirmado" ? "gold" : "blue"}
        minLength={3}
        maxLength={2000}
        isLoading={pending}
        onConfirm={handleConfirmClose}
        onCancel={() => setCloseReportData(null)}
      />

      {/* 🔴 DIÁLOGO PERSONALIZADO: APLICAR SANCIÓN */}
      <PromptDialog
        isOpen={!!sanctionData}
        title={
          sanctionData?.type === "suspension"
            ? `Aplicar Suspensión (${sanctionData.days} ${sanctionData.days === 1 ? "día" : "días"})`
            : "Aplicar Baneo Permanente"
        }
        description="Ingresa el motivo que justificará esta sanción disciplinaria en el expediente."
        placeholder="Ej: Falta reiterada en el protocolo de atención y quejas formales de clientes..."
        labelConfirm="Confirmar Sanción"
        variant="red"
        minLength={3}
        maxLength={2000}
        isLoading={pending}
        onConfirm={handleConfirmSanction}
        onCancel={() => setSanctionData(null)}
      />

      {/* 🟢 DIÁLOGO PERSONALIZADO: REVOCAR SANCIÓN */}
      <PromptDialog
        isOpen={!!revokeData}
        title="Revocar Sanción Disciplinaria"
        description="Ingresa el motivo por el cual se revoca la sanción (se registrará en el expediente)."
        placeholder="Ej: Cumplimiento de compromisos acordados / aclaración de malentendido..."
        labelConfirm="Confirmar Revocación"
        variant="emerald"
        minLength={3}
        maxLength={1000}
        isLoading={pending}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setRevokeData(null)}
      />

      {/* ⏱️ MODAL PERSONALIZADO: SUSPENSIÓN PERSONALIZADA */}
      {customSuspensionDossier && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0c0c0c] p-6 shadow-2xl">
            <h3 className="font-heading text-lg font-bold text-white">Suspensión Personalizada</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Define el periodo exacto y el motivo de la suspensión para este expediente.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 font-bold">Fecha y hora de inicio</label>
                <input
                  type="datetime-local"
                  value={customStartsAt}
                  onChange={(e) => setCustomStartsAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-[#C5A55A] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-zinc-300 font-bold">Fecha y hora de finalización</label>
                <input
                  type="datetime-local"
                  value={customEndsAt}
                  onChange={(e) => setCustomEndsAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-[#C5A55A] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-zinc-300 font-bold">Motivo de la suspensión</label>
                <textarea
                  rows={3}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Ej: Suspensión por acuerdo mutuo hasta evaluación..."
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-white focus:border-[#C5A55A] focus:outline-none"
                />
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span
                    className={`flex items-center gap-1 font-medium ${
                      customReason.trim().length >= 3 ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {customReason.trim().length >= 3 ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Mínimo alcanzado
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3" /> Mínimo 3 caracteres ({3 - customReason.trim().length} restantes)
                      </>
                    )}
                  </span>
                  <span className="text-zinc-500 font-mono">{customReason.trim().length} caracteres</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5 border-t border-zinc-800/60 pt-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => setCustomSuspensionDossier(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !customStartsAt ||
                  !customEndsAt ||
                  customReason.trim().length < 3 ||
                  pending
                }
                onClick={handleConfirmCustomSuspension}
                className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center gap-1.5"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando...
                  </>
                ) : (
                  "Aplicar Suspensión"
                )}
              </button>
            </div>
          </div>
        </div>
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
