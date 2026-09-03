"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Car, Clock, TrendingUp, Wallet } from "lucide-react";

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
  TFootRow,
  Th,
  type BadgeTone,
} from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import { APP_TIME_ZONE } from "@/lib/locale";
import { getOperationalWeek } from "@/lib/week-range";
import type { Driver, Service, Trip, TripZone } from "@/lib/types";

/**
 * Transporte: los viajes y su economia.
 *
 * Hasta ahora la pantalla solo configuraba destinos y la tarifa externa, y los
 * viajes no se veian en ningun lado: habia que abrir servicio por servicio.
 * Aqui se listan con su tarifa, su payout y el estado de confirmacion, y se
 * agregan por zona para ver donde deja margen el transporte.
 */

type Rango = "hoy" | "semana";
type Filtro = "todos" | "sin_confirmar" | "uber";

const ZONA_LABEL: Record<TripZone, string> = {
  montecarlo: "Montecarlo",
  majestic: "Majestic",
  domicilio: "Domicilio",
};

const num = (value: unknown) => Number(value ?? 0) || 0;

const codigoViaje = (id: string) => `VJ-${id.slice(-6).toUpperCase()}`;

function diaLocal(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/* -------------------------------------------------------------------------- */
/* Economia de un viaje                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Lo que cuesta el viaje a la agencia.
 *
 * En un viaje interno el costo es el payout del chofer; en uno de Uber la
 * agencia paga la tarifa completa y no hay payout que repartir.
 */
function costoViaje(trip: Trip) {
  return trip.proveedorTransporte === "uber"
    ? num(trip.tarifa)
    : num(trip.driverPayout);
}

type Confirmacion = { label: string; tone: BadgeTone };

/**
 * Estado del cobro de un viaje.
 *
 * Un viaje de Uber sin captura no se puede liquidar aunque tenga tarifa, asi
 * que se distingue de uno que solo esta pendiente de confirmar.
 */
function confirmacion(trip: Trip): Confirmacion {
  if (trip.fareConfirmationOverride) {
    return { label: "Override", tone: "amber" };
  }
  if (trip.fareConfirmedAt) return { label: "Confirmada", tone: "green" };
  if (
    trip.proveedorTransporte === "uber" &&
    !trip.uberScreenshotUrl &&
    !trip.telegramUberFileId
  ) {
    return { label: "Sin comprobante", tone: "red" };
  }
  return { label: "Sin confirmar", tone: "zinc" };
}

/** Oferta que vencio sin que ningun chofer la aceptara. */
function ofertaExpirada(trip: Trip, ahora: number) {
  if (!trip.ofertaExpiraEn) return false;
  if (trip.horaAceptacion || trip.choferId) return false;
  const vence = new Date(trip.ofertaExpiraEn).getTime();
  return !Number.isNaN(vence) && vence < ahora;
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                 */
/* -------------------------------------------------------------------------- */

type ViajeConServicio = { trip: Trip; service: Service };

export default function TransporteClient({
  services,
  drivers,
  children,
}: {
  services: Service[];
  drivers: Driver[];
  /** Configuracion de destinos y tarifa externa, renderizada por la pagina. */
  children?: ReactNode;
}) {
  const [rango, setRango] = useState<Rango>("hoy");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");

  /* Igual que en la torre de control: el reloj se fija tras el montaje. */
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nombreChofer = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const driver of drivers) mapa.set(driver.id, driver.nombre);
    return mapa;
  }, [drivers]);

  /**
   * Viajes del rango. Se ubican por la hora en que se ofertaron, que es cuando
   * entran a la operacion, y no por la fecha del servicio.
   */
  const viajes = useMemo<ViajeConServicio[]>(() => {
    const referenciaAhora = ahora ?? Date.now();
    const hoy = diaLocal(referenciaAhora);
    const semana = getOperationalWeek(new Date(referenciaAhora));

    return services
      .flatMap((service) =>
        (service.viajes ?? []).map((trip) => ({ trip, service })),
      )
      .filter(({ trip, service }) => {
        const dia = diaLocal(trip.horaNotificacion ?? service.createdAt);
        if (!dia) return false;
        if (rango === "hoy") return dia === hoy;
        return dia >= semana.startDate && dia <= semana.endDate;
      })
      .sort((a, b) => {
        const ta = new Date(
          a.trip.horaNotificacion ?? a.service.createdAt,
        ).getTime();
        const tb = new Date(
          b.trip.horaNotificacion ?? b.service.createdAt,
        ).getTime();
        return tb - ta;
      });
  }, [services, rango, ahora]);

  const kpis = useMemo(() => {
    const referenciaAhora = ahora ?? Date.now();

    const ida = viajes.filter(({ trip }) => trip.tipo === "ida").length;
    const regreso = viajes.filter(({ trip }) => trip.tipo === "regreso").length;

    /* Solo promedia los viajes que efectivamente se aceptaron. */
    const aceptados = viajes.filter(
      ({ trip }) => trip.horaAceptacion && trip.horaNotificacion,
    );
    const esperaTotal = aceptados.reduce(
      (suma, { trip }) =>
        suma +
        (new Date(trip.horaAceptacion as string).getTime() -
          new Date(trip.horaNotificacion as string).getTime()),
      0,
    );

    const expiradas = viajes.filter(({ trip }) =>
      ofertaExpirada(trip, referenciaAhora),
    ).length;

    const costo = viajes.reduce((sum, { trip }) => sum + costoViaje(trip), 0);

    /*
     * El cargo de transporte lo lleva el servicio, no el viaje: sumarlo por
     * viaje lo contaria dos veces en los servicios con ida y regreso.
     */
    const serviciosConViaje = new Map<string, Service>();
    for (const { service } of viajes) serviciosConViaje.set(service.id, service);
    const cobrado = [...serviciosConViaje.values()].reduce(
      (sum, service) =>
        sum +
        (service.customerTransportCharge != null
          ? num(service.customerTransportCharge)
          : num(service.transportFeeSnapshot)),
      0,
    );

    const sinConfirmar = viajes.filter(
      ({ trip }) => confirmacion(trip).label !== "Confirmada",
    ).length;

    return {
      total: viajes.length,
      ida,
      regreso,
      espera: aceptados.length ? esperaTotal / aceptados.length : null,
      aceptados: aceptados.length,
      expiradas,
      costo,
      cobrado,
      margen: cobrado - costo,
      sinConfirmar,
    };
  }, [viajes, ahora]);

  /** Agregado por zona: donde deja margen el transporte y donde lo pierde. */
  const porZona = useMemo(() => {
    const mapa = new Map<
      string,
      { zona: string; viajes: number; cobrado: number; costo: number }
    >();

    for (const { trip } of viajes) {
      const zona = trip.zona ? ZONA_LABEL[trip.zona] : "Sin zona";
      const fila = mapa.get(zona) ?? {
        zona,
        viajes: 0,
        cobrado: 0,
        costo: 0,
      };
      fila.viajes += 1;
      fila.cobrado += num(trip.tarifa);
      fila.costo += costoViaje(trip);
      mapa.set(zona, fila);
    }

    return [...mapa.values()].sort((a, b) => b.viajes - a.viajes);
  }, [viajes]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return viajes.filter(({ trip, service }) => {
      if (
        filtro === "sin_confirmar" &&
        confirmacion(trip).label === "Confirmada"
      ) {
        return false;
      }
      if (filtro === "uber" && trip.proveedorTransporte !== "uber") return false;

      if (!termino) return true;
      return [
        codigoViaje(trip.id),
        codigoServicio(service.id),
        trip.choferId ? (nombreChofer.get(trip.choferId) ?? "") : "",
        trip.zona ? ZONA_LABEL[trip.zona] : "",
      ].some((campo) => campo.toLowerCase().includes(termino));
    });
  }, [viajes, filtro, busqueda, nombreChofer]);

  const totalesVisibles = useMemo(
    () => ({
      tarifa: visibles.reduce((sum, { trip }) => sum + num(trip.tarifa), 0),
      payout: visibles.reduce(
        (sum, { trip }) =>
          sum +
          (trip.proveedorTransporte === "uber" ? 0 : num(trip.driverPayout)),
        0,
      ),
    }),
    [visibles],
  );

  const rangos: Array<{ id: Rango; label: string }> = [
    { id: "hoy", label: "Hoy" },
    { id: "semana", label: "Semana" },
  ];

  const filtros: Array<{ id: Filtro; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "sin_confirmar", label: "Sin confirmar" },
    { id: "uber", label: "Uber" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Transporte"
        description="Viajes, zonas y tarifas"
        actions={
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-[3px] no-scrollbar">
            {rangos.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRango(item.id)}
                className={`shrink-0 whitespace-nowrap rounded-[9px] px-3.5 py-[7px] text-xs font-semibold transition-colors ${
                  rango === item.id
                    ? "bg-[#C5A55A] text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      <KpiGrid columns={5}>
        <KpiCard
          label="Viajes"
          icon={Car}
          value={kpis.total}
          footnote={`${kpis.ida} de ida - ${kpis.regreso} de regreso`}
        />
        <KpiCard
          label="Espera media de aceptacion"
          icon={Clock}
          value={
            kpis.espera === null
              ? "--"
              : `${Math.floor(kpis.espera / 60_000)}m ${String(
                  Math.floor((kpis.espera % 60_000) / 1000),
                ).padStart(2, "0")}s`
          }
          footnote={
            kpis.aceptados
              ? `Sobre ${kpis.aceptados} ${
                  kpis.aceptados === 1 ? "viaje aceptado" : "viajes aceptados"
                }`
              : "Aun sin viajes aceptados"
          }
        />
        <KpiCard
          label="Ofertas expiradas"
          icon={AlertTriangle}
          value={kpis.expiradas}
          footnote="Vencieron sin chofer"
        />
        <KpiCard
          label="Costo de transporte"
          icon={Wallet}
          value={formatCurrency(kpis.costo)}
          footnote={`Cobrado al cliente: ${formatCurrency(kpis.cobrado)}`}
        />
        <KpiCard
          label="Margen"
          icon={TrendingUp}
          value={formatCurrency(kpis.margen)}
          footnote={`${kpis.sinConfirmar} ${
            kpis.sinConfirmar === 1
              ? "viaje sin confirmar"
              : "viajes sin confirmar"
          }`}
        />
      </KpiGrid>

      <Panel
        title="Economia por zona"
        subtitle="tarifa del viaje contra lo que cuesta, no el cargo del servicio"
        flush
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Zona</Th>
              <Th numeric>Viajes</Th>
              <Th numeric>Tarifa</Th>
              <Th numeric>Costo</Th>
              <Th numeric>Margen</Th>
            </tr>
          </thead>

          <tbody>
            {porZona.length === 0 ? (
              <tr>
                <Td colSpan={5} className="py-10 text-center text-zinc-500">
                  No hay viajes registrados en el rango.
                </Td>
              </tr>
            ) : (
              porZona.map((fila) => (
                <tr key={fila.zona}>
                  <Td>
                    <span className="font-semibold text-white">{fila.zona}</span>
                  </Td>
                  <Td numeric>{fila.viajes}</Td>
                  <Td numeric>{formatCurrency(fila.cobrado)}</Td>
                  <Td numeric>{formatCurrency(fila.costo)}</Td>
                  <Td numeric>{formatCurrency(fila.cobrado - fila.costo)}</Td>
                </tr>
              ))
            )}
          </tbody>

          {porZona.length ? (
            <tfoot>
              <TFootRow>
                <Td>Total</Td>
                <Td numeric>
                  {porZona.reduce((sum, fila) => sum + fila.viajes, 0)}
                </Td>
                <Td numeric>
                  {formatCurrency(
                    porZona.reduce((sum, fila) => sum + fila.cobrado, 0),
                  )}
                </Td>
                <Td numeric>
                  {formatCurrency(
                    porZona.reduce((sum, fila) => sum + fila.costo, 0),
                  )}
                </Td>
                <Td numeric>
                  {formatCurrency(
                    porZona.reduce(
                      (sum, fila) => sum + (fila.cobrado - fila.costo),
                      0,
                    ),
                  )}
                </Td>
              </TFootRow>
            </tfoot>
          ) : null}
        </ErpTable>
      </Panel>

      <Panel
        title="Viajes del rango"
        subtitle="viajes - estado y confirmacion de tarifa"
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar viaje, servicio o chofer"
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
              <Th>Viaje</Th>
              <Th>Tramo</Th>
              <Th>Servicio</Th>
              <Th>Chofer</Th>
              <Th>Zona</Th>
              <Th>Proveedor</Th>
              <Th numeric>Tarifa</Th>
              <Th numeric>Payout</Th>
              <Th>Confirmacion</Th>
            </tr>
          </thead>

          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <Td colSpan={9} className="py-10 text-center text-zinc-500">
                  No hay viajes que coincidan con el filtro.
                </Td>
              </tr>
            ) : (
              visibles.map(({ trip, service }) => {
                const estado = confirmacion(trip);
                const esUber = trip.proveedorTransporte === "uber";

                return (
                  <tr key={trip.id}>
                    <Td>
                      <span className="font-semibold text-white">
                        {codigoViaje(trip.id)}
                      </span>
                    </Td>

                    <Td>
                      <span className="capitalize text-zinc-300">
                        {trip.tipo}
                      </span>
                    </Td>

                    <Td>
                      <RecordLink href={`/admin/services/${service.id}`}>
                        {codigoServicio(service.id)}
                      </RecordLink>
                    </Td>

                    <Td>
                      {esUber ? (
                        <span className="text-zinc-500">Uber</span>
                      ) : trip.choferId ? (
                        <RecordLink href={`/admin/drivers/${trip.choferId}`}>
                          {nombreChofer.get(trip.choferId) ?? "Chofer"}
                        </RecordLink>
                      ) : (
                        <StatusBadge tone="amber">Sin asignar</StatusBadge>
                      )}
                    </Td>

                    <Td>{trip.zona ? ZONA_LABEL[trip.zona] : <Empty />}</Td>

                    <Td>
                      <StatusBadge tone={esUber ? "blue" : "zinc"}>
                        {esUber ? "Uber" : "Interno"}
                      </StatusBadge>
                    </Td>

                    <Td numeric>{formatCurrency(trip.tarifa)}</Td>

                    <Td numeric>
                      {esUber ? <Empty /> : formatCurrency(trip.driverPayout)}
                    </Td>

                    <Td>
                      <StatusBadge tone={estado.tone}>
                        {estado.label}
                      </StatusBadge>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>

          {visibles.length ? (
            <tfoot>
              <TFootRow>
                <Td colSpan={6}>{`${visibles.length} ${
                  visibles.length === 1 ? "viaje" : "viajes"
                }`}</Td>
                <Td numeric>{formatCurrency(totalesVisibles.tarifa)}</Td>
                <Td numeric>{formatCurrency(totalesVisibles.payout)}</Td>
                <Td />
              </TFootRow>
            </tfoot>
          ) : null}
        </ErpTable>
      </Panel>

      {children}
    </div>
  );
}
