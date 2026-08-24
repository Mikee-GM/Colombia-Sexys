"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Gavel, Scale, ShieldAlert, Wallet } from "lucide-react";

import {
  codigoServicio,
  Empty,
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
import PromptDialog from "@/components/ui/PromptDialog";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { Directorio } from "@/lib/types";
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

/**
 * Panel disciplinario.
 *
 * Reportes de conducta, sanciones y apelaciones sobre las mismas acciones de
 * antes. Lo que cambia es que las personas se muestran por su nombre y no por
 * su UUID, y que las cifras que ya estaban en los datos -- multas del periodo,
 * motivos mas frecuentes -- dejan de tener que contarse a mano.
 */

const PERSONA_LABEL: Record<PersonType, string> = {
  client: "Cliente",
  employee: "Empleada",
  driver: "Chofer",
  boss: "Jefe de zona",
};

const DIRECCION_LABEL: Record<RatingDirection, string> = {
  client_to_employee: "Cliente a empleada",
  employee_to_client: "Empleada a cliente",
  driver_to_employee: "Chofer a empleada",
  employee_to_driver: "Empleada a chofer",
};

const MOTIVO_LABEL: Record<string, string> = {
  trato_inadecuado: "Trato inadecuado",
  demora_impuntualidad: "Demora o impuntualidad",
  incumplimiento: "Incumplimiento",
  cobro: "Cobro",
  seguridad: "Seguridad",
  otro: "Otro",
};

const ESTADO_TONE: Record<ConductReport["status"], BadgeTone> = {
  nuevo: "amber",
  en_revision: "blue",
  cerrado: "zinc",
};

const ESTADO_LABEL: Record<ConductReport["status"], string> = {
  nuevo: "Nuevo",
  en_revision: "En revision",
  cerrado: "Cerrado",
};

const SANCION_LABEL: Record<DisciplinarySanction["type"], string> = {
  suspension: "Suspension",
  permanent_ban: "Baneo permanente",
  fine: "Multa economica",
};

const SANCION_TONE: Record<DisciplinarySanction["status"], BadgeTone> = {
  active: "red",
  revoked: "zinc",
  expired: "zinc",
};

const SANCION_ESTADO: Record<DisciplinarySanction["status"], string> = {
  active: "Vigente",
  revoked: "Revocada",
  expired: "Cumplida",
};

/** Ventana del panel de motivos, en dias. */
const VENTANA_MOTIVOS = 90;

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

function fechaHora(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const codigoViaje = (id: string) => `VJ-${id.slice(-6).toUpperCase()}`;

type Props = {
  role: "admin" | "jefe";
  initialReports: ConductReport[];
  initialSanctions: DisciplinarySanction[];
  initialAppeals?: RatingAppeal[];
  directorio: Directorio;
};

export default function DisciplinaClient({
  role,
  initialReports,
  initialSanctions,
  initialAppeals = [],
  directorio,
}: Props) {
  const [reports] = useState(initialReports);
  const [sanctions] = useState(initialSanctions);
  const [appeals, setAppeals] = useState(initialAppeals);
  const [filtro, setFiltro] = useState<"todos" | "abiertos" | "cerrados">(
    "todos",
  );
  const [busqueda, setBusqueda] = useState("");
  const [selected, setSelected] = useState<Dossier | null>(null);
  const [pending, startTransition] = useTransition();

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

  const [fineDossier, setFineDossier] = useState<Dossier | null>(null);
  const [fineAmount, setFineAmount] = useState("");
  const [fineReason, setFineReason] = useState("");

  const [customSuspensionDossier, setCustomSuspensionDossier] =
    useState<Dossier | null>(null);
  const [customStartsAt, setCustomStartsAt] = useState("");
  const [customEndsAt, setCustomEndsAt] = useState("");
  const [customReason, setCustomReason] = useState("");

  /** Nombre legible de una persona; cae al id corto si no esta en el directorio. */
  const nombre = useMemo(
    () => (tipo: PersonType, id: string) =>
      directorio[tipo]?.[id] ?? `${PERSONA_LABEL[tipo]} #${id.slice(-4)}`,
    [directorio],
  );

  /** Ficha de la persona, cuando el ERP tiene una ruta para ese rol. */
  const fichaDe = (tipo: PersonType, id: string) =>
    tipo === "employee"
      ? `/admin/modelos/${id}`
      : tipo === "driver"
        ? `/admin/drivers/${id}`
        : null;

  const abiertos = useMemo(
    () => reports.filter((report) => report.status !== "cerrado"),
    [reports],
  );

  const sancionesVigentes = useMemo(
    () => sanctions.filter((item) => item.status === "active"),
    [sanctions],
  );

  /** Multas aplicadas en el mes corriente, que se descuentan de la liquidacion. */
  const multasDelMes = useMemo(() => {
    const ahora = new Date();
    const desde = new Date(
      Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1),
    ).getTime();

    const vigentes = sanctions.filter((item) => {
      if (item.type !== "fine" || item.status === "revoked") return false;
      const inicio = new Date(item.startsAt).getTime();
      return !Number.isNaN(inicio) && inicio >= desde;
    });

    return {
      total: vigentes.reduce((sum, item) => sum + Number(item.fineAmount ?? 0), 0),
      casos: vigentes.length,
    };
  }, [sanctions]);

  /** Motivos mas frecuentes de la ventana, para ver donde se repite la falta. */
  const motivos = useMemo(() => {
    const corte = Date.now() - VENTANA_MOTIVOS * 86_400_000;
    const conteo = new Map<string, number>();

    for (const report of reports) {
      const creado = new Date(report.createdAt).getTime();
      if (Number.isNaN(creado) || creado < corte) continue;
      conteo.set(report.category, (conteo.get(report.category) ?? 0) + 1);
    }

    const filas = [...conteo.entries()]
      .map(([category, total]) => ({
        label: MOTIVO_LABEL[category] ?? category.replaceAll("_", " "),
        total,
      }))
      .sort((a, b) => b.total - a.total);

    const mayor = filas[0]?.total ?? 0;
    return filas.slice(0, 6).map((fila) => ({
      ...fila,
      proporcion: mayor ? fila.total / mayor : 0,
    }));
  }, [reports]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return reports.filter((report) => {
      if (filtro === "abiertos" && report.status === "cerrado") return false;
      if (filtro === "cerrados" && report.status !== "cerrado") return false;

      if (!termino) return true;
      return [
        nombre(report.reporterType, report.reporterId),
        nombre(report.subjectType, report.subjectId),
        MOTIVO_LABEL[report.category] ?? report.category,
        report.description,
        report.serviceId ? codigoServicio(report.serviceId) : "",
        report.tripId ? codigoViaje(report.tripId) : "",
      ].some((campo) => campo.toLowerCase().includes(termino));
    });
  }, [reports, filtro, busqueda, nombre]);

  function openDossier(tipo: PersonType, id: string) {
    startTransition(async () => {
      try {
        setSelected(await getDossier(tipo, id));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo cargar el expediente",
        );
      }
    });
  }

  function handleConfirmClose(resolution: string) {
    if (!closeReportData) return;
    const { report, outcome } = closeReportData;
    startTransition(async () => {
      try {
        await closeConductReport(report.id, outcome, resolution);
        toast.success("Reporte cerrado");
        setCloseReportData(null);
        window.location.reload();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo cerrar el reporte",
        );
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
        toast.success("Sancion aplicada");
        setSanctionData(null);
        setSelected(await getDossier(dossier.subjectType, dossier.subjectId));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo aplicar la sancion",
        );
      }
    });
  }

  function handleConfirmFine() {
    if (!fineDossier) return;
    const monto = Number(fineAmount);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Ingresa un monto valido");
      return;
    }
    if (fineReason.trim().length < 3) {
      toast.error("Escribe el motivo de la multa");
      return;
    }

    const { subjectType, subjectId } = fineDossier;
    startTransition(async () => {
      try {
        await createSanction({
          subjectType,
          subjectId,
          type: "fine",
          reason: fineReason.trim(),
          fineAmount: monto,
        });
        toast.success("Multa aplicada");
        setFineDossier(null);
        setFineAmount("");
        setFineReason("");
        setSelected(await getDossier(subjectType, subjectId));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo aplicar la multa",
        );
      }
    });
  }

  function handleConfirmRevoke(reason: string) {
    if (!revokeData) return;
    const { item, dossier } = revokeData;
    startTransition(async () => {
      try {
        await revokeSanction(item.id, reason);
        toast.success("Sancion revocada");
        setRevokeData(null);
        setSelected(await getDossier(dossier.subjectType, dossier.subjectId));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo revocar la sancion",
        );
      }
    });
  }

  function handleConfirmCustomSuspension() {
    if (
      !customSuspensionDossier ||
      !customStartsAt ||
      !customEndsAt ||
      customReason.trim().length < 3
    ) {
      return;
    }

    const { subjectType, subjectId } = customSuspensionDossier;
    startTransition(async () => {
      try {
        await createSanction({
          subjectType,
          subjectId,
          type: "suspension",
          reason: customReason.trim(),
          startsAt: new Date(customStartsAt).toISOString(),
          endsAt: new Date(customEndsAt).toISOString(),
        });
        toast.success("Suspension programada");
        setCustomSuspensionDossier(null);
        setCustomStartsAt("");
        setCustomEndsAt("");
        setCustomReason("");
        setSelected(await getDossier(subjectType, subjectId));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo programar la suspension",
        );
      }
    });
  }

  function resolveAppealDecision(
    appeal: RatingAppeal,
    decision: "upheld" | "overturned",
  ) {
    startTransition(async () => {
      try {
        await resolveAppeal(appeal.id, decision);
        setAppeals((prev) => prev.filter((item) => item.id !== appeal.id));
        toast.success(
          decision === "upheld"
            ? "Calificacion confirmada"
            : "Calificacion anulada",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo resolver la apelacion",
        );
      }
    });
  }

  const filtros: Array<{ id: typeof filtro; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "abiertos", label: "Abiertos" },
    { id: "cerrados", label: "Cerrados" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Disciplina"
        description="Reportes de conducta, sanciones y apelaciones"
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Reportes abiertos"
          icon={ShieldAlert}
          value={abiertos.length}
          footnote={`${reports.length} en total`}
        />
        <KpiCard
          label="Sanciones vigentes"
          icon={Gavel}
          value={sancionesVigentes.length}
          footnote={
            sancionesVigentes.length
              ? `${
                  sancionesVigentes.filter((s) => s.type === "suspension").length
                } suspensiones`
              : "Sin sanciones activas"
          }
        />
        <KpiCard
          label="Multas del mes"
          icon={Wallet}
          value={formatCurrency(multasDelMes.total)}
          footnote={`${multasDelMes.casos} ${
            multasDelMes.casos === 1 ? "multa aplicada" : "multas aplicadas"
          }`}
        />
        <KpiCard
          label="Apelaciones"
          icon={Scale}
          value={appeals.length}
          footnote={
            appeals.length
              ? "Pendientes de resolucion"
              : "Sin apelaciones pendientes"
          }
        />
      </KpiGrid>

      {role === "admin" && appeals.length > 0 ? (
        <Panel
          title="Apelaciones pendientes"
          subtitle="estas calificaciones no cuentan en el promedio mientras se revisan"
        >
          {appeals.map((appeal) => (
            <article
              key={appeal.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="gold">
                    {`${appeal.stars} de 5`}
                  </StatusBadge>
                  <span className="text-[11px] text-zinc-500">
                    {DIRECCION_LABEL[appeal.direction]}
                  </span>
                </div>

                {appeal.comment ? (
                  <p className="mt-2.5 text-[13px] text-zinc-400">
                    {`Comentario original: ${appeal.comment}`}
                  </p>
                ) : null}

                {appeal.appealReason ? (
                  <p className="mt-1 text-[13px] text-zinc-300">
                    {`Motivo de la apelacion: ${appeal.appealReason}`}
                  </p>
                ) : null}

                <p className="mt-2 text-[11px] text-zinc-600">
                  {fechaHora(appeal.createdAt)}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => resolveAppealDecision(appeal, "upheld")}
                  disabled={pending}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-40"
                >
                  Confirmar calificacion
                </button>

                <button
                  type="button"
                  onClick={() => resolveAppealDecision(appeal, "overturned")}
                  disabled={pending}
                  className="rounded-xl border border-[#C5A55A] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-40"
                >
                  Anular calificacion
                </button>
              </div>
            </article>
          ))}
        </Panel>
      ) : null}

      <Panel
        title="Reportes de conducta"
        subtitle="reportes_conducta - quien reporta, sobre quien y en que servicio"
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar persona, motivo o servicio"
              className="w-[240px] rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A]"
            />

            <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-950 p-[3px]">
              {filtros.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFiltro(item.id)}
                  className={`rounded-[9px] px-3.5 py-[7px] text-xs font-semibold transition-colors ${
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
              <Th>Reporta</Th>
              <Th>Sobre</Th>
              <Th>Origen</Th>
              <Th>Motivo</Th>
              <Th>Prioridad</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>

          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <Td colSpan={7} className="py-10 text-center text-zinc-500">
                  No hay reportes que coincidan con el filtro.
                </Td>
              </tr>
            ) : (
              visibles.map((report) => {
                const ficha = fichaDe(report.subjectType, report.subjectId);

                return (
                  <tr key={report.id}>
                    <Td>
                      <span className="text-zinc-300">
                        {nombre(report.reporterType, report.reporterId)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {PERSONA_LABEL[report.reporterType]}
                      </span>
                    </Td>

                    <Td>
                      {ficha ? (
                        <RecordLink href={ficha}>
                          {nombre(report.subjectType, report.subjectId)}
                        </RecordLink>
                      ) : (
                        <span className="font-semibold text-white">
                          {nombre(report.subjectType, report.subjectId)}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {PERSONA_LABEL[report.subjectType]}
                      </span>
                    </Td>

                    <Td>
                      {report.serviceId ? (
                        <RecordLink href={`/admin/services/${report.serviceId}`}>
                          {codigoServicio(report.serviceId)}
                        </RecordLink>
                      ) : report.tripId ? (
                        <span className="text-zinc-400">
                          {codigoViaje(report.tripId)}
                        </span>
                      ) : (
                        <Empty />
                      )}
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {fecha(report.createdAt)}
                      </span>
                    </Td>

                    <Td>
                      <span className="text-zinc-300">
                        {MOTIVO_LABEL[report.category] ??
                          report.category.replaceAll("_", " ")}
                      </span>
                      <span
                        className="mt-0.5 block max-w-[280px] truncate text-[11px] text-zinc-500"
                        title={report.description}
                      >
                        {report.description}
                      </span>
                    </Td>

                    <Td>
                      <StatusBadge
                        tone={
                          report.priority === "urgente"
                            ? "red"
                            : report.priority === "alta"
                              ? "amber"
                              : "zinc"
                        }
                      >
                        {report.priority}
                      </StatusBadge>
                    </Td>

                    <Td>
                      <StatusBadge tone={ESTADO_TONE[report.status]}>
                        {ESTADO_LABEL[report.status]}
                      </StatusBadge>
                      {report.outcome ? (
                        <span className="mt-0.5 block text-[11px] text-zinc-500">
                          {report.outcome === "confirmado"
                            ? "Confirmado"
                            : "No sustentado"}
                        </span>
                      ) : null}
                    </Td>

                    <Td>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openDossier(report.subjectType, report.subjectId)
                          }
                          disabled={pending}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-40"
                        >
                          Expediente
                        </button>

                        {report.status !== "cerrado" ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setCloseReportData({
                                  report,
                                  outcome: "confirmado",
                                })
                              }
                              disabled={pending}
                              className="rounded-xl border border-[#C5A55A] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-40"
                            >
                              Confirmar
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setCloseReportData({
                                  report,
                                  outcome: "no_sustentado",
                                })
                              }
                              disabled={pending}
                              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-400 transition-colors hover:text-white disabled:opacity-40"
                            >
                              Desestimar
                            </button>
                          </>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </ErpTable>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="Sanciones disciplinarias"
          subtitle="sanciones_disciplinarias - vigencia y revocacion"
          flush
        >
          <ErpTable>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th>Rol</Th>
                <Th>Tipo</Th>
                <Th numeric>Multa</Th>
                <Th>Desde</Th>
                <Th>Hasta</Th>
                <Th>Estado</Th>
              </tr>
            </thead>

            <tbody>
              {sanctions.length === 0 ? (
                <tr>
                  <Td colSpan={7} className="py-10 text-center text-zinc-500">
                    No hay sanciones registradas.
                  </Td>
                </tr>
              ) : (
                sanctions.map((item) => {
                  const ficha = fichaDe(item.subjectType, item.subjectId);

                  return (
                    <tr key={item.id}>
                      <Td>
                        {ficha ? (
                          <RecordLink href={ficha}>
                            {nombre(item.subjectType, item.subjectId)}
                          </RecordLink>
                        ) : (
                          <span className="font-semibold text-white">
                            {nombre(item.subjectType, item.subjectId)}
                          </span>
                        )}
                      </Td>

                      <Td>{PERSONA_LABEL[item.subjectType]}</Td>

                      <Td>
                        <span className="text-zinc-300">
                          {SANCION_LABEL[item.type]}
                        </span>
                        <span
                          className="mt-0.5 block max-w-[220px] truncate text-[11px] text-zinc-500"
                          title={item.reason}
                        >
                          {item.reason}
                        </span>
                      </Td>

                      <Td numeric>
                        {item.fineAmount ? (
                          formatCurrency(item.fineAmount)
                        ) : (
                          <Empty />
                        )}
                      </Td>

                      <Td>{fecha(item.startsAt) ?? <Empty />}</Td>

                      <Td>{fecha(item.endsAt) ?? <Empty />}</Td>

                      <Td>
                        <StatusBadge tone={SANCION_TONE[item.status]}>
                          {SANCION_ESTADO[item.status]}
                        </StatusBadge>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </ErpTable>
        </Panel>

        <Panel
          title="Motivos mas frecuentes"
          subtitle={`ultimos ${VENTANA_MOTIVOS} dias`}
        >
          {motivos.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Sin reportes en la ventana.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {motivos.map((motivo) => (
                <div key={motivo.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] text-zinc-300">
                      {motivo.label}
                    </span>
                    <span className="shrink-0 font-heading text-[15px] font-semibold tabular-nums text-white">
                      {motivo.total}
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-[#C5A55A]"
                      style={{ width: `${Math.round(motivo.proporcion * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {selected ? (
        <Panel
          title={`Expediente - ${nombre(selected.subjectType, selected.subjectId)}`}
          subtitle={PERSONA_LABEL[selected.subjectType]}
          action={
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-400 transition-colors hover:text-white"
            >
              Cerrar
            </button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selected.ratings.length === 0 ? (
              <p className="text-[13px] text-zinc-500">
                Sin calificaciones para este expediente.
              </p>
            ) : (
              selected.ratings.map((rating) => (
                <div
                  key={rating.direction}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <p className="text-[11px] uppercase tracking-[0.06em] text-zinc-500">
                    {DIRECCION_LABEL[rating.direction]}
                  </p>
                  <p className="mt-2 font-heading text-[22px] font-semibold text-[#E8D5A3] tabular-nums">
                    {Number(rating.average).toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {`${rating.count} valoraciones`}
                  </p>
                </div>
              ))
            )}
          </div>

          {role === "admin" ? (
            <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-5">
              {[1, 3, 7, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    setSanctionData({ dossier: selected, type: "suspension", days })
                  }
                  disabled={pending}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-40"
                >
                  {`Suspender ${days} ${days === 1 ? "dia" : "dias"}`}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setCustomSuspensionDossier(selected);
                  setCustomStartsAt(new Date().toISOString().slice(0, 16));
                  setCustomEndsAt("");
                  setCustomReason("");
                }}
                disabled={pending}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-40"
              >
                Suspension personalizada
              </button>

              <button
                type="button"
                onClick={() => {
                  setFineDossier(selected);
                  setFineAmount("");
                  setFineReason("");
                }}
                disabled={pending}
                className="rounded-xl border border-[#C5A55A] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-40"
              >
                Aplicar multa
              </button>

              <button
                type="button"
                onClick={() =>
                  setSanctionData({ dossier: selected, type: "permanent_ban" })
                }
                disabled={pending}
                className="rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-40"
              >
                Baneo permanente
              </button>
            </div>
          ) : null}

          {selected.sanctions.length ? (
            <div className="flex flex-col gap-2">
              {selected.sanctions.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <span className="text-[13px] text-zinc-300">
                      {SANCION_LABEL[item.type]}
                      {item.fineAmount
                        ? ` - ${formatCurrency(item.fineAmount)}`
                        : ""}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      {item.reason}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge tone={SANCION_TONE[item.status]}>
                      {SANCION_ESTADO[item.status]}
                    </StatusBadge>

                    {role === "admin" && item.status === "active" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          setRevokeData({ item, dossier: selected })
                        }
                        className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:text-[#E8D5A3] disabled:opacity-40"
                      >
                        Revocar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      ) : null}

      <PromptDialog
        isOpen={!!closeReportData}
        title={
          closeReportData?.outcome === "confirmado"
            ? "Confirmar reporte de conducta"
            : "Desestimar reporte por falta de sustento"
        }
        description={`Escribe la resolucion oficial para ${
          closeReportData?.outcome === "confirmado"
            ? "dar por veridico este reporte y proceder conforme a reglamento"
            : "descartar este reporte por falta de sustento"
        }.`}
        placeholder="Ej: Se reviso la evidencia fotografica y se corroboro el incumplimiento del protocolo..."
        labelConfirm={
          closeReportData?.outcome === "confirmado"
            ? "Confirmar reporte"
            : "Cerrar como no sustentado"
        }
        variant={closeReportData?.outcome === "confirmado" ? "gold" : "blue"}
        minLength={3}
        maxLength={2000}
        isLoading={pending}
        onConfirm={handleConfirmClose}
        onCancel={() => setCloseReportData(null)}
      />

      <PromptDialog
        isOpen={!!sanctionData}
        title={
          sanctionData?.type === "suspension"
            ? `Aplicar suspension de ${sanctionData.days} ${
                sanctionData.days === 1 ? "dia" : "dias"
              }`
            : "Aplicar baneo permanente"
        }
        description="Ingresa el motivo que justificara esta sancion en el expediente."
        placeholder="Ej: Falta reiterada en el protocolo de atencion y quejas formales de clientes..."
        labelConfirm="Confirmar sancion"
        variant="red"
        minLength={3}
        maxLength={2000}
        isLoading={pending}
        onConfirm={handleConfirmSanction}
        onCancel={() => setSanctionData(null)}
      />

      <PromptDialog
        isOpen={!!revokeData}
        title="Revocar sancion disciplinaria"
        description="Ingresa el motivo por el cual se revoca la sancion; queda registrado en el expediente."
        placeholder="Ej: Cumplimiento de compromisos acordados o aclaracion de malentendido..."
        labelConfirm="Confirmar revocacion"
        variant="emerald"
        minLength={3}
        maxLength={1000}
        isLoading={pending}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setRevokeData(null)}
      />

      {fineDossier ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-6">
            <h3 className="font-heading text-lg font-semibold text-[#E8D5A3]">
              Aplicar multa economica
            </h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              La multa queda en el expediente y se descuenta de la liquidacion.
            </p>

            <label className="mt-4 block text-xs text-zinc-400">
              <span className="mb-1.5 block font-semibold">Monto</span>
              <input
                type="number"
                min={1}
                value={fineAmount}
                onChange={(event) => setFineAmount(event.target.value)}
                placeholder="Ej. 150000"
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A]"
              />
            </label>

            <label className="mt-3 block text-xs text-zinc-400">
              <span className="mb-1.5 block font-semibold">
                Motivo de la multa
              </span>
              <textarea
                rows={3}
                value={fineReason}
                onChange={(event) => setFineReason(event.target.value)}
                placeholder="Ej: Efectivo no entregado en el corte de la semana..."
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A]"
              />
            </label>

            <div className="mt-6 flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <button
                type="button"
                disabled={pending}
                onClick={() => setFineDossier(null)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={handleConfirmFine}
                className="rounded-xl bg-[#C5A55A] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-black transition-colors hover:bg-[#d8b769] disabled:opacity-50"
              >
                {pending ? "Aplicando..." : "Aplicar multa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {customSuspensionDossier ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0A0A0A] p-6">
            <h3 className="font-heading text-lg font-semibold text-[#E8D5A3]">
              Suspension personalizada
            </h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Define el periodo exacto y el motivo de la suspension.
            </p>

            <label className="mt-4 block text-xs text-zinc-400">
              <span className="mb-1.5 block font-semibold">
                Fecha y hora de inicio
              </span>
              <input
                type="datetime-local"
                value={customStartsAt}
                onChange={(event) => setCustomStartsAt(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none focus:border-[#C5A55A]"
              />
            </label>

            <label className="mt-3 block text-xs text-zinc-400">
              <span className="mb-1.5 block font-semibold">
                Fecha y hora de finalizacion
              </span>
              <input
                type="datetime-local"
                value={customEndsAt}
                onChange={(event) => setCustomEndsAt(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none focus:border-[#C5A55A]"
              />
            </label>

            <label className="mt-3 block text-xs text-zinc-400">
              <span className="mb-1.5 block font-semibold">
                Motivo de la suspension
              </span>
              <textarea
                rows={3}
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Ej: Suspension por acuerdo mutuo hasta evaluacion..."
                className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A]"
              />
            </label>

            <div className="mt-6 flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <button
                type="button"
                disabled={pending}
                onClick={() => setCustomSuspensionDossier(null)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white disabled:opacity-50"
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
                className="rounded-xl border border-red-400/25 bg-red-400/[0.08] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-40"
              >
                {pending ? "Guardando..." : "Aplicar suspension"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
