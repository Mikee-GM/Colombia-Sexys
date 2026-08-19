"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PageHeader from "@/components/ui/page-header";
import InputField from "@/components/ui/InputField";
import { createEmployeeAction } from "@/lib/actions/registro";
import { promoteCandidateScreening } from "@/lib/actions/candidate-screening";
import type { CandidateScreening } from "@/lib/types";

const STATUS_LABEL: Record<CandidateScreening["status"], string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function CandidateDetailClient({
  screening,
}: {
  screening: CandidateScreening;
}) {
  const router = useRouter();
  const [showPromoteForm, setShowPromoteForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    nombreReal: screening.candidateName,
    nombreArtistico: screening.candidateName,
    slugCatalogo: slugify(screening.candidateName),
    precioBaseHora: "2500",
    catalogoActivo: false,
    disponible: false,
  });

  const handlePromote = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.slugCatalogo.trim()) {
      toast.error("Correo, contraseña y slug son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const result = await createEmployeeAction({
        email: form.email.trim(),
        password: form.password,
        telegramChatId: screening.telegramChatId || undefined,
        nombreReal: form.nombreReal.trim(),
        nombreArtistico: form.nombreArtistico.trim(),
        slugCatalogo: form.slugCatalogo.trim(),
        precioBaseHora: Number(form.precioBaseHora),
        disponible: form.disponible,
        catalogoActivo: form.catalogoActivo,
      });
      if (!result.success || !result.data) {
        toast.error(result.error || "No se pudo registrar a la empleada");
        return;
      }
      await promoteCandidateScreening(screening.id, result.data.id);
      toast.success("Empleada registrada correctamente");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar a la empleada");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={screening.candidateName}
        description={`Evaluación de candidata · ${STATUS_LABEL[screening.status]}`}
      />

      <section className="grid gap-4 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:grid-cols-3 sm:p-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Teléfono</p>
          <p className="mt-1 text-sm text-zinc-200">{screening.candidatePhone || "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Creada</p>
          <p className="mt-1 text-sm text-zinc-200">{formatDate(screening.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Completada</p>
          <p className="mt-1 text-sm text-zinc-200">
            {screening.completedAt ? formatDate(screening.completedAt) : "Todavía no"}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Respuestas
        </h2>
        {(!screening.answers || screening.answers.length === 0) ? (
          <p className="py-4 text-center text-sm italic text-zinc-600">
            {screening.status === "pendiente"
              ? "Todavía no abre el enlace de Telegram."
              : "Todavía no hay respuestas registradas."}
          </p>
        ) : (
          <div className="space-y-4">
            {screening.answers.map((answer, index) => (
              <div key={answer.id} className="rounded-xl border border-zinc-800 bg-black/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-gold">
                  Pregunta {index + 1}
                </p>
                <p className="mt-1 text-sm text-zinc-300">{answer.questionText}</p>
                <p className="mt-2 text-sm text-zinc-100">&ldquo;{answer.answerText}&rdquo;</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {screening.status === "completado" && (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          {screening.promotedEmployeeId ? (
            <p className="text-sm text-emerald-400">
              Esta candidata ya fue registrada en el catálogo.
            </p>
          ) : !showPromoteForm ? (
            <button
              type="button"
              onClick={() => setShowPromoteForm(true)}
              className="w-full rounded-xl border border-brand-gold py-3 text-xs font-semibold uppercase tracking-wider text-brand-gold hover:bg-brand-gold hover:text-black transition-colors"
            >
              Registrar en el catálogo
            </button>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
                Alta de empleada
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Correo"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <InputField
                  label="Contraseña"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <InputField
                  label="Nombre real"
                  value={form.nombreReal}
                  onChange={(e) => setForm({ ...form, nombreReal: e.target.value })}
                />
                <InputField
                  label="Nombre artístico"
                  value={form.nombreArtistico}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      nombreArtistico: e.target.value,
                      slugCatalogo: slugify(e.target.value),
                    })
                  }
                />
                <InputField
                  label="Slug de catálogo"
                  value={form.slugCatalogo}
                  onChange={(e) => setForm({ ...form, slugCatalogo: e.target.value })}
                />
                <InputField
                  label="Precio base por hora"
                  type="number"
                  value={form.precioBaseHora}
                  onChange={(e) => setForm({ ...form, precioBaseHora: e.target.value })}
                />
              </div>
              <p className="text-xs text-zinc-500">
                {screening.telegramChatId
                  ? "Su Telegram ya vinculado se conectará automáticamente a la cuenta nueva."
                  : "Esta candidata no llegó a vincular su Telegram — tendrá que vincularlo manualmente después."}
              </p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={form.catalogoActivo}
                    onChange={(e) => setForm({ ...form, catalogoActivo: e.target.checked })}
                    className="accent-brand-gold"
                  />
                  Publicar en el catálogo público de inmediato
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={form.disponible}
                    onChange={(e) => setForm({ ...form, disponible: e.target.checked })}
                    className="accent-brand-gold"
                  />
                  Marcar como disponible
                </label>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPromoteForm(false)}
                  className="rounded-full px-5 py-2 text-xs font-semibold uppercase text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handlePromote}
                  className="rounded-full border border-brand-gold px-5 py-2 text-xs font-semibold uppercase text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600"
                >
                  {saving ? "Registrando..." : "Registrar empleada"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
