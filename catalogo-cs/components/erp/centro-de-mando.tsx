import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Car,
  CreditCard,
  FileCheck,
  Scale,
  Users,
  Wallet,
} from "lucide-react";

import {
  Down,
  KpiCard,
  KpiGrid,
  Panel,
  RecordLink,
  StatusBadge,
  type BadgeTone,
} from "@/components/erp/primitives";
import type { GodEyeOverview } from "@/lib/actions/god-eye";
import type { OffDutyPerson } from "@/lib/actions/work-shift";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";

/**
 * Centro de Mando: capa de resumen del panel.
 *
 * Responde "como va la operacion" con las metricas que el backend ya calcula
 * en /admin/god-eye/overview. Se apoya en las mismas cifras que el tablero
 * detallado que aparece debajo, de modo que ambos no pueden discrepar.
 */

const ESTADO_TONE: Record<string, BadgeTone> = {
  en_curso: "green",
  agendado: "gold",
  pendiente: "zinc",
  transporte_pendiente: "red",
  finalizado: "blue",
  cancelado: "red",
};

const PRIORIDAD_TONE: Record<string, BadgeTone> = {
  urgente: "red",
  alta: "amber",
  normal: "zinc",
};

function hora(iso: string | null) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export default function CentroDeMando({
  overview,
  offDuty = [],
}: {
  overview: GodEyeOverview;
  /** Personal que cerro su jornada, de cualquier rol. */
  offDuty?: OffDutyPerson[];
}) {
  const { metrics, activeServices, pendingReports } = overview;

  const enCurso = activeServices.filter((s) => s.estado === "en_curso");
  const sinTransporte = activeServices.filter(
    (s) => s.estado === "transporte_pendiente",
  );

  /* Cada alerta apunta a la pantalla donde se resuelve. */
  /* Los tres roles: el admin quiere ver quien no esta trabajando hoy. */
  const fueraDeJornada = offDuty;

  const alertas = [
    {
      id: "recibos",
      cantidad: metrics.pendingReceipts,
      titulo: "Comprobantes por validar",
      detalle: "Pagos sin verificar en los servicios",
      href: "/admin/evidence",
      tone: "amber" as BadgeTone,
    },
    {
      id: "transporte",
      cantidad: sinTransporte.length,
      titulo: "Servicios sin transporte",
      detalle: "Viajes pendientes de asignar chofer",
      href: "/admin/transport",
      tone: "red" as BadgeTone,
    },
    {
      id: "reportes",
      cantidad: metrics.pendingReports,
      titulo: "Reportes de conducta abiertos",
      detalle: "Requieren decision administrativa",
      href: "/admin/reports",
      tone: "red" as BadgeTone,
    },
    {
      id: "apelaciones",
      cantidad: metrics.pendingAppeals,
      titulo: "Apelaciones pendientes",
      detalle: "Sanciones en disputa",
      href: "/admin/reports",
      tone: "blue" as BadgeTone,
    },
    {
      id: "negativas",
      cantidad: metrics.recentNegativeRatings,
      titulo: "Calificaciones negativas recientes",
      detalle: "Revisar la interaccion asociada",
      href: "/admin/reports",
      tone: "amber" as BadgeTone,
    },
    {
      id: "jornada",
      cantidad: fueraDeJornada.length,
      titulo: "Personal fuera de jornada",
      detalle: fueraDeJornada
        .slice(0, 3)
        .map((persona) => persona.nombre)
        .join(", "),
      href: "/admin/choferes",
      tone: "amber" as BadgeTone,
    },
  ].filter((alerta) => alerta.cantidad > 0);

  return (
    <div className="flex flex-col gap-6">
      <KpiGrid columns={5}>
        <KpiCard
          label="Facturado hoy"
          icon={CreditCard}
          value={formatCurrency(metrics.revenueToday)}
          footnote={`${metrics.activeServices} ${
            metrics.activeServices === 1 ? "servicio activo" : "servicios activos"
          }`}
        />
        <KpiCard
          label="Efectivo en calle"
          icon={Wallet}
          value={formatCurrency(metrics.cashInStreet)}
          footnote={
            metrics.cashInStreet > 0 ? (
              <Down>Pendiente de conciliar</Down>
            ) : (
              "Todo conciliado"
            )
          }
        />
        <KpiCard
          label="Modelos disponibles"
          icon={Users}
          value={`${metrics.employeesAvailable} / ${metrics.employeesTotal}`}
          footnote={`${metrics.employeesBusy} en servicio`}
        />
        <KpiCard
          label="Choferes activos"
          icon={Car}
          value={`${metrics.driversActive} / ${metrics.driversTotal}`}
          footnote={`${metrics.pendingOffers} ${
            metrics.pendingOffers === 1
              ? "oferta sin aceptar"
              : "ofertas sin aceptar"
          }`}
        />
        <KpiCard
          label="Sanciones vigentes"
          icon={Scale}
          value={metrics.activeSanctions}
          footnote={
            metrics.pendingAppeals > 0 ? (
              <Down>{`${metrics.pendingAppeals} en apelacion`}</Down>
            ) : (
              "Sin apelaciones abiertas"
            )
          }
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          title="Operacion en vivo"
          subtitle={`${activeServices.length} ${
            activeServices.length === 1
              ? "servicio en curso o agendado"
              : "servicios en curso o agendados"
          }`}
          flush
          action={
            enCurso.length > 0 ? (
              <StatusBadge tone="green" dot>
                {enCurso.length} en curso
              </StatusBadge>
            ) : (
              <StatusBadge tone="zinc">Sin servicios activos</StatusBadge>
            )
          }
        >
          {activeServices.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">
              No hay servicios activos en este momento.
            </p>
          ) : (
            <div className="flex flex-col">
              {activeServices.slice(0, 8).map((servicio) => {
                const inicio = hora(servicio.horaInicioServicio);

                return (
                  <div
                    key={servicio.id}
                    className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <RecordLink
                        href={`/admin/services`}
                        className="w-fit text-[13px]"
                      >
                        {servicio.empleadaNombre}
                      </RecordLink>

                      <span className="truncate text-[11px] text-zinc-500">
                        {servicio.clienteNombre}
                        {inicio ? ` - desde las ${inicio}` : ""}
                        {servicio.serviceType === "grupal" ? " - grupal" : ""}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-[13px] tabular-nums text-zinc-300">
                        {formatCurrency(servicio.totalFinal)}
                      </span>

                      <StatusBadge
                        tone={ESTADO_TONE[servicio.estado] ?? "zinc"}
                        dot={servicio.estado === "en_curso"}
                      >
                        {servicio.estado.replaceAll("_", " ")}
                      </StatusBadge>
                    </div>
                  </div>
                );
              })}

              {activeServices.length > 8 ? (
                <Link
                  href="/admin/services"
                  className="border-t border-zinc-800 px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
                >
                  Ver los {activeServices.length} servicios
                </Link>
              ) : null}
            </div>
          )}
        </Panel>

        <Panel
          title="Alertas del sistema"
          subtitle="Requieren decision administrativa"
          flush
          action={
            <StatusBadge tone={alertas.length > 0 ? "red" : "green"}>
              {alertas.length > 0 ? String(alertas.length) : "Sin alertas"}
            </StatusBadge>
          }
        >
          {alertas.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500">
              No hay nada pendiente de revisar.
            </p>
          ) : (
            <div className="flex flex-col">
              {alertas.map((alerta) => (
                <Link
                  key={alerta.id}
                  href={alerta.href}
                  className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] transition-colors last:border-b-0 hover:bg-zinc-900/40"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <AlertTriangle
                      className={`mt-0.5 h-[15px] w-[15px] shrink-0 ${
                        alerta.tone === "red"
                          ? "text-red-400"
                          : alerta.tone === "amber"
                            ? "text-amber-400"
                            : "text-blue-400"
                      }`}
                    />

                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        {alerta.titulo}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {alerta.detalle}
                      </span>
                    </div>
                  </div>

                  <StatusBadge tone={alerta.tone}>{alerta.cantidad}</StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {pendingReports.length > 0 ? (
        <Panel
          title="Reportes por atender"
          subtitle="reportes_conducta sin resolver"
          flush
          action={
            <Link
              href="/admin/reports"
              className="text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3]"
            >
              Ver todos
            </Link>
          }
        >
          <div className="flex flex-col">
            {pendingReports.slice(0, 5).map((reporte) => (
              <div
                key={reporte.id}
                className="flex items-center justify-between gap-4 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <FileCheck className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[#8B7635]" />

                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold text-white">
                      {reporte.subjectName ?? "Sin persona asignada"}
                      <span className="ml-2 font-normal text-zinc-500">
                        {reporte.category}
                      </span>
                    </span>
                    <span className="truncate text-[11px] text-zinc-500">
                      {reporte.description}
                    </span>
                  </div>
                </div>

                <StatusBadge tone={PRIORIDAD_TONE[reporte.priority] ?? "zinc"}>
                  {reporte.priority}
                </StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="flex items-center gap-2 border-t border-zinc-800 pt-6">
        <Activity className="h-4 w-4 text-[#8B7635]" />
        <h2 className="font-heading text-base font-semibold tracking-[0.04em] text-zinc-200">
          Tablero detallado
        </h2>
      </div>
    </div>
  );
}
