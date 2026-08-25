"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Ban,
  CalendarClock,
  Car,
  Clock,
  Plus,
  Wallet,
} from "lucide-react";

import ServiceDetailDialog from "@/components/services/service-detail-dialog";
import CreateServiceDialog from "@/components/services/create-service-dialog";
import {
  codigoServicio,
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
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import { getOperationalWeek } from "@/lib/week-range";
import type { Employee, Service, ServiceStatus, Trip } from "@/lib/types";

/**
 * Torre de control operativa.
 *
 * Responde "que esta pasando ahora" con lo que el backend ya calcula: los
 * servicios del dia con su avance real, los viajes que siguen sin chofer y la
 * disponibilidad de las empleadas. No duplica la gestion: el codigo del
 * servicio abre la ficha completa y la fila abre el dialogo de decision, que
 * es donde se acepta, rechaza y edita.
 */

type Rango = "hoy" | "semana";
type Filtro = "todos" | "en_curso" | "cerrados";

type Jefe = {
  id: string;
  nombre?: string | null;
  apellido?: string | null;
  email: string;
};

const ESTADO_TONE: Record<ServiceStatus, BadgeTone> = {
  pendiente: "zinc",
  agendado: "gold",
  en_curso: "green",
  finalizado: "blue",
  cancelado: "red",
};

/** Estados que ya no consumen operacion: no entran en "En curso" ni en la cola. */
const CERRADOS: ServiceStatus[] = ["finalizado", "cancelado"];

const num = (value: unknown) => Number(value ?? 0) || 0;

/* -------------------------------------------------------------------------- */
/* Fechas                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Dia calendario en Bogota como "YYYY-MM-DD".
 *
 * El rango se compara por dia local y no por UTC, porque un servicio de las
 * 22:00 en Bogota cae al dia siguiente en UTC y se saldria del tablero de hoy.
 */
function diaBogota(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hora(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Momento por el que un servicio pertenece a un dia de operacion. */
function referencia(service: Service) {
  return (
    service.fechaProgramada ??
    service.horaInicioServicio ??
    service.horaInicioEstimada ??
    service.createdAt
  );
}

function duracionLegible(ms: number) {
  if (ms <= 0) return null;
  const minutos = Math.floor(ms / 60_000);
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, "0")}m`;
}

/* -------------------------------------------------------------------------- */
/* Transporte                                                                 */
/* -------------------------------------------------------------------------- */

const VIAJE_ABIERTO: Trip["estado"][] = [
  "notificado",
  "aceptado",
  "en_camino",
  "llegado",
  "en_curso",
];

/** Viaje que ya deberia tener chofer y sigue sin asignar. */
function sinChofer(trip: Trip) {
  return (
    !trip.choferId &&
    trip.proveedorTransporte === "interno" &&
    VIAJE_ABIERTO.includes(trip.estado)
  );
}

/**
 * Una linea que resume ida y regreso, para no abrir la ficha solo por saber
 * si el transporte va al dia.
 */
function resumenTransporte(service: Service) {
  const viajes = service.viajes ?? [];
  if (!viajes.length) return "Sin viajes registrados";

  const partes = (["ida", "regreso"] as const)
    .map((tipo) => {
      const trip = viajes.find((item) => item.tipo === tipo);
      if (!trip) return null;
      if (trip.estado === "finalizado") return `${tipo} cerrada`;
      if (sinChofer(trip)) return `${tipo} sin chofer`;
      if (trip.proveedorTransporte === "uber") return `${tipo} en Uber`;
      return `${tipo} ${trip.estado.replaceAll("_", " ")}`;
    })
    .filter((parte): parte is string => parte !== null);

  if (!partes.length) return "Sin viajes registrados";
  return partes.join(" - ");
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                 */
/* -------------------------------------------------------------------------- */

export default function OperacionClient({
  services,
  employees,
  jefes,
}: {
  services: Service[];
  employees: Employee[];
  jefes: Jefe[];
}) {
  const router = useRouter();

  const [rango, setRango] = useState<Rango>("hoy");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<Service | null>(null);
  const [creando, setCreando] = useState(false);

  /**
   * El reloj arranca en null y se llena tras el montaje: el tiempo transcurrido
   * cambia entre el render del servidor y el del cliente, y fijarlo aqui evita
   * un desajuste de hidratacion.
   */
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nombreJefe = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const jefe of jefes) {
      const nombre = [jefe.nombre, jefe.apellido].filter(Boolean).join(" ");
      mapa.set(jefe.id, nombre || jefe.email);
    }
    return mapa;
  }, [jefes]);

  /*
   * Servicios del rango elegido, ordenados por el momento que los ubica. El dia
   * se recalcula con el reloj y no en el primer render, porque el tablero queda
   * abierto toda la noche y al pasar la medianoche seguiria mostrando el dia
   * anterior.
   */
  const delRango = useMemo(() => {
    const referenciaAhora = ahora ?? Date.now();
    const hoy = diaBogota(referenciaAhora);
    const semana = getOperationalWeek(new Date(referenciaAhora));

    return services
      .filter((service) => {
        const dia = diaBogota(referencia(service));
        if (!dia) return false;
        if (rango === "hoy") return dia === hoy;
        return dia >= semana.startDate && dia <= semana.endDate;
      })
      .sort(
        (a, b) =>
          new Date(referencia(b)).getTime() - new Date(referencia(a)).getTime(),
      );
  }, [services, rango, ahora]);

  const kpis = useMemo(() => {
    const enCurso = delRango.filter((s) => s.estado === "en_curso");
    const agendados = delRango.filter((s) => s.estado === "agendado");
    const cancelados = delRango.filter((s) => s.estado === "cancelado");
    const facturables = delRango.filter((s) => s.estado !== "cancelado");

    /* Solo promedia lo que ya tiene duracion final; lo pactado no es un hecho. */
    const cerrados = delRango.filter((s) => s.duracionFinalHoras != null);
    const horas = cerrados.reduce(
      (sum, s) => sum + num(s.duracionFinalHoras),
      0,
    );

    const viajesSinChofer = delRango.flatMap((service) =>
      (service.viajes ?? []).filter(sinChofer).map((trip) => ({ service, trip })),
    );

    return {
      enCurso: enCurso.length,
      agendados: agendados.length,
      cancelados: cancelados.length,
      conMulta: cancelados.filter((s) => num(s.totalFinal) > 0).length,
      facturado: facturables.reduce((sum, s) => sum + num(s.totalFinal), 0),
      facturables: facturables.length,
      promedio: cerrados.length ? horas / cerrados.length : 0,
      cerrados: cerrados.length,
      viajesSinChofer,
    };
  }, [delRango]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return delRango.filter((service) => {
      if (filtro === "en_curso" && service.estado !== "en_curso") return false;
      if (filtro === "cerrados" && !CERRADOS.includes(service.estado)) {
        return false;
      }

      if (!termino) return true;
      return [
        codigoServicio(service.id),
        service.empleada?.nombreArtistico ?? "",
        service.cliente?.nombreTelegram ?? "",
        nombreJefe.get(service.jefeId) ?? "",
      ].some((campo) => campo.toLowerCase().includes(termino));
    });
  }, [delRango, filtro, busqueda, nombreJefe]);

  /* Disponibilidad viva del equipo, no del rango: es el cupo de ahora mismo. */
  const disponibilidad = useMemo(() => {
    const contar = (estado: Employee["availabilityStatus"]) =>
      employees.filter(
        (employee) =>
          (employee.availabilityStatus ??
            (employee.disponible ? "disponible" : "ocupada")) === estado,
      ).length;

    return {
      disponibles: contar("disponible"),
      ocupadas: contar("ocupada"),
      inactivas: contar("inactiva"),
      conServicio: new Set(
        delRango
          .filter((s) => s.estado !== "cancelado")
          .map((s) => s.empleadaId),
      ).size,
    };
  }, [employees, delRango]);

  /**
   * Bandeja de eventos reconstruida de las marcas de tiempo que ya guarda cada
   * servicio. No hay tabla de eventos, asi que se derivan y se ordenan.
   */
  const eventos = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      detalle: string;
      iso: string;
    }> = [];

    for (const service of delRango) {
      const codigo = codigoServicio(service.id);
      const empleada = service.empleada?.nombreArtistico ?? "Sin empleada";

      if (service.horaInicioServicio) {
        items.push({
          id: `${service.id}-inicio`,
          label: `Servicio iniciado - ${codigo}`,
          detalle: empleada,
          iso: service.horaInicioServicio,
        });
      }

      if (service.horaFinServicio) {
        items.push({
          id: `${service.id}-fin`,
          label: `Servicio finalizado - ${codigo}`,
          detalle: `${num(service.duracionFinalHoras).toLocaleString(
            APP_LOCALE,
          )} h - ${formatCurrency(service.totalFinal)}`,
          iso: service.horaFinServicio,
        });
      }

      if (service.estado === "cancelado") {
        items.push({
          id: `${service.id}-cancelado`,
          label: `Servicio cancelado - ${codigo}`,
          detalle: empleada,
          iso: service.updatedAt,
        });
      }

      for (const validacion of service.receiptValidations ?? []) {
        if (validacion.estado !== "aprobado") continue;
        items.push({
          id: `${validacion.id}-comprobante`,
          label: `Comprobante validado - ${codigo}`,
          detalle: formatCurrency(validacion.monto),
          iso: validacion.createdAt,
        });
      }
    }

    return items
      .filter((item) => !Number.isNaN(new Date(item.iso).getTime()))
      .sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime())
      .slice(0, 8);
  }, [delRango]);

  /* La pagina es dinamica en el servidor, asi que refrescar la ruta basta. */
  const refrescar = () => router.refresh();

  const rangos: Array<{ id: Rango; label: string }> = [
    { id: "hoy", label: "Hoy" },
    { id: "semana", label: "Semana" },
  ];

  const filtros: Array<{ id: Filtro; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "en_curso", label: "En curso" },
    { id: "cerrados", label: "Cerrados" },
  ];

  const fechaTitulo = new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Servicios"
        description={
          rango === "hoy"
            ? `Torre de control operativa - ${fechaTitulo}`
            : "Torre de control operativa - semana en curso"
        }
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-xl border border-zinc-800 bg-zinc-950 p-[3px]">
              {rangos.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRango(item.id)}
                  className={`rounded-[9px] px-3.5 py-[7px] text-xs font-semibold transition-colors ${
                    rango === item.id
                      ? "bg-[#C5A55A] text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCreando(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#C5A55A] bg-transparent px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black"
            >
              <Plus className="h-[15px] w-[15px]" />
              Nuevo servicio
            </button>
          </>
        }
      />

      <KpiGrid columns={6}>
        <KpiCard
          label="En curso"
          icon={Activity}
          value={kpis.enCurso}
          footnote={`${delRango.length} en el rango`}
        />
        <KpiCard
          label="Duracion promedio"
          icon={Clock}
          value={
            kpis.cerrados
              ? `${kpis.promedio.toLocaleString(APP_LOCALE, {
                  maximumFractionDigits: 1,
                })} h`
              : "--"
          }
          footnote={
            kpis.cerrados
              ? `Sobre ${kpis.cerrados} ${
                  kpis.cerrados === 1 ? "servicio cerrado" : "servicios cerrados"
                }`
              : "Aun sin servicios cerrados"
          }
        />
        <KpiCard
          label="Agendados"
          icon={CalendarClock}
          value={kpis.agendados}
          footnote="Confirmados sin iniciar"
        />
        <KpiCard
          label="Transporte pendiente"
          icon={Car}
          value={kpis.viajesSinChofer.length}
          footnote={
            kpis.viajesSinChofer.length === 1
              ? "1 viaje por asignar"
              : `${kpis.viajesSinChofer.length} viajes por asignar`
          }
        />
        <KpiCard
          label="Facturado"
          icon={Wallet}
          value={formatCurrency(kpis.facturado)}
          footnote={`${kpis.facturables} ${
            kpis.facturables === 1 ? "servicio" : "servicios"
          } sin cancelar`}
        />
        <KpiCard
          label="Cancelados"
          icon={Ban}
          value={kpis.cancelados}
          footnote={
            kpis.conMulta
              ? `${kpis.conMulta} con cargo aplicado`
              : "Sin cargo aplicado"
          }
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title={rango === "hoy" ? "Servicios del dia" : "Servicios de la semana"}
          subtitle="servicios - el codigo abre la ficha, la fila abre la gestion"
          flush
          action={
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar servicio, empleada o cliente"
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
                <Th>Servicio</Th>
                <Th>Empleada</Th>
                <Th>Cliente</Th>
                <Th>Jefe</Th>
                <Th numeric>Pactado</Th>
                <Th numeric>Transcurrido</Th>
                <Th numeric>Total</Th>
                <Th>Estado</Th>
                <Th>Transporte</Th>
              </tr>
            </thead>

            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <Td colSpan={9} className="py-10 text-center text-zinc-500">
                    No hay servicios que coincidan con el filtro.
                  </Td>
                </tr>
              ) : (
                visibles.map((service) => {
                  const inicio = service.horaInicioServicio;
                  const fin = service.horaFinServicio;
                  const transcurrido =
                    inicio && ahora !== null
                      ? duracionLegible(
                          (fin ? new Date(fin).getTime() : ahora) -
                            new Date(inicio).getTime(),
                        )
                      : null;

                  return (
                    <tr
                      key={service.id}
                      onClick={() => setSeleccionado(service)}
                      className="cursor-pointer transition-colors hover:bg-zinc-900/50"
                    >
                      <Td>
                        <span onClick={(event) => event.stopPropagation()}>
                          <RecordLink href={`/admin/services/${service.id}`}>
                            {codigoServicio(service.id)}
                          </RecordLink>
                        </span>
                      </Td>

                      <Td>
                        {service.empleada ? (
                          <span onClick={(event) => event.stopPropagation()}>
                            <PersonCell
                              name={service.empleada.nombreArtistico}
                              meta="empleada"
                              href={`/admin/modelos/${service.empleadaId}`}
                            />
                          </span>
                        ) : (
                          <Empty />
                        )}
                      </Td>

                      <Td>
                        {service.cliente?.nombreTelegram ? (
                          <span className="text-zinc-300">
                            {service.cliente.nombreTelegram}
                          </span>
                        ) : (
                          <span className="text-zinc-500">
                            #{service.clienteId.slice(-4)}
                          </span>
                        )}
                      </Td>

                      <Td>{nombreJefe.get(service.jefeId) ?? <Empty />}</Td>

                      <Td numeric>
                        {`${num(service.duracionPactadaHoras).toLocaleString(
                          APP_LOCALE,
                          { minimumFractionDigits: 2 },
                        )} h`}
                      </Td>

                      <Td numeric>{transcurrido ?? <Empty />}</Td>

                      <Td numeric>
                        {service.estado === "cancelado" &&
                        num(service.totalFinal) === 0 ? (
                          <Empty />
                        ) : (
                          formatCurrency(service.totalFinal)
                        )}
                      </Td>

                      <Td>
                        <StatusBadge
                          tone={ESTADO_TONE[service.estado] ?? "zinc"}
                          dot={service.estado === "en_curso"}
                        >
                          {service.estado.replaceAll("_", " ")}
                        </StatusBadge>
                      </Td>

                      <Td>
                        <span className="text-[11px] text-zinc-500">
                          {resumenTransporte(service)}
                        </span>
                        {service.horaInicioEstimada && !inicio ? (
                          <span className="mt-0.5 block text-[11px] text-zinc-600">
                            {`Llegada ${hora(service.horaInicioEstimada)}`}
                          </span>
                        ) : null}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </ErpTable>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel
            title="Cola de transporte"
            subtitle="viajes internos sin chofer asignado"
            action={
              <StatusBadge tone={kpis.viajesSinChofer.length ? "amber" : "green"}>
                {kpis.viajesSinChofer.length}
              </StatusBadge>
            }
          >
            {kpis.viajesSinChofer.length === 0 ? (
              <p className="text-[13px] text-zinc-500">
                Todos los viajes del rango tienen chofer.
              </p>
            ) : (
              kpis.viajesSinChofer.map(({ service, trip }) => (
                <div
                  key={trip.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-white">
                      {`${codigoServicio(service.id)} - ${trip.tipo}`}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {service.empleada?.nombreArtistico ?? "Sin empleada"}
                      {service.locationNameSnapshot
                        ? ` - ${service.locationNameSnapshot}`
                        : ""}
                    </p>
                  </div>

                  <RecordLink
                    href={`/admin/services/${service.id}`}
                    className="shrink-0 text-xs"
                  >
                    Asignar
                  </RecordLink>
                </div>
              ))
            )}
          </Panel>

          <Panel
            title="Disponibilidad de empleadas"
            subtitle="empleadas - availability_status"
          >
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Disponibles", disponibilidad.disponibles, "green"],
                  ["Ocupadas", disponibilidad.ocupadas, "amber"],
                  ["Inactivas", disponibilidad.inactivas, "zinc"],
                  ["Con servicio", disponibilidad.conServicio, "gold"],
                ] as Array<[string, number, BadgeTone]>
              ).map(([label, valor, tone]) => (
                <div
                  key={label}
                  className="flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3"
                >
                  <StatusBadge tone={tone} className="w-fit">
                    {label}
                  </StatusBadge>
                  <p className="font-heading text-[22px] font-semibold leading-none text-white tabular-nums">
                    {valor}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Ultimos eventos"
            subtitle="derivado de las marcas de tiempo de cada servicio"
          >
            {eventos.length === 0 ? (
              <p className="text-[13px] text-zinc-500">
                Sin movimientos registrados en el rango.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {eventos.map((evento) => (
                  <li
                    key={evento.id}
                    className="flex items-start justify-between gap-3 border-b border-zinc-800/55 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-200">
                        {evento.label}
                      </p>
                      <p className="truncate text-[11px] text-zinc-500">
                        {evento.detalle}
                      </p>
                    </div>

                    <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                      {hora(evento.iso)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      {seleccionado ? (
        <ServiceDetailDialog
          service={seleccionado}
          allServices={services}
          onClose={() => setSeleccionado(null)}
          onUpdated={() => {
            refrescar();
            setSeleccionado(null);
          }}
        />
      ) : null}

      <CreateServiceDialog
        open={creando}
        onClose={() => setCreando(false)}
        onCreated={refrescar}
      />
    </div>
  );
}
