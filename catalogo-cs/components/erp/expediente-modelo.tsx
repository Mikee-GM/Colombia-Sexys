import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  Banknote,
  CreditCard,
  Scale,
  Star,
  Wallet,
} from "lucide-react";

import {
  Empty,
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
import GaleriaFotos from "@/components/erp/galeria-fotos";
import TelegramOtpButton from "@/components/erp/telegram-otp-button";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { Dossier } from "@/lib/actions/discipline";
import type {
  LiquidationDebt,
  LiquidationReport,
} from "@/components/liquidations/types";
import type { Employee, EmployeeRatingComment } from "@/lib/types";

/**
 * Expediente completo de una modelo.
 *
 * Hasta ahora sus datos estaban repartidos: el perfil en Modelos, el dinero en
 * Liquidaciones y Cartera, la conducta en Reportes y el contenido en Fotos.
 * Esta pagina los reune sin duplicar la logica: cada bloque enlaza al modulo
 * donde se opera.
 */

const DISPONIBILIDAD: Record<string, { label: string; tone: BadgeTone }> = {
  disponible: { label: "Disponible", tone: "green" },
  ocupada: { label: "En servicio", tone: "blue" },
  inactiva: { label: "Inactiva", tone: "zinc" },
};

const CONTENIDO: Record<string, { label: string; tone: BadgeTone }> = {
  al_dia: { label: "Al dia", tone: "green" },
  atrasado: { label: "Atrasado", tone: "red" },
  pendiente_revision: { label: "Por revisar", tone: "amber" },
};

const SANCION_LABEL: Record<string, string> = {
  suspension: "Suspension",
  permanent_ban: "Desvinculacion",
  fine: "Multa economica",
};

const SANCION_ESTADO: Record<string, string> = {
  active: "Vigente",
  revoked: "Revocada",
  expired: "Cumplida",
};

const SANCION_TONE: Record<string, BadgeTone> = {
  active: "red",
  revoked: "zinc",
  expired: "green",
};

const DIRECCION_RATING: Record<string, string> = {
  client_to_employee: "Cliente a empleada",
  employee_to_client: "Empleada a cliente",
  employee_to_driver: "Empleada a chofer",
  driver_to_employee: "Chofer a empleada",
  boss_to_employee: "Jefe a empleada",
};

function fecha(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export default function ExpedienteModelo({
  employee,
  dossier,
  debts,
  report,
  ratings,
  startDate,
  endDate,
}: {
  employee: Employee;
  dossier: Dossier | null;
  debts: LiquidationDebt[];
  report: LiquidationReport | null;
  ratings: EmployeeRatingComment[];
  startDate: string;
  endDate: string;
}) {
  const estado =
    DISPONIBILIDAD[employee.availabilityStatus ?? ""] ??
    (employee.disponible
      ? DISPONIBILIDAD.disponible
      : DISPONIBILIDAD.inactiva);

  const deudaAbierta = debts.reduce(
    (sum, debt) => sum + (debt.remainingAmount ?? 0),
    0,
  );

  const sancionesVigentes = (dossier?.sanctions ?? []).filter(
    (sancion) => sancion.status === "active",
  );

  const fotosPublicas = employee.empleadaFotos?.length ?? 0;
  const fotosExclusivas = employee.fotosExclusivas?.length ?? 0;
  const contenido = CONTENIDO[employee.weeklyContentStatus ?? ""] ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera con foto, identidad y estado */}
      <section className="flex flex-col gap-6 rounded-2xl border border-zinc-800 bg-black/40 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[18px] border border-[#C5A55A]/25 bg-[#C5A55A]/[0.12]">
            {employee.fotoPerfilUrl ? (
              <Image
                src={employee.fotoPerfilUrl}
                alt={employee.nombreArtistico}
                fill
                sizes="76px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-heading text-2xl font-semibold text-[#C5A55A]">
                {employee.nombreArtistico.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-[26px] font-semibold leading-none text-white">
                {employee.nombreArtistico}
              </h1>

              <StatusBadge tone={estado.tone} dot={estado.tone === "green"}>
                {estado.label}
              </StatusBadge>

              <StatusBadge tone={employee.catalogoActivo ? "gold" : "red"}>
                {employee.catalogoActivo ? "Catalogo activo" : "Fuera de catalogo"}
              </StatusBadge>
            </div>

            <span className="text-xs text-zinc-500">
              {employee.nombreReal} &middot; @{employee.slugCatalogo}
              {employee.createdAt
                ? ` - vinculada el ${fecha(employee.createdAt)}`
                : ""}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/liquidations/${employee.id}?start=${startDate}&end=${endDate}`}
            className="rounded-xl border border-[#C5A55A]/30 bg-[#C5A55A]/[0.08] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A]/20"
          >
            Ver liquidacion
          </Link>

          <Link
            href="/admin/modelos"
            className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white"
          >
            Volver
          </Link>
        </div>
      </section>

      <KpiGrid columns={5}>
        <KpiCard
          label="Calificacion publica"
          icon={Star}
          value={
            employee.clientRatingAverage ?? employee.promedioCalificacion ?? "-"
          }
          footnote={`${
            employee.clientRatingCount ?? employee.totalServiciosValorados
          } opiniones`}
        />
        <KpiCard
          label="Servicios valorados"
          icon={Activity}
          value={employee.totalServiciosValorados}
          footnote="Historico"
        />
        <KpiCard
          label="Tarifa por hora"
          icon={CreditCard}
          value={formatCurrency(employee.precioBaseHora)}
          footnote="Precio de catalogo"
        />
        <KpiCard
          label="Neto de la semana"
          icon={Banknote}
          value={formatCurrency(report?.weeklySettlement.netEmployeePay ?? 0)}
          footnote={
            report
              ? `${report.finalCut.count} servicios del ${startDate} al ${endDate}`
              : "Sin actividad esta semana"
          }
        />
        <KpiCard
          label="Deuda abierta"
          icon={Wallet}
          value={formatCurrency(deudaAbierta)}
          footnote={
            debts.length > 0
              ? `${debts.length} ${debts.length === 1 ? "deuda" : "deudas"} registradas`
              : "Sin deudas"
          }
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel
            title="Cartera"
            subtitle="liquidaciones_deuda"
            flush
            action={
              <Link
                href="/admin/cartera"
                className="text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
              >
                Ir a cartera
              </Link>
            }
          >
            <ErpTable>
              <thead>
                <tr>
                  <Th>Concepto</Th>
                  <Th>Creada</Th>
                  <Th numeric>Monto</Th>
                  <Th numeric>Abonado</Th>
                  <Th numeric>Saldo</Th>
                </tr>
              </thead>

              <tbody>
                {debts.length === 0 ? (
                  <tr>
                    <Td colSpan={5} className="py-8 text-center text-zinc-500">
                      Esta modelo no tiene deudas registradas.
                    </Td>
                  </tr>
                ) : (
                  debts.map((debt) => (
                    <tr key={debt.id}>
                      <Td>{debt.description}</Td>
                      <Td className="text-zinc-500">{fecha(debt.createdAt)}</Td>
                      <Td numeric>{formatCurrency(debt.amount)}</Td>
                      <Td numeric className="text-zinc-500">
                        {debt.paidAmount > 0 ? (
                          formatCurrency(debt.paidAmount)
                        ) : (
                          <Empty />
                        )}
                      </Td>
                      <Td numeric>
                        {debt.remainingAmount > 0 ? (
                          <span className="font-semibold text-red-400">
                            {formatCurrency(debt.remainingAmount)}
                          </span>
                        ) : (
                          <Empty />
                        )}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </ErpTable>
          </Panel>

          <Panel
            title="Disciplina"
            subtitle="reportes_conducta y sanciones_disciplinarias"
            flush
            action={
              <StatusBadge
                tone={sancionesVigentes.length > 0 ? "red" : "green"}
              >
                {sancionesVigentes.length > 0
                  ? `${sancionesVigentes.length} sancion vigente`
                  : "Sin sanciones"}
              </StatusBadge>
            }
          >
            {(dossier?.reports ?? []).length === 0 &&
            (dossier?.sanctions ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-500">
                No hay reportes ni sanciones en el expediente.
              </p>
            ) : (
              <div className="flex flex-col">
                {(dossier?.sanctions ?? []).slice(0, 6).map((sancion) => (
                  <div
                    key={sancion.id}
                    className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <Scale className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[#8B7635]" />

                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-semibold text-white">
                          {SANCION_LABEL[sancion.type] ?? sancion.type}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {sancion.reason} &middot;{" "}
                          {fecha(sancion.startsAt) ?? "Sin fecha"}
                          {sancion.endsAt
                            ? ` al ${fecha(sancion.endsAt)}`
                            : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      {Number(sancion.fineAmount) > 0 ? (
                        <span className="text-[13px] font-semibold tabular-nums text-red-400">
                          {formatCurrency(sancion.fineAmount)}
                        </span>
                      ) : null}

                      <StatusBadge tone={SANCION_TONE[sancion.status] ?? "zinc"}>
                        {SANCION_ESTADO[sancion.status] ?? sancion.status}
                      </StatusBadge>
                    </div>
                  </div>
                ))}

                {(dossier?.reports ?? []).slice(0, 6).map((reporte) => (
                  <div
                    key={reporte.id}
                    className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        {reporte.category}
                      </span>
                      <span className="truncate text-[11px] text-zinc-500">
                        {reporte.description}
                      </span>
                    </div>

                    <StatusBadge tone="zinc">{reporte.status}</StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {ratings.length > 0 ? (
            <Panel
              title="Opiniones de clientes"
              subtitle="calificaciones_interaccion"
              flush
            >
              <div className="flex flex-col">
                {/* El endpoint no devuelve id, asi que la clave combina fecha y texto. */}
                {ratings.slice(0, 6).map((rating, indice) => (
                  <div
                    key={`${rating.createdAt}-${indice}`}
                    className="flex flex-col gap-1 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 font-semibold text-white">
                        <Star className="h-3.5 w-3.5 text-[#C5A55A]" />
                        {rating.stars}
                      </span>

                      <span className="text-[11px] text-zinc-500">
                        {fecha(rating.createdAt)}
                      </span>
                    </div>

                    {rating.comment ? (
                      <p className="text-[13px] leading-relaxed text-zinc-400">
                        {rating.comment}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Perfil de catalogo" subtitle="empleadas">
            <div className="flex flex-col">
              <Dato label="Nombre artistico" value={employee.nombreArtistico} />
              <Dato label="Slug" value={employee.slugCatalogo} />
              <Dato label="Fotos publicas" value={String(fotosPublicas)} />
              <Dato label="Fotos exclusivas" value={String(fotosExclusivas)} />
              {employee.pendingWeeklyPhotosCount ? (
                <Dato
                  label="Fotos por revisar"
                  value={String(employee.pendingWeeklyPhotosCount)}
                />
              ) : null}
              <Dato
                label="Puede agendar"
                value={employee.canScheduleNext ? "Si" : "No"}
              />
            </div>

            {employee.descripcion ? (
              <>
                <div className="h-px bg-zinc-800" />
                <p className="text-[13px] leading-relaxed text-zinc-400">
                  {employee.descripcion}
                </p>
              </>
            ) : null}
          </Panel>

          {contenido ? (
            <Panel
              title="Contenido semanal"
              subtitle="calendario_contenido_semanal"
              action={
                <StatusBadge tone={contenido.tone}>{contenido.label}</StatusBadge>
              }
            >
              <p className="text-[13px] leading-relaxed text-zinc-400">
                {employee.pendingWeeklyPhotosCount
                  ? `Tiene ${employee.pendingWeeklyPhotosCount} foto(s) esperando revision.`
                  : "No hay entregas pendientes de revisar."}
              </p>

              <Link
                href="/admin/fotos"
                className="w-fit text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
              >
                Ir a fotos y contenido
              </Link>
            </Panel>
          ) : null}

          {dossier && dossier.ratings.length > 0 ? (
            <Panel title="Reputacion" subtitle="promedios por direccion">
              <div className="flex flex-col">
                {dossier.ratings.map((rating) => (
                  <Dato
                    key={rating.direction}
                    label={
                      DIRECCION_RATING[rating.direction] ?? rating.direction
                    }
                    value={`${rating.average.toFixed(1)} (${rating.count})`}
                  />
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel title="Vinculacion de Telegram" subtitle="usuarios">
            <TelegramOtpButton usuarioId={employee.usuarioId} />

            <p className="text-[11px] leading-relaxed text-zinc-500">
              El codigo caduca a los 10 minutos. Se envia al bot con el comando{" "}
              <span className="font-semibold text-zinc-300">/vincular</span>{" "}
              seguido del codigo.
            </p>
          </Panel>

          <Panel title="Operacion" subtitle="estado en vivo">
            <div className="flex flex-col">
              <Dato label="Estado" value={estado.label} />
              {employee.estimatedAvailableAt ? (
                <Dato
                  label="Disponible estimada"
                  value={fecha(employee.estimatedAvailableAt) ?? "-"}
                />
              ) : null}
              <Dato
                label="Ultima ubicacion"
                value={fecha(employee.ultimaUbicacionAt) ?? "Sin registro"}
              />
            </div>
          </Panel>
        </div>
      </div>

      {/* A lo ancho: la galeria necesita el espacio y es lo que mas se toca. */}
      <GaleriaFotos
        empleadaId={employee.id}
        nombre={employee.nombreArtistico}
        galeriaInicialPublica={employee.empleadaFotos ?? []}
        galeriaInicialExclusiva={employee.fotosExclusivas ?? []}
      />
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/50 py-[9px] last:border-b-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-[13px] font-semibold tabular-nums text-zinc-200">
        {value}
      </span>
    </div>
  );
}
