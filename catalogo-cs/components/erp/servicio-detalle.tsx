import Link from "next/link";
import {
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Star,
  Wallet,
} from "lucide-react";

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
  TFootRow,
  Th,
  type BadgeTone,
} from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { Service, Trip } from "@/lib/types";
import { cancellationReasonLabel } from "@/lib/cancellation-reasons";

/**
 * Ficha completa de un servicio.
 *
 * Reune en una sola pagina el cobro, el transporte de ida y regreso, los
 * participantes, los pagos con sus comprobantes y la linea de tiempo. Hasta
 * ahora este detalle solo existia dentro de un dialogo del listado.
 */

const ESTADO_TONE: Record<string, BadgeTone> = {
  en_curso: "green",
  agendado: "gold",
  pendiente: "zinc",
  finalizado: "blue",
  cancelado: "red",
};

const TRIP_TONE: Record<Trip["estado"], BadgeTone> = {
  notificado: "zinc",
  aceptado: "gold",
  en_camino: "blue",
  llegado: "blue",
  en_curso: "green",
  finalizado: "green",
  rechazado: "red",
  cancelado: "red",
};

/** Estados de pago y de validacion de comprobante comparten vocabulario. */
const PAGO_TONE: Record<string, BadgeTone> = {
  aprobado: "green",
  pendiente: "amber",
  rechazado: "red",
};

const num = (value: unknown) => Number(value ?? 0) || 0;

function fechaHora(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

const codigoCorto = (id: string) => `SR-${id.slice(-6).toUpperCase()}`;

export default function ServicioDetalle({ service }: { service: Service }) {
  const viajes = service.viajes ?? [];
  const pagos = service.pagos ?? [];
  const participantes = service.participantes ?? [];
  const comprobantes = service.receiptValidations ?? [];

  const totalFinal = num(service.totalFinal);
  const pagado = num(service.totalPaid);
  const saldo = num(service.pendingBalance);

  /*
   * En un servicio cancelado el cargo original de transporte ya no aplica:
   * mostrarlo contra un costo de cero pintaba un margen que nunca existio. Solo
   * cuenta lo que la oficina decidio cobrarle al cliente viaje por viaje.
   */
  const transporteCobrado =
    service.estado === "cancelado"
      ? viajes.reduce(
          (sum, trip) => (trip.costoCobradoAlCliente ? sum + num(trip.tarifa) : sum),
          0,
        )
      : service.customerTransportCharge != null
        ? num(service.customerTransportCharge)
        : num(service.transportFeeSnapshot);
  const costoTransporte = viajes.reduce(
    (sum, trip) =>
      sum +
      (trip.proveedorTransporte === "uber"
        ? num(trip.tarifa)
        : num(trip.driverPayout)),
    0,
  );

  /* Eventos con marca de tiempo real, ordenados cronologicamente. */
  const linea = [
    { label: "Solicitud creada", iso: service.createdAt },
    { label: "Inicio estimado", iso: service.horaInicioEstimada },
    { label: "Servicio iniciado", iso: service.horaInicioServicio },
    { label: "Servicio finalizado", iso: service.horaFinServicio },
    { label: "Llegada a casa", iso: service.horaLlegadaCasa },
  ]
    .filter((evento): evento is { label: string; iso: string } => !!evento.iso)
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  const duracion = service.duracionFinalHoras ?? service.duracionPactadaHoras;

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title={`Servicio ${codigoCorto(service.id)}`}
        description={`${
          service.serviceType === "grupal" ? "Grupal" : "Individual"
        } - creado el ${fechaHora(service.createdAt) ?? "sin fecha"}`}
        actions={
          <>
            <StatusBadge
              tone={ESTADO_TONE[service.estado] ?? "zinc"}
              dot={service.estado === "en_curso"}
            >
              {String(service.estado).replaceAll("_", " ")}
            </StatusBadge>

            <Link
              href="/admin/services"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.05em] text-zinc-300 transition-colors hover:text-white"
            >
              Volver
            </Link>
          </>
        }
      />

      {service.estado === "cancelado" ? (
        <Panel title="Cancelacion" subtitle="servicios - motivo_cancelacion">
          <div className="flex flex-col">
            <Row
              label="Motivo"
              hint="motivo_cancelacion"
              value={cancellationReasonLabel(service.motivoCancelacion)}
            />
            <Row
              label="Cancelado el"
              hint="cancelado_at"
              value={fechaHora(service.canceladoAt) ?? "Sin registrar"}
            />
            <Row
              label="Origen"
              hint="cancelado_por_user_id"
              value={
                service.canceladoPorUserId
                  ? "Cancelacion manual desde la oficina"
                  : "Cancelacion automatica del sistema"
              }
            />
            {service.notaCancelacion ? (
              <Row
                label="Detalle"
                hint="nota_cancelacion"
                value={service.notaCancelacion}
              />
            ) : null}
          </div>
        </Panel>
      ) : null}

      <KpiGrid columns={4}>
        <KpiCard
          label="Total final"
          icon={CreditCard}
          value={formatCurrency(totalFinal)}
          footnote={`Metodo: ${service.metodoPago}`}
        />
        <KpiCard
          label="Pagado"
          icon={CheckCircle2}
          value={formatCurrency(pagado)}
          footnote={`${pagos.length} ${
            pagos.length === 1 ? "pago registrado" : "pagos registrados"
          }`}
        />
        <KpiCard
          label="Saldo pendiente"
          icon={Wallet}
          value={formatCurrency(saldo)}
          footnote={saldo > 0 ? "Servicio sin saldar" : "Servicio saldado"}
        />
        <KpiCard
          label="Duracion"
          icon={Clock}
          value={`${num(duracion).toLocaleString(APP_LOCALE)} h`}
          footnote={
            service.duracionFinalHoras
              ? `Pactado ${num(service.duracionPactadaHoras)} h`
              : "Aun sin duracion final"
          }
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel
            title="Composicion del cobro"
            subtitle="servicios - totales"
          >
            <div className="flex flex-col">
              <Row
                label="Tarifa hora pactada"
                hint="precio_base_hora_pactado"
                value={formatCurrency(service.precioBaseHoraPactado)}
              />
              <Row
                label="Total base"
                hint="total_base"
                value={formatCurrency(service.totalBase)}
              />
              <Row
                label="Total extras"
                hint="total_extras"
                value={formatCurrency(service.totalExtras)}
              />
              <Row
                label="Transporte cobrado al cliente"
                hint="transport_fee_snapshot"
                value={formatCurrency(transporteCobrado)}
              />
              {num(service.manualTransportAdjustment) !== 0 ? (
                <Row
                  label="Ajuste manual de transporte"
                  hint="manual_transport_adjustment"
                  value={formatCurrency(service.manualTransportAdjustment)}
                />
              ) : null}
              <Row
                label="Total final"
                hint="total_final"
                value={formatCurrency(totalFinal)}
                emphasis
              />
            </div>
          </Panel>

          <Panel
            title="Transporte"
            subtitle="viajes - ida y regreso"
            flush
            action={
              <StatusBadge
                tone={
                  service.estadoLiquidacion === "cerrada" ? "green" : "amber"
                }
              >
                {service.estadoLiquidacion === "cerrada"
                  ? "Transporte cerrado"
                  : "Transporte pendiente"}
              </StatusBadge>
            }
          >
            {viajes.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-zinc-500">
                Este servicio no tiene viajes registrados.
              </p>
            ) : (
              <ErpTable>
                <thead>
                  <tr>
                    <Th>Tramo</Th>
                    <Th>Proveedor</Th>
                    <Th numeric>Tarifa</Th>
                    <Th numeric>Costo empresa</Th>
                    <Th>Comprobante</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>

                <tbody>
                  {viajes.map((trip) => {
                    const costo =
                      trip.proveedorTransporte === "uber"
                        ? num(trip.tarifa)
                        : num(trip.driverPayout);

                    return (
                      <tr key={trip.id}>
                        <Td>
                          <span className="font-semibold capitalize text-white">
                            {trip.tipo}
                          </span>
                        </Td>
                        <Td className="capitalize text-zinc-500">
                          {trip.proveedorTransporte}
                        </Td>
                        <Td numeric>{formatCurrency(trip.tarifa)}</Td>
                        <Td numeric>{formatCurrency(costo)}</Td>
                        <Td>
                          {trip.proveedorTransporte !== "uber" ? (
                            <span className="text-zinc-500">No aplica</span>
                          ) : trip.uberScreenshotUrl ? (
                            <StatusBadge tone="gold">Captura adjunta</StatusBadge>
                          ) : (
                            <StatusBadge tone="red">Sin captura</StatusBadge>
                          )}
                        </Td>
                        <Td>
                          {trip.canceladoConCosto && !trip.fareConfirmedAt ? (
                            <StatusBadge tone="red">Costo por cerrar</StatusBadge>
                          ) : trip.canceladoConCosto ? (
                            <StatusBadge
                              tone={trip.costoCobradoAlCliente ? "gold" : "zinc"}
                            >
                              {trip.costoCobradoAlCliente
                                ? "Cobrado al cliente"
                                : "Lo asume la casa"}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone={TRIP_TONE[trip.estado] ?? "zinc"}>
                              {trip.estado.replaceAll("_", " ")}
                            </StatusBadge>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <TFootRow>
                    <Td>Total</Td>
                    <Td />
                    <Td numeric>{formatCurrency(transporteCobrado)}</Td>
                    <Td numeric>{formatCurrency(costoTransporte)}</Td>
                    <Td />
                    <Td />
                  </TFootRow>
                </tfoot>
              </ErpTable>
            )}
          </Panel>

          {participantes.length > 0 ? (
            <Panel
              title="Participantes"
              subtitle="participantes_servicio"
              flush
            >
              <ErpTable>
                <thead>
                  <tr>
                    <Th>Empleada</Th>
                    <Th>Rol</Th>
                    <Th>Estado</Th>
                    <Th numeric>Horas facturables</Th>
                    <Th numeric>Subtotal</Th>
                  </tr>
                </thead>

                <tbody>
                  {participantes.map((participante) => (
                    <tr key={participante.id}>
                      <Td>
                        <RecordLink
                          href={`/admin/modelos/${participante.employeeId}`}
                        >
                          {participante.employeeId.slice(-6).toUpperCase()}
                        </RecordLink>
                      </Td>
                      <Td className="capitalize">{participante.role}</Td>
                      <Td>
                        <StatusBadge
                          tone={
                            participante.status === "activa" ? "green" : "zinc"
                          }
                        >
                          {participante.status.replaceAll("_", " ")}
                        </StatusBadge>
                      </Td>
                      <Td numeric>{num(participante.billableHours)}</Td>
                      <Td numeric>
                        {formatCurrency(participante.confirmedSubtotal)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </ErpTable>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Personas" subtitle="servicios - relaciones">
            <div className="flex flex-col gap-4">
              <PersonCell
                name={
                  service.empleada?.nombreArtistico ??
                  service.empleadaId.slice(-6).toUpperCase()
                }
                meta="Empleada"
                href={`/admin/modelos/${service.empleadaId}`}
              />

              <div className="h-px bg-zinc-800" />

              <PersonCell
                name={service.cliente?.nombreTelegram ?? "Cliente"}
                meta={`Cliente ${service.clienteId.slice(-6).toUpperCase()}`}
              />

              <div className="h-px bg-zinc-800" />

              <PersonCell
                name={service.jefeId.slice(-6).toUpperCase()}
                meta="Jefe responsable"
                href="/admin/jefes"
              />
            </div>
          </Panel>

          <Panel
            title="Pagos y comprobantes"
            subtitle="servicios_pago - validacion_comprobante"
            flush
          >
            {pagos.length === 0 && comprobantes.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-zinc-500">
                Todavia no hay pagos registrados.
              </p>
            ) : (
              <div className="flex flex-col">
                {pagos.map((pago) => (
                  <div
                    key={pago.id}
                    className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        {formatCurrency(pago.amount)}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {fechaHora(pago.createdAt) ?? "Sin fecha"}
                        {pago.notes ? ` - ${pago.notes}` : ""}
                      </span>
                    </div>

                    <StatusBadge tone={PAGO_TONE[pago.status] ?? "zinc"}>
                      {pago.status}
                    </StatusBadge>
                  </div>
                ))}

                {comprobantes.map((comprobante) => (
                  <div
                    key={comprobante.id}
                    className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        Comprobante
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {fechaHora(comprobante.createdAt) ?? "Sin fecha"}
                      </span>
                    </div>

                    <StatusBadge
                      tone={PAGO_TONE[comprobante.estado ?? ""] ?? "amber"}
                    >
                      {comprobante.estado ?? "pendiente"}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Linea de tiempo" subtitle="eventos del servicio" flush>
            {linea.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-zinc-500">
                Sin eventos registrados.
              </p>
            ) : (
              <div className="flex flex-col">
                {linea.map((evento) => (
                  <div
                    key={evento.label}
                    className="flex items-center justify-between gap-3 border-b border-zinc-800/55 px-5 py-[13px] last:border-b-0"
                  >
                    <span className="font-semibold text-white">
                      {evento.label}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {fechaHora(evento.iso)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Calificacion" subtitle="calificacion del cliente">
            {service.calificacion == null ? (
              <p className="py-4 text-center text-sm text-zinc-500">
                El cliente todavia no califico este servicio.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-[#C5A55A]" />
                  <span className="font-heading text-[26px] font-semibold leading-none text-white tabular-nums">
                    {num(service.calificacion).toLocaleString(APP_LOCALE)}
                  </span>
                  <span className="text-[11px] text-zinc-500">sobre 5</span>
                </div>

                {service.comentariosCalificacion ? (
                  <p className="text-[13px] leading-relaxed text-zinc-400">
                    {service.comentariosCalificacion}
                  </p>
                ) : null}
              </div>
            )}
          </Panel>

          {service.notas || service.notasJefe ? (
            <Panel title="Notas" subtitle="del cliente y del jefe">
              <div className="flex flex-col gap-3">
                {service.notas ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7635]">
                      Cliente
                    </span>
                    <p className="text-[13px] leading-relaxed text-zinc-400">
                      {service.notas}
                    </p>
                  </div>
                ) : null}

                {service.notasJefe ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7635]">
                      Jefe
                    </span>
                    <p className="text-[13px] leading-relaxed text-zinc-400">
                      {service.notasJefe}
                    </p>
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Fila etiqueta / valor con el nombre de la columna de origen. */
function Row({
  label,
  hint,
  value,
  emphasis = false,
}: {
  label: string;
  hint: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/50 py-[9px] last:border-b-0">
      <span
        className={
          emphasis
            ? "text-xs font-semibold text-zinc-200"
            : "text-xs text-zinc-500"
        }
      >
        {label} <span className="text-[11px] text-zinc-500">- {hint}</span>
      </span>

      <span
        className={
          emphasis
            ? "font-semibold tabular-nums text-base text-[#E8D5A3]"
            : "text-[13px] font-semibold tabular-nums text-zinc-200"
        }
      >
        {value}
      </span>
    </div>
  );
}
