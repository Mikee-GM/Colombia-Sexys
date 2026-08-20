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
  const [newQuestionOptions, setNewQuestionOptions] = useState<Array<{ text: string; isCorrect: boolean }>>([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ]);
  const [includeOptionsInNew, setIncludeOptionsInNew] = useState(false);
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

  const handleAddNewOptionField = () => {
    setNewQuestionOptions((prev) => [...prev, { text: "", isCorrect: false }]);
  };

  const handleRemoveNewOptionField = (index: number) => {
    setNewQuestionOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNewOptionChange = (index: number, text: string) => {
    setNewQuestionOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, text } : opt)),
    );
  };

  const handleSetCorrectNewOption = (index: number) => {
    setNewQuestionOptions((prev) =>
      prev.map((opt, i) => ({ ...opt, isCorrect: i === index })),
    );
  };

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim()) return;

    let optionsToSave: Array<{ text: string; isCorrect: boolean }> | undefined = undefined;
    if (includeOptionsInNew) {
      const validOptions = newQuestionOptions.filter((o) => o.text.trim().length > 0);
      if (validOptions.length < 2) {
        toast.error("Debes ingresar al menos 2 opciones de respuesta válidas");
        return;
      }
      const hasCorrect = validOptions.some((o) => o.isCorrect);
      if (!hasCorrect) {
        validOptions[0].isCorrect = true;
      }
      optionsToSave = validOptions;
    }

    setSavingQuestion(true);
    try {
      const question = await createScreeningQuestion({
        text: newQuestionText.trim(),
        options: optionsToSave,
      });
      setQuestions((prev) => [...prev, question]);
      setSelectedQuestionIds((prev) => new Set(prev).add(question.id));
      setNewQuestionText("");
      setNewQuestionOptions([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
      ]);
      setIncludeOptionsInNew(false);
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
            Banco de preguntas ({questions.length})
          </h2>
        </div>

        <div className="space-y-4">
          {questions.map((question, qIdx) => (
            <div
              key={question.id}
              className="rounded-2xl border border-zinc-800 bg-black/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-mono font-bold text-[#C5A55A] mt-0.5">
                    #{qIdx + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${question.active ? "text-zinc-100" : "text-zinc-600 line-through"}`}>
                      {question.text}
                    </p>
                    {question.options && question.options.length > 0 && (
                      <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                        Opción múltiple ({question.options.length} opciones)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleQuestionActive(question)}
                    className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] font-semibold uppercase text-zinc-400 hover:border-brand-gold/50 transition-colors"
                  >
                    {question.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(question.id)}
                    className="rounded-full border border-red-900/50 px-3 py-1 text-[10px] font-semibold uppercase text-red-400 hover:bg-red-950/30 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Render de opciones si tiene */}
              {question.options && question.options.length > 0 && (
                <div className="pl-6 pt-2 border-t border-zinc-900/80 space-y-1.5">
                  <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                    Opciones de Respuesta:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {question.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                          opt.isCorrect
                            ? "border-emerald-500/50 bg-emerald-950/20 text-emerald-300"
                            : "border-zinc-800 bg-zinc-950 text-zinc-400"
                        }`}
                      >
                        <span className="text-[10px] font-bold">
                          {opt.isCorrect ? "✓" : "•"}
                        </span>
                        <span className="truncate">{opt.text}</span>
                        {opt.isCorrect && (
                          <span className="ml-auto text-[9px] font-bold uppercase text-emerald-400">
                            Correcta
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {questions.length === 0 && (
            <p className="py-6 text-center text-sm italic text-zinc-600">
              El banco de preguntas está vacío.
            </p>
          )}
        </div>

        {/* Formulario para agregar nueva pregunta con soporte de opciones */}
        <div className="mt-6 border-t border-zinc-800/80 pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-[#C5A55A]">
              Agregar Nueva Pregunta al Banco
            </label>
            <button
              type="button"
              onClick={() => setIncludeOptionsInNew(!includeOptionsInNew)}
              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                includeOptionsInNew
                  ? "bg-[#C5A55A]/20 border-[#C5A55A] text-[#E8D5A3]"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {includeOptionsInNew ? "✓ Con Opciones de Respuesta" : "+ Agregar Opciones de Respuesta"}
            </button>
          </div>

          <div className="space-y-3">
            <input
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              placeholder="Escribe la pregunta para la candidata..."
              className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
            />

            {includeOptionsInNew && (
              <div className="p-4 rounded-2xl border border-zinc-800 bg-black/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                    Opciones de Respuesta (Marca la opción correcta si aplica)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddNewOptionField}
                    className="text-xs text-[#C5A55A] hover:underline font-bold"
                  >
                    + Añadir otra opción
                  </button>
                </div>

                <div className="space-y-2.5">
                  {newQuestionOptions.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="correct-new-question"
                        checked={opt.isCorrect}
                        onChange={() => handleSetCorrectNewOption(oIdx)}
                        className="w-4 h-4 text-[#C5A55A] bg-zinc-950 border-zinc-700 focus:ring-[#C5A55A] cursor-pointer"
                        title="Marcar como respuesta correcta"
                      />
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => handleNewOptionChange(oIdx, e.target.value)}
                        placeholder={`Opción ${oIdx + 1}...`}
                        className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-[#C5A55A] focus:outline-none"
                      />
                      {newQuestionOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveNewOptionField(oIdx)}
                          className="text-zinc-500 hover:text-red-400 text-xs px-2 py-1 font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={savingQuestion || !newQuestionText.trim()}
                onClick={handleAddQuestion}
                className="rounded-full bg-[#C5A55A] text-black px-6 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#D4AF37] transition-all disabled:opacity-50"
              >
                {savingQuestion ? "Guardando..." : "Guardar Pregunta"}
              </button>
            </div>
          </div>
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
