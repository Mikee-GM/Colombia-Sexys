"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trophy, Users, Car, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/calculations";
import type {
  ChallengeDetail,
  ChallengeMetric,
  ChallengeParticipantType,
  ChallengeStanding,
  ChallengeStatus,
  ChallengeSummary,
  Driver,
  Employee,
} from "@/lib/types";
import { cancelChallenge, createChallenge, getChallenge } from "@/app/admin/retos/actions";

const metricLabels: Record<ChallengeMetric, string> = {
  kpi_score: "Puntaje de desempeño",
  services: "Servicios/viajes completados",
  revenue: "Ingresos generados",
};

const statusLabels: Record<ChallengeStatus, string> = {
  scheduled: "Programado",
  active: "En curso",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

const statusStyles: Record<ChallengeStatus, string> = {
  scheduled: "border-zinc-700 bg-zinc-900 text-zinc-300",
  active: "border-brand-gold/40 bg-brand-gold/10 text-brand-gold",
  finished: "border-green-900/40 bg-green-900/10 text-green-400",
  cancelled: "border-red-900/40 bg-red-900/10 text-red-400",
};

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

interface Props {
  role: "admin" | "jefe";
  initialChallenges: ChallengeSummary[];
  employees: Employee[];
  drivers: Driver[];
}

export default function ChallengesClient({
  role,
  initialChallenges,
  employees,
  drivers,
}: Props) {
  const [challenges, setChallenges] = useState(initialChallenges);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [participantType, setParticipantType] =
    useState<ChallengeParticipantType>("employee");
  const [metric, setMetric] = useState<ChallengeMetric>("kpi_score");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [endsAt, setEndsAt] = useState(() => {
    const inAWeek = new Date();
    inAWeek.setDate(inAWeek.getDate() + 7);
    return toLocalInputValue(inAWeek);
  });

  const roster = participantType === "employee" ? employees : drivers;
  const rosterOptions = useMemo(
    () =>
      roster.map((person) => ({
        id: person.id,
        name: "nombreArtistico" in person ? person.nombreArtistico : person.nombre,
      })),
    [roster],
  );

  const toggleParticipant = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const resetForm = () => {
    setTitle("");
    setParticipantType("employee");
    setMetric("kpi_score");
    setSelectedIds([]);
    const inAWeek = new Date();
    inAWeek.setDate(inAWeek.getDate() + 7);
    setEndsAt(toLocalInputValue(inAWeek));
  };

  const handleCreate = async () => {
    if (title.trim().length < 3) {
      toast.error("Ponle un título al reto (mínimo 3 caracteres)");
      return;
    }
    if (selectedIds.length < 2) {
      toast.error("Selecciona al menos 2 participantes");
      return;
    }
    if (!endsAt) {
      toast.error("Elige una fecha de cierre");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createChallenge({
        title: title.trim(),
        participantType,
        metric,
        participantIds: selectedIds,
        endsAt: new Date(endsAt).toISOString(),
      });
      setChallenges((current) => [
        {
          id: created.id,
          title: created.title,
          participantType: created.participantType,
          metric: created.metric,
          status: created.status,
          startsAt: created.startsAt,
          endsAt: created.endsAt,
          createdByUserId: created.createdByUserId,
          winnerParticipantId: created.winnerParticipantId,
          winnerValue: created.winnerValue,
          participantsCount: created.participantsCount,
          createdAt: created.createdAt,
        },
        ...current,
      ]);
      toast.success("Reto creado");
      resetForm();
      setShowForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible crear el reto");
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: string) => {
    setLoadingDetailId(id);
    try {
      const data = await getChallenge(id);
      setDetail(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cargar el reto");
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("¿Cancelar este reto? Los participantes no recibirán resultado final.")) return;
    try {
      await cancelChallenge(id);
      setChallenges((current) =>
        current.map((challenge) =>
          challenge.id === id ? { ...challenge, status: "cancelled" } : challenge,
        ),
      );
      if (detail?.id === id) setDetail({ ...detail, status: "cancelled" });
      toast.success("Reto cancelado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cancelar el reto");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Retos"
          description="Competencias de desempeño entre empleadas o entre choferes."
        />
        <Button
          onClick={() => setShowForm((visible) => !visible)}
          className="rounded-full bg-brand-gold text-black hover:bg-brand-gold/80"
        >
          {showForm ? "Cerrar" : "Nuevo reto"}
        </Button>
      </div>

      {showForm && (
        <section className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block">Título del reto</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej. Mejor semana de agosto"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-gold"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              <span className="mb-1 block">Cierra el</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-gold"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-2 block text-xs text-zinc-400">Entre</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setParticipantType("employee");
                    setSelectedIds([]);
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
                    participantType === "employee"
                      ? "border-brand-gold bg-brand-gold text-black"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300"
                  }`}
                >
                  <Users size={14} /> Empleadas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParticipantType("driver");
                    setSelectedIds([]);
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
                    participantType === "driver"
                      ? "border-brand-gold bg-brand-gold text-black"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300"
                  }`}
                >
                  <Car size={14} /> Choferes
                </button>
              </div>
            </div>
            <label className="block text-xs text-zinc-400">
              <span className="mb-2 block">Métrica a comparar</span>
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value as ChallengeMetric)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand-gold"
              >
                {Object.entries(metricLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="mb-2 block text-xs text-zinc-400">
              Participantes ({selectedIds.length} seleccionados)
            </span>
            {rosterOptions.length === 0 ? (
              <p className="text-sm italic text-zinc-600">
                No hay {participantType === "employee" ? "empleadas" : "choferes"} disponibles.
              </p>
            ) : (
              <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto rounded-lg border border-zinc-900 p-3">
                {rosterOptions.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggleParticipant(person.id)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      selectedIds.includes(person.id)
                        ? "border-brand-gold bg-brand-gold text-black"
                        : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-brand-gold/50"
                    }`}
                  >
                    {person.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creando..." : "Crear reto"}
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        {challenges.length === 0 ? (
          <p className="py-8 text-center text-sm italic text-zinc-600">
            Todavía no hay retos creados.
          </p>
        ) : (
          challenges.map((challenge) => (
            <article
              key={challenge.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-semibold text-zinc-100">
                      {challenge.title}
                    </h3>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyles[challenge.status]}`}
                    >
                      {statusLabels[challenge.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {challenge.participantType === "employee" ? "Empleadas" : "Choferes"} ·{" "}
                    {metricLabels[challenge.metric]} · {challenge.participantsCount} participantes
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {formatDateTime(challenge.startsAt)} — {formatDateTime(challenge.endsAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDetail(challenge.id)}
                    disabled={loadingDetailId === challenge.id}
                  >
                    {loadingDetailId === challenge.id ? "Cargando..." : "Ver resultados"}
                  </Button>
                  {(challenge.status === "scheduled" || challenge.status === "active") && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleCancel(challenge.id)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-semibold text-zinc-100">{detail.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {metricLabels[detail.metric]} ·{" "}
                  <span className={`font-semibold ${statusStyles[detail.status]}`}>
                    {statusLabels[detail.status]}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-900 hover:text-white"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {detail.standings.map((standing: ChallengeStanding) => (
                <div
                  key={standing.participantId}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    standing.position === 1
                      ? "border-brand-gold/40 bg-brand-gold/5"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-zinc-300">
                      {standing.position}
                    </span>
                    <span className="text-sm text-zinc-200">{standing.name}</span>
                    {standing.position === 1 && detail.status === "finished" && (
                      <Trophy size={14} className="text-brand-gold" />
                    )}
                  </div>
                  <span className="font-mono text-sm font-semibold text-zinc-100">
                    {standing.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
