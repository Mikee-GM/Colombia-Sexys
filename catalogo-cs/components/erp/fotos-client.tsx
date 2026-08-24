"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Check, ImageIcon, Lock, X } from "lucide-react";
import { toast } from "sonner";

import {
  ErpPageHeader,
  ErpTable,
  KpiCard,
  KpiGrid,
  Panel,
  RecordLink,
  StatusBadge,
  Td,
  Th,
  type BadgeTone,
} from "@/components/erp/primitives";
import {
  reviewPhotoSubmission,
  type PhotoSubmission,
  type ReviewAction,
  type SubmissionStatus,
} from "@/app/admin/fotos/actions";
import { formatDateTime } from "@/lib/calculations";

const ESTADO_TONE: Record<SubmissionStatus, BadgeTone> = {
  pendiente: "amber",
  aprobada_publica: "green",
  aprobada_privada: "gold",
  rechazada: "red",
};

const ESTADO_LABEL: Record<SubmissionStatus, string> = {
  pendiente: "Pendiente",
  aprobada_publica: "Aprobada publica",
  aprobada_privada: "Aprobada exclusiva",
  rechazada: "Rechazada",
};

function nombreDe(submission: PhotoSubmission) {
  return submission.empleada?.nombreArtistico ?? "Modelo";
}

export default function FotosClient({
  submissions,
}: {
  submissions: PhotoSubmission[];
}) {
  const [pending, startTransition] = useTransition();
  /** Ids ya resueltos en esta sesion, para sacarlos de la cola sin recargar. */
  const [resueltas, setResueltas] = useState<Set<string>>(new Set());

  const pendientes = useMemo(
    () =>
      submissions.filter(
        (s) => s.estado === "pendiente" && !resueltas.has(s.id),
      ),
    [submissions, resueltas],
  );

  const historial = useMemo(
    () => submissions.filter((s) => s.estado !== "pendiente").slice(0, 20),
    [submissions],
  );

  const conteos = useMemo(() => {
    const publicas = submissions.filter(
      (s) => s.estado === "aprobada_publica",
    ).length;
    const exclusivas = submissions.filter(
      (s) => s.estado === "aprobada_privada",
    ).length;

    return {
      publicas,
      exclusivas,
      rechazadas: submissions.filter((s) => s.estado === "rechazada").length,
      modelos: new Set(pendientes.map((s) => s.empleadaId)).size,
    };
  }, [submissions, pendientes]);

  const revisar = (submission: PhotoSubmission, action: ReviewAction) => {
    if (pending) return;

    startTransition(async () => {
      try {
        await reviewPhotoSubmission(submission.id, action);
        setResueltas((prev) => new Set(prev).add(submission.id));

        const mensaje =
          action === "aprobar_publica"
            ? "Foto aprobada como publica"
            : action === "aprobar_privada"
              ? "Foto aprobada como exclusiva"
              : "Foto rechazada";
        toast.success(mensaje);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible revisar la foto",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Fotos y Contenido"
        description="Aprobacion de fotos exclusivas, de catalogo y contenido semanal"
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Pendientes de revision"
          icon={ImageIcon}
          value={pendientes.length}
          footnote={`${conteos.modelos} ${
            conteos.modelos === 1 ? "modelo" : "modelos"
          } en la cola`}
        />
        <KpiCard
          label="Aprobadas como publicas"
          icon={Check}
          value={conteos.publicas}
          footnote="Visibles en el catalogo"
        />
        <KpiCard
          label="Aprobadas como exclusivas"
          icon={Lock}
          value={conteos.exclusivas}
          footnote="Solo para clientes con membresia"
        />
        <KpiCard
          label="Rechazadas"
          icon={X}
          value={conteos.rechazadas}
          footnote="La modelo debe reenviar"
        />
      </KpiGrid>

      <Panel
        title="Cola de revision"
        subtitle="fotos_semanales con estado pendiente"
        action={
          <StatusBadge tone={pendientes.length > 0 ? "amber" : "green"}>
            {pendientes.length > 0
              ? `${pendientes.length} por revisar`
              : "Cola al dia"}
          </StatusBadge>
        }
      >
        {pendientes.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No hay fotos pendientes de revision.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
            {pendientes.map((submission) => (
              <div key={submission.id} className="flex flex-col gap-2.5">
                <div className="relative aspect-3/4 overflow-hidden rounded-xl border border-zinc-800 bg-black">
                  <Image
                    src={submission.url}
                    alt={`Foto enviada por ${nombreDe(submission)}`}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 16vw"
                    className="object-cover"
                  />

                  <div className="absolute left-2 top-2">
                    <StatusBadge tone="amber">Pendiente</StatusBadge>
                  </div>
                </div>

                <div className="flex flex-col gap-0.5">
                  <RecordLink
                    href={`/admin/modelos/${submission.empleadaId}`}
                    className="w-fit text-[13px]"
                  >
                    {nombreDe(submission)}
                  </RecordLink>

                  <span className="text-[11px] text-zinc-500">
                    Semana del {submission.semanaInicio}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revisar(submission, "aprobar_publica")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-green-400/25 bg-green-400/[0.08] px-1.5 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-green-400 transition-colors hover:bg-green-400/20 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    Publica
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revisar(submission, "aprobar_privada")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-[#C5A55A]/30 bg-[#C5A55A]/10 px-1.5 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20 disabled:opacity-50"
                  >
                    <Lock className="h-3 w-3" />
                    Exclusiva
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revisar(submission, "rechazar")}
                    className="flex items-center justify-center rounded-[9px] border border-red-400/25 bg-red-400/[0.08] px-2.5 py-2 text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-50"
                    title="Rechazar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-zinc-500">
          Aprobar como <span className="font-semibold text-zinc-300">publica</span>{" "}
          publica la foto en el catalogo; como{" "}
          <span className="font-semibold text-zinc-300">exclusiva</span> la
          reserva para clientes con membresia. Ambas acciones quedan registradas
          con el revisor y la fecha.
        </p>
      </Panel>

      <Panel
        title="Historial de revisiones"
        subtitle="fotos_semanales - revisado_por_user_id"
        flush
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Modelo</Th>
              <Th>Semana</Th>
              <Th>Resultado</Th>
              <Th>Revisada</Th>
            </tr>
          </thead>

          <tbody>
            {historial.length === 0 ? (
              <tr>
                <Td colSpan={4} className="py-10 text-center text-zinc-500">
                  Todavia no hay revisiones registradas.
                </Td>
              </tr>
            ) : (
              historial.map((submission) => (
                <tr key={submission.id}>
                  <Td>
                    <RecordLink href={`/admin/modelos/${submission.empleadaId}`}>
                      {nombreDe(submission)}
                    </RecordLink>
                  </Td>
                  <Td className="text-zinc-500">{submission.semanaInicio}</Td>
                  <Td>
                    <StatusBadge tone={ESTADO_TONE[submission.estado]}>
                      {ESTADO_LABEL[submission.estado]}
                    </StatusBadge>
                  </Td>
                  <Td className="text-zinc-500">
                    {submission.revisadoAt
                      ? formatDateTime(submission.revisadoAt)
                      : "Sin fecha"}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </ErpTable>
      </Panel>
    </div>
  );
}
