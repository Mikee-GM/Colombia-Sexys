"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import PageHeader from "@/components/ui/page-header";
import InputField from "@/components/ui/InputField";
import {
  createCandidateScreening,
  createScreeningQuestion,
  deleteScreeningQuestion,
  updateScreeningQuestion,
} from "@/lib/actions/candidate-screening";
import { getCandidateScreeningTelegramUrl } from "@/lib/telegram-links";
import type { CandidateScreening, ScreeningQuestion } from "@/lib/types";

const STATUS_LABEL: Record<CandidateScreening["status"], string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
};

const STATUS_CLASS: Record<CandidateScreening["status"], string> = {
  pendiente: "bg-zinc-800 text-zinc-300 border-zinc-700",
  en_progreso: "bg-blue-900/30 text-blue-300 border-blue-800",
  completado: "bg-emerald-900/30 text-emerald-300 border-emerald-800",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CandidatasClient({
  initialScreenings,
  initialQuestions,
}: {
  initialScreenings: CandidateScreening[];
  initialQuestions: ScreeningQuestion[];
}) {
  const [screenings, setScreenings] = useState(initialScreenings);
  const [questions, setQuestions] = useState(initialQuestions);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [savingQuestion, setSavingQuestion] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(
    new Set(initialQuestions.filter((q) => q.active).map((q) => q.id)),
  );
  const [creating, setCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const activeQuestions = questions.filter((q) => q.active);

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim()) return;
    setSavingQuestion(true);
    try {
      const question = await createScreeningQuestion(newQuestionText.trim());
      setQuestions((prev) => [...prev, question]);
      setSelectedQuestionIds((prev) => new Set(prev).add(question.id));
      setNewQuestionText("");
      toast.success("Pregunta agregada al banco");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo agregar la pregunta");
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleToggleQuestionActive = async (question: ScreeningQuestion) => {
    try {
      const updated = await updateScreeningQuestion(question.id, {
        active: !question.active,
      });
      setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la pregunta");
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteScreeningQuestion(id);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Pregunta eliminada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la pregunta");
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateScreening = async () => {
    if (!candidateName.trim()) {
      toast.error("El nombre de la candidata es obligatorio");
      return;
    }
    if (selectedQuestionIds.size === 0) {
      toast.error("Selecciona al menos una pregunta");
      return;
    }
    setCreating(true);
    try {
      const screening = await createCandidateScreening({
        candidateName: candidateName.trim(),
        candidatePhone: candidatePhone.trim() || undefined,
        questionIds: [...selectedQuestionIds],
      });
      setScreenings((prev) => [screening, ...prev]);
      setGeneratedLink(getCandidateScreeningTelegramUrl(screening.token));
      toast.success("Evaluación creada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la evaluación");
    } finally {
      setCreating(false);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCandidateName("");
    setCandidatePhone("");
    setGeneratedLink(null);
    setSelectedQuestionIds(new Set(activeQuestions.map((q) => q.id)));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Candidatas"
          description="Evaluación previa a la contratación, antes de registrar a la modelo por completo"
        />
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-full border border-brand-gold px-5 py-2 text-xs font-semibold uppercase tracking-wider text-brand-gold hover:bg-brand-gold hover:text-black transition-colors"
        >
          Nueva evaluación
        </button>
      </div>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Evaluaciones
        </h2>
        <div className="space-y-2">
          {screenings.map((screening) => (
            <Link
              key={screening.id}
              href={`/admin/candidatas/${screening.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black/30 p-3 hover:border-brand-gold/50 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  {screening.candidateName}
                </p>
                <p className="text-xs text-zinc-500">
                  Creada {formatDate(screening.createdAt)}
                  {screening.promotedEmployeeId && " · Registrada en catálogo"}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${STATUS_CLASS[screening.status]}`}
              >
                {STATUS_LABEL[screening.status]}
              </span>
            </Link>
          ))}
          {screenings.length === 0 && (
            <p className="py-4 text-center text-sm italic text-zinc-600">
              No hay evaluaciones registradas todavía.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Banco de preguntas
        </h2>
        <div className="space-y-2">
          {questions.map((question) => (
            <div
              key={question.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/30 p-3"
            >
              <p className={`text-sm ${question.active ? "text-zinc-200" : "text-zinc-600 line-through"}`}>
                {question.text}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleQuestionActive(question)}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] font-semibold uppercase text-zinc-400 hover:border-brand-gold/50"
                >
                  {question.active ? "Desactivar" : "Activar"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(question.id)}
                  className="rounded-full border border-red-900/50 px-3 py-1 text-[10px] font-semibold uppercase text-red-400 hover:bg-red-950/30"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          {questions.length === 0 && (
            <p className="py-4 text-center text-sm italic text-zinc-600">
              El banco de preguntas está vacío.
            </p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            placeholder="Nueva pregunta..."
            className="flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-gold focus:outline-none"
          />
          <button
            type="button"
            disabled={savingQuestion || !newQuestionText.trim()}
            onClick={handleAddQuestion}
            className="rounded-lg border border-brand-gold px-4 py-2 text-xs font-semibold uppercase text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600"
          >
            {savingQuestion ? "Guardando..." : "Agregar"}
          </button>
        </div>
      </section>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => e.target === e.currentTarget && closeCreateModal()}
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            {!generatedLink ? (
              <>
                <h3 className="mb-4 font-serif text-lg text-zinc-100">Nueva evaluación</h3>
                <div className="space-y-4">
                  <InputField
                    label="Nombre de la candidata"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                  />
                  <InputField
                    label="Teléfono (opcional)"
                    value={candidatePhone}
                    onChange={(e) => setCandidatePhone(e.target.value)}
                  />
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold">
                      Preguntas a incluir
                    </p>
                    <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 p-3">
                      {activeQuestions.map((question) => (
                        <label key={question.id} className="flex items-start gap-2 text-sm text-zinc-300">
                          <input
                            type="checkbox"
                            checked={selectedQuestionIds.has(question.id)}
                            onChange={() => toggleSelected(question.id)}
                            className="mt-1 accent-brand-gold"
                          />
                          {question.text}
                        </label>
                      ))}
                      {activeQuestions.length === 0 && (
                        <p className="text-xs italic text-zinc-600">
                          Agrega preguntas al banco primero.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-full px-5 py-2 text-xs font-semibold uppercase text-zinc-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={handleCreateScreening}
                    className="rounded-full border border-brand-gold px-5 py-2 text-xs font-semibold uppercase text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600"
                  >
                    {creating ? "Creando..." : "Crear evaluación"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-2 font-serif text-lg text-zinc-100">
                  Evaluación creada
                </h3>
                <p className="mb-4 text-sm text-zinc-400">
                  Comparte este enlace con {candidateName} para que responda el cuestionario por Telegram.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black/40 p-3">
                  <code className="flex-1 truncate text-xs text-zinc-300">{generatedLink}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink);
                      toast.success("Enlace copiado");
                    }}
                    className="rounded-full border border-brand-gold px-3 py-1 text-[10px] font-bold uppercase text-brand-gold"
                  >
                    Copiar
                  </button>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-full border border-zinc-700 px-5 py-2 text-xs font-semibold uppercase text-zinc-300 hover:border-brand-gold/50"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
