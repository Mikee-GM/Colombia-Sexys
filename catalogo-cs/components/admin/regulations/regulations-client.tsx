"use client";

import { useState, useEffect } from "react";
import { publishRegulationAction, getCurrentRegulationAction, PublishRegulationData } from "@/lib/actions/regulations";
import PageHeader from "@/components/ui/page-header";
import InputField from "@/components/ui/InputField";
import TextareaField from "@/components/ui/TextareaField";
import SelectField from "@/components/ui/SelectField";
import { toast } from "sonner";
import { PlusCircle, Trash2, Save, Eye } from "lucide-react";

export default function RegulationsClient() {
  const [targetRole, setTargetRole] = useState<"empleada" | "chofer" | "jefe">("empleada");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [passingScore, setPassingScore] = useState(80);
  const [questions, setQuestions] = useState<PublishRegulationData["questions"]>([
    { text: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }], groupKey: "" }
  ]);
  const [requireRetake, setRequireRetake] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(false);
  const [currentRegulation, setCurrentRegulation] = useState<any>(null);

  // Cargar reglamento actual cuando cambia el rol
  useEffect(() => {
    async function loadCurrent() {
      setIsLoadingCurrent(true);
      setCurrentRegulation(null);
      const res = await getCurrentRegulationAction(targetRole);
      if (res.success && res.data) {
        setCurrentRegulation(res.data);
      }
      setIsLoadingCurrent(false);
    }
    loadCurrent();
  }, [targetRole]);

  const handleAddQuestion = () => {
    setQuestions([...questions, { text: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }], groupKey: "" }]);
  };

  const handleGroupKeyChange = (qIndex: number, groupKey: string) => {
    const newQs = [...questions];
    newQs[qIndex].groupKey = groupKey;
    setQuestions(newQs);
  };

  const handleRemoveQuestion = (qIndex: number) => {
    const newQs = [...questions];
    newQs.splice(qIndex, 1);
    setQuestions(newQs);
  };

  const handleQuestionChange = (qIndex: number, text: string) => {
    const newQs = [...questions];
    newQs[qIndex].text = text;
    setQuestions(newQs);
  };

  const handleAddOption = (qIndex: number) => {
    const newQs = [...questions];
    newQs[qIndex].options.push({ text: "", isCorrect: false });
    setQuestions(newQs);
  };

  const handleRemoveOption = (qIndex: number, oIndex: number) => {
    const newQs = [...questions];
    newQs[qIndex].options.splice(oIndex, 1);
    setQuestions(newQs);
  };

  const handleOptionChange = (qIndex: number, oIndex: number, text: string) => {
    const newQs = [...questions];
    newQs[qIndex].options[oIndex].text = text;
    setQuestions(newQs);
  };

  const handleSetCorrectOption = (qIndex: number, correctOIndex: number) => {
    const newQs = [...questions];
    newQs[qIndex].options = newQs[qIndex].options.map((opt, i) => ({
      ...opt,
      isCorrect: i === correctOIndex,
    }));
    setQuestions(newQs);
  };

  const handlePreFill = () => {
    if (currentRegulation) {
      setTitle(currentRegulation.title || "");
      setContent(currentRegulation.content || "");
      setPassingScore(currentRegulation.passingScore || 80);
      if (currentRegulation.questions && currentRegulation.questions.length > 0) {
        setQuestions(currentRegulation.questions.map((q: any) => ({
          text: q.text,
          options: q.options.map((o: any) => ({ text: o.text, isCorrect: o.isCorrect })),
          groupKey: q.groupKey || "",
        })));
      } else {
        setQuestions([{ text: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }], groupKey: "" }]);
      }
      toast.success("Formulario precargado con el reglamento actual");
      
      const formElement = document.getElementById("regulation-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validación básica
    if (!title.trim() || !content.trim()) {
      toast.error("El título y contenido son obligatorios");
      return;
    }
    if (questions.length === 0) {
      toast.error("Debes agregar al menos una pregunta");
      return;
    }
    
    let hasError = false;
    questions.forEach((q, i) => {
      if (!q.text.trim()) {
        toast.error(`La pregunta ${i + 1} está vacía`);
        hasError = true;
      }
      if (q.options.length < 2) {
        toast.error(`La pregunta ${i + 1} debe tener al menos 2 opciones`);
        hasError = true;
      }
      q.options.forEach((o, j) => {
        if (!o.text.trim()) {
          toast.error(`La opción ${j + 1} de la pregunta ${i + 1} está vacía`);
          hasError = true;
        }
      });
      const hasCorrect = q.options.some(o => o.isCorrect);
      if (!hasCorrect) {
        toast.error(`La pregunta ${i + 1} debe tener una opción correcta seleccionada`);
        hasError = true;
      }
    });

    if (hasError) return;

    setIsSubmitting(true);
    const payload: PublishRegulationData = {
      targetRole,
      title,
      content,
      passingScore: Number(passingScore),
      questions,
      requireRetake,
    };

    const res = await publishRegulationAction(payload);
    setIsSubmitting(false);

    if (res.success) {
      toast.success("¡Reglamento publicado exitosamente!");
      // Reset form
      setTitle("");
      setContent("");
      setPassingScore(80);
      setQuestions([{ text: "", options: [{ text: "", isCorrect: true }, { text: "", isCorrect: false }], groupKey: "" }]);
      setRequireRetake(true);
      // Recargar el actual
      getCurrentRegulationAction(targetRole).then(r => {
        if (r.success) setCurrentRegulation(r.data);
      });
    } else {
      toast.error(res.error || "Hubo un error al publicar el reglamento");
    }
  };

  const buttonText = isSubmitting 
    ? "Guardando..." 
    : currentRegulation 
      ? "Guardar Cambios" 
      : "Publicar Reglamento";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader 
          title="Gestión de Reglamentos" 
          description="Publica o actualiza el reglamento de trabajo y su cuestionario de evaluación." 
        />
        <button
          type="button"
          onClick={() => {
            const formElement = document.getElementById("regulation-form") as HTMLFormElement | null;
            if (formElement) {
              formElement.requestSubmit();
            }
          }}
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 bg-[#C5A55A] text-black font-bold px-6 py-3 rounded-full hover:bg-[#D4AF37] hover:shadow-[0_0_20px_rgba(197,165,90,0.5)] active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md self-start sm:self-auto mb-4 sm:mb-0"
        >
          <Save className="w-5 h-5" />
          {buttonText}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lado Izquierdo: Formulario */}
        <div className="lg:col-span-2 space-y-6">
          <form id="regulation-form" onSubmit={handleSubmit} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-md space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                label="Rol Destino"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as any)}
                options={[
                  { value: "empleada", label: "Empleada" },
                  { value: "chofer", label: "Chofer" },
                  { value: "jefe", label: "Jefe" }
                ]}
              />
              
              <InputField
                label="Puntaje Mínimo Aprobatorio (1-100)"
                type="number"
                min="1"
                max="100"
                value={passingScore.toString()}
                onChange={(e) => setPassingScore(parseInt(e.target.value) || 0)}
                placeholder="Ej. 80"
              />
            </div>

            <InputField
              label="Título del Reglamento"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Reglamento Básico de Higiene y Puntualidad"
            />

            {currentRegulation && (
              <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireRetake}
                  onChange={(e) => setRequireRetake(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-brand-gold bg-zinc-950 border-zinc-700 focus:ring-brand-gold cursor-pointer"
                />
                <span className="text-sm text-zinc-300">
                  <span className="font-semibold text-white">Requerir que todo el personal vuelva a presentar el examen.</span>{" "}
                  Si desmarcas esto, quienes ya habían aprobado la versión anterior conservan su aprobación y no reciben el cuestionario de nuevo — solo lo reciben quienes no habían aprobado o son nuevos.
                </span>
              </label>
            )}

            <TextareaField
              label="Contenido del Reglamento"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribe aquí todas las reglas, cláusulas y condiciones..."
              rows={8}
            />

            <div className="border-t border-zinc-800 pt-6 mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Cuestionario de Evaluación</h3>
                <button
                  type="button"
                  onClick={handleAddQuestion}
                  className="flex items-center gap-2 text-sm text-brand-gold hover:text-white transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  Agregar Pregunta
                </button>
              </div>

              <div className="space-y-8">
                {questions.map((q, qIndex) => (
                  <div key={qIndex} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <InputField
                          label={`Pregunta ${qIndex + 1}`}
                          value={q.text}
                          onChange={(e) => handleQuestionChange(qIndex, e.target.value)}
                          placeholder="Escribe la pregunta..."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(qIndex)}
                        className="mt-8 text-red-500 hover:text-red-400 transition-colors"
                        title="Eliminar pregunta"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="max-w-xs">
                      <InputField
                        label="Grupo alternativo (opcional)"
                        value={q.groupKey || ""}
                        onChange={(e) => handleGroupKeyChange(qIndex, e.target.value)}
                        placeholder="Ej. puntualidad"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Dos preguntas con el mismo grupo son variantes del mismo tema: el sistema muestra una al azar en cada intento, así quien reprueba no ve siempre el mismo cuestionario.
                      </p>
                    </div>

                    <div className="pl-4 border-l-2 border-zinc-800 space-y-3">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest block mb-2">
                        Opciones de Respuesta
                      </label>
                      {q.options.map((opt, oIndex) => (
                        <div key={oIndex} className="flex items-center gap-3">
                          <input
                            type="radio"
                            name={`correct-${qIndex}`}
                            checked={opt.isCorrect}
                            onChange={() => handleSetCorrectOption(qIndex, oIndex)}
                            className="w-4 h-4 text-brand-gold bg-zinc-950 border-zinc-700 focus:ring-brand-gold cursor-pointer"
                            title="Marcar como respuesta correcta"
                          />
                          <div className="flex-1">
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                              placeholder={`Opción ${oIndex + 1}`}
                              className="w-full bg-zinc-950 text-white text-sm px-4 py-2 rounded-xl border border-zinc-800 focus:outline-none focus:border-brand-gold transition-colors"
                            />
                          </div>
                          {q.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(qIndex, oIndex)}
                              className="text-zinc-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      
                      <button
                        type="button"
                        onClick={() => handleAddOption(qIndex)}
                        className="text-xs text-brand-gold hover:text-white transition-colors mt-2"
                      >
                        + Añadir otra opción
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-[#C5A55A] text-black font-bold px-6 py-3 rounded-full hover:bg-[#D4AF37] hover:shadow-[0_0_20px_rgba(197,165,90,0.5)] active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                <Save className="w-5 h-5" />
                {buttonText}
              </button>
            </div>
          </form>
        </div>

        {/* Lado Derecho: Info del Reglamento Actual */}
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-md">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-[#C5A55A]" />
              Reglamento Vigente
            </h3>
            
            {isLoadingCurrent ? (
              <p className="text-sm text-zinc-500 animate-pulse">Cargando reglamento actual...</p>
            ) : currentRegulation ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">Rol</p>
                  <p className="text-sm font-medium capitalize text-[#C5A55A]">{currentRegulation.targetRole}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">Título</p>
                  <p className="text-sm text-white font-medium">{currentRegulation.title}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">Puntaje Aprobatorio</p>
                  <p className="text-sm text-white font-medium">{currentRegulation.passingScore}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest">Última Actualización</p>
                  <p className="text-sm text-white">{new Date(currentRegulation.updatedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Preguntas</p>
                  <p className="text-sm text-white">{currentRegulation.questions?.length || 0} registradas</p>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  <button
                    onClick={handlePreFill}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#C5A55A] text-[#C5A55A] bg-[#C5A55A]/10 text-sm font-semibold hover:bg-[#C5A55A]/20 hover:border-[#D4AF37] hover:text-white transition-all duration-200"
                  >
                    Editar Reglamento Vigente
                  </button>
                  <p className="text-xs text-zinc-500 mt-2 text-center">
                    Carga los datos actuales en el formulario para modificarlos y volver a publicar.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                No hay ningún reglamento publicado para el rol <b>{targetRole}</b>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
