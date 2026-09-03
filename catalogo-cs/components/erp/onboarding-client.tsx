"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ClipboardCheck, Timer, UserPlus } from "lucide-react";

import {
  Empty,
  ErpPageHeader,
  ErpTable,
  KpiCard,
  KpiGrid,
  Panel,
  PersonCell,
  RecordLink,
  StatusBadge,
  Td,
  Th,
  type BadgeTone,
} from "@/components/erp/primitives";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type {
  CandidateScreening,
  Regulation,
  StaffOnboarding,
} from "@/lib/types";

/**
 * Onboarding: de candidata registrada a personal con reglamento aprobado.
 *
 * Reune dos poblaciones distintas que hasta ahora se miraban en pantallas
 * separadas: las candidatas en seleccion y el personal que ya trabaja pero
 * todavia debe aprobar su reglamento. Se presentan como dos bloques y no como
 * un solo embudo porque no son la misma gente: al staff se llega tambien por
 * alta directa, sin pasar por candidata.
 */

const ROL_LABEL: Record<string, string> = {
  empleada: "Empleadas",
  chofer: "Choferes",
  jefe: "Jefes de zona",
};

const SCREENING_TONE: Record<CandidateScreening["status"], BadgeTone> = {
  pendiente: "zinc",
  en_progreso: "amber",
  completado: "green",
};

const SCREENING_LABEL: Record<CandidateScreening["status"], string> = {
  pendiente: "Sin iniciar",
  en_progreso: "En progreso",
  completado: "Completado",
};

const ONBOARDING_TONE: Record<string, BadgeTone> = {
  pending: "amber",
  in_progress: "blue",
  completed: "green",
};

const ONBOARDING_LABEL: Record<string, string> = {
  pending: "Sin iniciar",
  in_progress: "En progreso",
  completed: "Aprobado",
};

function fecha(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
  }).format(date);
}

const porcentaje = (parte: number, total: number) =>
  total ? Math.round((parte / total) * 100) : 0;

type Filtro = "todas" | "en_proceso" | "vinculadas";

export default function OnboardingClient({
  screenings,
  staff,
  regulations,
}: {
  screenings: CandidateScreening[];
  staff: StaffOnboarding[];
  regulations: Array<{ targetRole: string; regulation: Regulation | null }>;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");

  /**
   * Embudo de seleccion.
   *
   * Cada etapa cuenta a quien la alcanzo, aunque despues haya avanzado: una
   * candidata vinculada tambien completo el cuestionario, asi que los tramos
   * decrecen y el porcentaje se lee contra el total de registradas.
   */
  const embudo = useMemo(() => {
    const total = screenings.length;
    const iniciadas = screenings.filter(
      (item) => item.startedAt !== null || item.status !== "pendiente",
    ).length;
    const completadas = screenings.filter(
      (item) => item.status === "completado",
    ).length;
    const vinculadas = screenings.filter(
      (item) => item.promotedEmployeeId !== null,
    ).length;

    return [
      { label: "Candidatas registradas", valor: total },
      { label: "Cuestionario iniciado", valor: iniciadas },
      { label: "Cuestionario completado", valor: completadas },
      { label: "Vinculadas al catalogo", valor: vinculadas },
    ].map((etapa) => ({
      ...etapa,
      proporcion: porcentaje(etapa.valor, total),
    }));
  }, [screenings]);

  /**
   * Dias entre el registro y el cierre del cuestionario.
   *
   * La promocion a empleada no guarda su propia marca de tiempo, asi que se
   * mide hasta completar el cuestionario, que es el ultimo hito con fecha.
   */
  const tiempoSeleccion = useMemo(() => {
    const cerradas = screenings.filter((item) => item.completedAt);
    if (!cerradas.length) return null;

    const total = cerradas.reduce((suma, item) => {
      const inicio = new Date(item.createdAt).getTime();
      const fin = new Date(item.completedAt as string).getTime();
      if (Number.isNaN(inicio) || Number.isNaN(fin)) return suma;
      return suma + Math.max(0, fin - inicio);
    }, 0);

    return { dias: total / cerradas.length / 86_400_000, casos: cerradas.length };
  }, [screenings]);

  /** Personal con reglamento asignado y todavia sin aprobar. */
  const pendientes = useMemo(
    () =>
      staff.filter(
        (persona) =>
          persona.onboarding && persona.onboarding.status !== "completed",
      ),
    [staff],
  );

  const conReglamento = useMemo(
    () => staff.filter((persona) => persona.onboarding !== null),
    [staff],
  );

  const aprobados = useMemo(
    () =>
      conReglamento.filter(
        (persona) => persona.onboarding?.status === "completed",
      ).length,
    [conReglamento],
  );

  /** Entregas que fallaron: la persona no recibio el reglamento por Telegram. */
  const conFalloDeEnvio = useMemo(
    () => pendientes.filter((persona) => persona.onboarding?.lastDeliveryError),
    [pendientes],
  );

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return screenings.filter((item) => {
      if (filtro === "en_proceso" && item.promotedEmployeeId) return false;
      if (filtro === "vinculadas" && !item.promotedEmployeeId) return false;

      if (!termino) return true;
      return [
        item.candidateName,
        item.candidatePhone ?? "",
        item.promotedEmployee?.nombreArtistico ?? "",
      ].some((campo) => campo.toLowerCase().includes(termino));
    });
  }, [screenings, filtro, busqueda]);

  const filtros: Array<{ id: Filtro; label: string }> = [
    { id: "todas", label: "Todas" },
    { id: "en_proceso", label: "En proceso" },
    { id: "vinculadas", label: "Vinculadas" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Onboarding"
        description="Seleccion de candidatas y aprobacion de reglamentos"
        actions={
          <>
            <Link
              href="/admin/candidatas"
              className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.08] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20"
            >
              Gestionar candidatas
            </Link>

            <Link
              href="/admin/regulations"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white"
            >
              Publicar reglamento
            </Link>
          </>
        }
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Candidatas en proceso"
          icon={UserPlus}
          value={screenings.filter((item) => !item.promotedEmployeeId).length}
          footnote={`${screenings.length} registradas en total`}
        />
        <KpiCard
          label="Conversion a vinculada"
          icon={ClipboardCheck}
          value={`${porcentaje(
            screenings.filter((item) => item.promotedEmployeeId).length,
            screenings.length,
          )} %`}
          footnote={
            screenings.length
              ? `Sobre ${screenings.length} registros`
              : "Sin candidatas registradas"
          }
        />
        <KpiCard
          label="Tiempo medio de seleccion"
          icon={Timer}
          value={
            tiempoSeleccion
              ? `${tiempoSeleccion.dias.toLocaleString(APP_LOCALE, {
                  maximumFractionDigits: 1,
                })} d`
              : "--"
          }
          footnote={
            tiempoSeleccion
              ? `Registro a cuestionario cerrado, ${tiempoSeleccion.casos} casos`
              : "Aun sin cuestionarios cerrados"
          }
        />
        <KpiCard
          label="Reglamentos por aprobar"
          icon={BookOpen}
          value={pendientes.length}
          footnote={
            conFalloDeEnvio.length
              ? `${conFalloDeEnvio.length} con fallo de entrega`
              : `${aprobados} de ${conReglamento.length} aprobados`
          }
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="Embudo de seleccion"
          subtitle="candidata_seleccion - proporcion sobre las registradas"
        >
          {screenings.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Sin candidatas registradas.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {embudo.map((etapa) => (
                <div key={etapa.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-zinc-300">
                      {etapa.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-500">
                      <span className="font-heading text-[15px] font-semibold text-white tabular-nums">
                        {etapa.valor}
                      </span>
                      {` - ${etapa.proporcion} %`}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-[#C5A55A]"
                      style={{ width: `${etapa.proporcion}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Reglamentos publicados"
          subtitle="reglamento_empleada - vigente por rol"
          flush
        >
          <ErpTable>
            <thead>
              <tr>
                <Th>Rol</Th>
                <Th>Reglamento</Th>
                <Th numeric>Preguntas</Th>
                <Th numeric>Aprobacion minima</Th>
                <Th>Publicado</Th>
              </tr>
            </thead>

            <tbody>
              {regulations.map(({ targetRole, regulation }) => (
                <tr key={targetRole}>
                  <Td>
                    <span className="font-semibold text-white">
                      {ROL_LABEL[targetRole] ?? targetRole}
                    </span>
                  </Td>

                  <Td>
                    {regulation ? (
                      regulation.title
                    ) : (
                      <StatusBadge tone="amber">Sin publicar</StatusBadge>
                    )}
                  </Td>

                  <Td numeric>
                    {regulation?.questions?.length ?? <Empty />}
                  </Td>

                  <Td numeric>
                    {regulation ? `${regulation.passingScore} %` : <Empty />}
                  </Td>

                  <Td>
                    {regulation ? (
                      (fecha(regulation.publishedAt) ?? <Empty />)
                    ) : (
                      <Empty />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </ErpTable>
        </Panel>
      </div>

      <Panel
        title="Candidatas en seleccion"
        subtitle="candidata_seleccion - avance del cuestionario"
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar candidata"
              className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A] sm:w-[240px]"
            />

            <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-[3px] no-scrollbar">
              {filtros.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFiltro(item.id)}
                  className={`shrink-0 whitespace-nowrap rounded-[9px] px-3.5 py-[7px] text-xs font-semibold transition-colors ${
                    filtro === item.id
                      ? "bg-[#C5A55A] text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Candidata</Th>
              <Th>Registro</Th>
              <Th numeric>Respuestas</Th>
              <Th>Cuestionario</Th>
              <Th>Vinculacion</Th>
              <Th />
            </tr>
          </thead>

          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <Td colSpan={6} className="py-10 text-center text-zinc-500">
                  No hay candidatas que coincidan con el filtro.
                </Td>
              </tr>
            ) : (
              visibles.map((item) => {
                const respondidas = item.answers?.length ?? 0;
                const total = item.questionIds.length;

                return (
                  <tr key={item.id}>
                    <Td>
                      <PersonCell
                        name={item.candidateName}
                        meta={item.candidatePhone ?? "Sin telefono"}
                        href={`/admin/candidatas/${item.id}`}
                      />
                    </Td>

                    <Td>{fecha(item.createdAt) ?? <Empty />}</Td>

                    <Td numeric>{total ? `${respondidas} / ${total}` : <Empty />}</Td>

                    <Td>
                      <StatusBadge tone={SCREENING_TONE[item.status]}>
                        {SCREENING_LABEL[item.status]}
                      </StatusBadge>
                    </Td>

                    <Td>
                      {item.promotedEmployeeId ? (
                        <RecordLink
                          href={`/admin/modelos/${item.promotedEmployeeId}`}
                        >
                          {item.promotedEmployee?.nombreArtistico ?? "Vinculada"}
                        </RecordLink>
                      ) : (
                        <span className="text-zinc-500">Sin vincular</span>
                      )}
                    </Td>

                    <Td>
                      <div className="flex justify-end">
                        <RecordLink
                          href={`/admin/candidatas/${item.id}`}
                          className="text-xs"
                        >
                          Ver
                        </RecordLink>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </ErpTable>
      </Panel>

      <Panel
        title="Reglamentos por aprobar"
        subtitle="empleada_onboarding - personal con reglamento asignado y sin aprobar"
        flush
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Persona</Th>
              <Th>Rol</Th>
              <Th>Asignado</Th>
              <Th numeric>Intentos</Th>
              <Th numeric>Mejor puntaje</Th>
              <Th>Estado</Th>
              <Th>Entrega</Th>
            </tr>
          </thead>

          <tbody>
            {pendientes.length === 0 ? (
              <tr>
                <Td colSpan={7} className="py-10 text-center text-zinc-500">
                  Todo el personal con reglamento asignado ya lo aprobo.
                </Td>
              </tr>
            ) : (
              pendientes.map((persona) => {
                const onboarding = persona.onboarding;
                if (!onboarding) return null;

                const nombre =
                  [persona.nombre, persona.apellido].filter(Boolean).join(" ") ||
                  persona.email;

                return (
                  <tr key={persona.id}>
                    <Td>
                      <span className="font-semibold text-white">{nombre}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {persona.email}
                      </span>
                    </Td>

                    <Td>
                      <span className="capitalize text-zinc-300">
                        {persona.rol}
                      </span>
                    </Td>

                    <Td>{fecha(onboarding.assignedAt) ?? <Empty />}</Td>

                    <Td numeric>{onboarding.attemptCount}</Td>

                    <Td numeric>
                      {onboarding.attemptCount ? (
                        `${onboarding.bestScore} %`
                      ) : (
                        <Empty />
                      )}
                    </Td>

                    <Td>
                      <StatusBadge
                        tone={ONBOARDING_TONE[onboarding.status] ?? "zinc"}
                      >
                        {ONBOARDING_LABEL[onboarding.status] ?? onboarding.status}
                      </StatusBadge>
                    </Td>

                    <Td>
                      {onboarding.lastDeliveryError ? (
                        <StatusBadge tone="red">Fallo de entrega</StatusBadge>
                      ) : onboarding.readAt ? (
                        <span className="text-[11px] text-zinc-500">
                          {`Leido el ${fecha(onboarding.readAt)}`}
                        </span>
                      ) : onboarding.regulationSentAt ? (
                        <span className="text-[11px] text-zinc-500">
                          {`Enviado el ${fecha(onboarding.regulationSentAt)}`}
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500">
                          Sin enviar
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </ErpTable>
      </Panel>
    </div>
  );
}
