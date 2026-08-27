"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { Check, ImageIcon, Lock, Trash2, X } from "lucide-react";
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
  deletePhotoSubmission,
  reviewPhotoSubmission,
  type PhotoSubmission,
  type ReviewAction,
  type SubmissionStatus,
} from "@/app/admin/fotos/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PromptDialog from "@/components/ui/PromptDialog";
import { formatDateTime } from "@/lib/calculations";

/** Mismo tope que valida el backend en ReviewSubmissionDto. */
const MOTIVO_MAX = 300;

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
  /** Ids borrados en esta sesion, para sacarlos del historial sin recargar. */
  const [borradas, setBorradas] = useState<Set<string>>(new Set());
  /** Envio en espera de confirmacion de borrado. */
  const [porBorrar, setPorBorrar] = useState<PhotoSubmission | null>(null);
  /** Envio en espera de que el revisor escriba por que lo rechaza. */
  const [porRechazar, setPorRechazar] = useState<PhotoSubmission | null>(null);

  const pendientes = useMemo(
    () =>
      submissions.filter(
        (s) => s.estado === "pendiente" && !resueltas.has(s.id),
      ),
    [submissions, resueltas],
  );

  const historial = useMemo(
    () =>
      submissions
        .filter((s) => s.estado !== "pendiente" && !borradas.has(s.id))
        .slice(0, 20),
    [submissions, borradas],
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

  const borrar = (submission: PhotoSubmission) => {
    if (pending) return;

    startTransition(async () => {
      try {
        await deletePhotoSubmission(submission.id);
        setBorradas((prev) => new Set(prev).add(submission.id));
        setPorBorrar(null);
        toast.success("Foto borrada y retirada del catalogo");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible borrar la foto",
        );
      }
    });
  };

  const revisar = (
    submission: PhotoSubmission,
    action: ReviewAction,
    motivo?: string,
  ) => {
    if (pending) return;

    startTransition(async () => {
      try {
        await reviewPhotoSubmission(submission.id, action, motivo);
        setResueltas((prev) => new Set(prev).add(submission.id));
        setPorRechazar(null);

        const mensaje =
          action === "aprobar_publica"
            ? "Foto aprobada como publica"
            : action === "aprobar_privada"
              ? "Foto aprobada como exclusiva"
              : motivo
                ? "Foto rechazada y motivo enviado a la modelo"
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
      <AnimatePresence>
        {porBorrar && (
          <ConfirmDialog
            key="confirm-delete-foto"
            title={`Borrar la foto de "${nombreDe(porBorrar)}"`}
            description={
              porBorrar.estado === "aprobada_publica"
                ? "La foto se retirara del catalogo publico y se borrara el archivo. No se puede deshacer."
                : porBorrar.estado === "aprobada_privada"
                  ? "La foto se retirara de las fotos exclusivas y se borrara el archivo. No se puede deshacer."
                  : "Se borrara el registro de la revision y el archivo. No se puede deshacer."
            }
            labelConfirm="Si, borrar"
            onConfirm={() => borrar(porBorrar)}
            onCancel={() => setPorBorrar(null)}
          />
        )}
      </AnimatePresence>

      {/*
        El motivo se pide siempre al rechazar, pero no se exige (minLength 0):
        la modelo agradece saber que corregir, y a la vez una cola parada
        porque el revisor no sabe como redactarlo es peor que un rechazo seco.
      */}
      <PromptDialog
        isOpen={porRechazar !== null}
        title={`Rechazar la foto de "${porRechazar ? nombreDe(porRechazar) : ""}"`}
        description="Explica que hay que corregir. El motivo le aparece en su portal y le llega por Telegram con un acceso para subir otra. Puedes dejarlo vacio si prefieres no dar detalle."
        placeholder="Por ejemplo: la foto esta movida y se ve a otra persona al fondo."
        labelConfirm="Rechazar y avisar"
        variant="red"
        minLength={0}
        maxLength={MOTIVO_MAX}
        isLoading={pending}
        onConfirm={(motivo) => {
          if (porRechazar) revisar(porRechazar, "rechazar", motivo || undefined);
        }}
        onCancel={() => setPorRechazar(null)}
      />

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

                {/* Rejilla en vez de una sola fila: en la tarjeta de la cola
                    (hasta 6 columnas) las tres acciones no caben a lo ancho y
                    las etiquetas se desbordaban. */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revisar(submission, "aprobar_publica")}
                    className="flex min-w-0 items-center justify-center gap-1 rounded-[9px] border border-green-400/25 bg-green-400/[0.08] px-1.5 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-green-400 transition-colors hover:bg-green-400/20 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3 shrink-0" />
                    <span className="truncate">Publica</span>
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => revisar(submission, "aprobar_privada")}
                    className="flex min-w-0 items-center justify-center gap-1 rounded-[9px] border border-[#C5A55A]/30 bg-[#C5A55A]/10 px-1.5 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20 disabled:opacity-50"
                  >
                    <Lock className="h-3 w-3 shrink-0" />
                    <span className="truncate">Exclusiva</span>
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setPorRechazar(submission)}
                    className="col-span-2 flex min-w-0 items-center justify-center gap-1 rounded-[9px] border border-red-400/25 bg-red-400/[0.08] px-1.5 py-2 text-[10px] font-bold uppercase tracking-[0.04em] text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-50"
                  >
                    <X className="h-3 w-3 shrink-0" />
                    <span className="truncate">Rechazar</span>
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
              <Th numeric>Acciones</Th>
            </tr>
          </thead>

          <tbody>
            {historial.length === 0 ? (
              <tr>
                <Td colSpan={5} className="py-10 text-center text-zinc-500">
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

                    {/* El motivo, junto al resultado: es la respuesta a "por
                        que la rechazaron" cuando la modelo pregunta. */}
                    {submission.motivoRechazo ? (
                      <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-zinc-500">
                        {submission.motivoRechazo}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="text-zinc-500">
                    {submission.revisadoAt
                      ? formatDateTime(submission.revisadoAt)
                      : "Sin fecha"}
                  </Td>
                  <Td numeric>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setPorBorrar(submission)}
                      className="inline-flex items-center gap-1.5 rounded-[9px] border border-red-400/25 bg-red-400/[0.08] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-50"
                      title="Borrar la foto y retirarla del catalogo"
                    >
                      <Trash2 className="h-3 w-3 shrink-0" />
                      Borrar
                    </button>
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
