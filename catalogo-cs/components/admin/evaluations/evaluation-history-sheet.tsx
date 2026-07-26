"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getAttemptDetailAction, getUserAttemptsAction } from "@/lib/actions/regulations";
import { CheckCircle2, XCircle, FileText, ChevronDown, ChevronUp, Loader2, Award, Calendar, HelpCircle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  userId: string | null;
  workerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function EvaluationHistorySheet({
  userId,
  workerName,
  open,
  onOpenChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [attemptsData, setAttemptsData] = useState<any>(null);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [attemptDetails, setAttemptDetails] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open && userId) {
      setLoading(true);
      setAttemptsData(null);
      setExpandedAttemptId(null);
      setAttemptDetails({});

      getUserAttemptsAction(userId).then((res) => {
        setLoading(false);
        if (res.success && res.data) {
          setAttemptsData(res.data);
        } else {
          toast.error(res.error || "No se pudo obtener el historial de evaluaciones");
        }
      });
    }
  }, [open, userId]);

  const toggleExpandAttempt = async (attemptId: string) => {
    if (expandedAttemptId === attemptId) {
      setExpandedAttemptId(null);
      return;
    }

    setExpandedAttemptId(attemptId);

    if (!attemptDetails[attemptId]) {
      setLoadingDetails((prev) => ({ ...prev, [attemptId]: true }));
      const res = await getAttemptDetailAction(attemptId);
      setLoadingDetails((prev) => ({ ...prev, [attemptId]: false }));

      if (res.success && res.data) {
        setAttemptDetails((prev) => ({ ...prev, [attemptId]: res.data }));
      } else {
        toast.error(res.error || "No se pudo cargar el desglose del intento");
      }
    }
  };

  const displayName = workerName || attemptsData?.user?.nombreCompleto || attemptsData?.employee?.nombreArtistico || "Colaborador";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl bg-zinc-950 text-white border-zinc-800 overflow-y-auto customized-scrollbar p-6">
        <SheetHeader className="pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-[#C5A55A]">
            <Award className="w-5 h-5" />
            <SheetTitle className="text-xl font-bold text-white">
              Historial de Exámenes
            </SheetTitle>
          </div>
          <SheetDescription className="text-sm text-zinc-400">
            Cuestionarios e intentos de evaluación de <span className="font-semibold text-white">{displayName}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#C5A55A]" />
              <p className="text-sm">Cargando historial de intentos...</p>
            </div>
          ) : !attemptsData || !attemptsData.attempts || attemptsData.attempts.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-2xl p-6">
              <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-300">Sin intentos registrados</p>
              <p className="text-xs text-zinc-500 mt-1">
                Este trabajador aún no ha presentado cuestionarios del reglamento.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs text-zinc-400 px-1">
                <span>Total de intentos: <b>{attemptsData.attempts.length}</b></span>
                {attemptsData.user?.rol && (
                  <span className="capitalize px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[#C5A55A]">
                    Rol: {attemptsData.user.rol}
                  </span>
                )}
              </div>

              {attemptsData.attempts.map((attempt: any) => {
                const isPassed = attempt.score >= 80;
                const isExpanded = expandedAttemptId === attempt.id;
                const detail = attemptDetails[attempt.id];
                const isDetailLoading = loadingDetails[attempt.id];

                return (
                  <div
                    key={attempt.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all duration-200 hover:border-zinc-700"
                  >
                    {/* Header del Intento */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">
                            Intento #{attempt.attemptNumber}
                          </span>
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                              isPassed
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/10 text-red-400 border border-red-500/30"
                            }`}
                          >
                            {isPassed ? "Aprobado" : "Reprobado"} ({attempt.score}%)
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                            {new Date(attempt.completedAt || attempt.startedAt).toLocaleString("es-MX", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>
                            Aciertos: <b>{attempt.correctAnswers} / {attempt.totalQuestions}</b>
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleExpandAttempt(attempt.id)}
                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-white hover:border-[#C5A55A] transition-all"
                      >
                        {isExpanded ? (
                          <>
                            Ocultar <ChevronUp className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            Ver Desglose <ChevronDown className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>

                    {/* Desglose Pregunta por Pregunta */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800 bg-zinc-950/80 p-4 space-y-4 animate-in fade-in duration-300">
                        {isDetailLoading ? (
                          <div className="flex items-center justify-center py-6 gap-2 text-xs text-zinc-400">
                            <Loader2 className="w-4 h-4 animate-spin text-[#C5A55A]" />
                            Cargando preguntas y respuestas...
                          </div>
                        ) : detail && detail.answers && detail.answers.length > 0 ? (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[#C5A55A] flex items-center gap-1.5">
                              <HelpCircle className="w-4 h-4" /> Desglose de Respuestas
                            </h4>

                            {detail.answers.map((ans: any, idx: number) => (
                              <div
                                key={ans.answerId || idx}
                                className="border border-zinc-800 rounded-xl p-3 bg-zinc-900/60 space-y-2"
                              >
                                <p className="text-sm font-medium text-white flex items-start gap-2">
                                  <span className="text-[#C5A55A] font-bold shrink-0">{idx + 1}.</span>
                                  {ans.questionText}
                                </p>

                                <div className="pl-5 space-y-1.5 text-xs">
                                  {ans.isCorrect ? (
                                    <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                                      <span>Respuesta Correcta: <b>{ans.selectedOptionText}</b></span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
                                        <XCircle className="w-4 h-4 shrink-0" />
                                        <span>Seleccionó: <b>{ans.selectedOptionText}</b></span>
                                      </div>
                                      {ans.correctOptionText && (
                                        <div className="flex items-center gap-2 text-[#C5A55A] bg-[#C5A55A]/10 border border-[#C5A55A]/20 px-3 py-1.5 rounded-lg">
                                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                                          <span>Respuesta Correcta era: <b>{ans.correctOptionText}</b></span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500 text-center py-3">
                            No se encontraron detalles para este intento.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
