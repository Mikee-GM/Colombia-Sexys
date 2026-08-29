"use client";

import { useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  bloquearClienteAction,
  desbloquearClienteAction,
} from "@/lib/actions/clientes";
import type { ClientDossier } from "@/lib/types";

/*
 * Una sola serie por gráfica, en el dorado de la marca.
 *
 * Sus cuatro pasos quedan a una distancia perceptual de 5 sobre un mínimo de
 * 15: como categorías no se distinguen entre sí ni con visión normal. Para
 * magnitud de una sola medida es exacto, y la identidad de cada barra la lleva
 * su etiqueta en el eje, nunca el color.
 */
const ORO = "#C5A55A";
const REJILLA = "#27272a";
const TINTA_SUAVE = "#71717a";

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const fechaCorta = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleDateString("es-MX", {
        timeZone: "America/Mexico_City",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Nunca";

/** El número que responde la pregunta, sin gráfica alrededor. */
function Dato({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {etiqueta}
      </p>
      <p className="mt-1.5 font-[family-name:var(--font-cormorant)] text-3xl text-white tabular-nums">
        {valor}
      </p>
      {detalle ? (
        <p className="mt-0.5 text-xs text-zinc-500">{detalle}</p>
      ) : null}
    </div>
  );
}

function Panel({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7635]">
        {titulo}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Etiqueta({
  active,
  payload,
  label,
  formato,
}: {
  active?: boolean;
  payload?: { value: number; payload: Record<string, unknown> }[];
  label?: string;
  formato: (valor: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-black px-3 py-2 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7635]">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">
        {formato(payload[0].value)}
      </p>
    </div>
  );
}

export default function FichaCliente({ ficha }: { ficha: ClientDossier }) {
  const [bloqueo, setBloqueo] = useState(ficha.bloqueo);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enCurso, startTransition] = useTransition();

  const nombre = ficha.cliente.nombreTelegram || "Cliente sin nombre";

  const aplicarBloqueo = () => {
    setError(null);
    startTransition(async () => {
      const resultado = bloqueo.bloqueado
        ? await desbloquearClienteAction(ficha.cliente.id, motivo)
        : await bloquearClienteAction(ficha.cliente.id, motivo);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setBloqueo({
        bloqueado: !bloqueo.bloqueado,
        tipo: bloqueo.bloqueado ? null : "permanent_ban",
        motivo: bloqueo.bloqueado ? null : motivo,
        desde: bloqueo.bloqueado ? null : new Date().toISOString(),
        hasta: null,
      });
      setMotivo("");
    });
  };

  const { resumen } = ficha;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-cormorant)] text-3xl text-white">
            {nombre}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
            ID {ficha.cliente.telegramChatId} · Cliente desde hace{" "}
            {ficha.cliente.diasDesdePrimerContacto} días
          </p>
        </div>
        {bloqueo.bloqueado ? (
          <span className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">
            Bloqueado
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Dato
          etiqueta="Gasto total"
          valor={moneda.format(resumen.gastoTotal)}
          detalle={`${resumen.finalizados} servicios finalizados`}
        />
        <Dato
          etiqueta="Ticket promedio"
          valor={moneda.format(resumen.ticketPromedio)}
          detalle={`${resumen.horasTotales} horas en total`}
        />
        <Dato
          etiqueta="Última visita"
          valor={fechaCorta(resumen.ultimoServicioAt)}
          detalle={
            resumen.diasDesdeUltimoServicio === null
              ? "Sin servicios"
              : `Hace ${resumen.diasDesdeUltimoServicio} días`
          }
        />
        <Dato
          etiqueta="Cancelados"
          valor={String(resumen.cancelados)}
          detalle={`de ${resumen.serviciosTotales} solicitados`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel titulo="Gasto por mes">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ficha.porMes}
                margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
              >
                <CartesianGrid stroke={REJILLA} vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
                  tickFormatter={(mes: string) => mes.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickFormatter={(valor: number) => moneda.format(valor)}
                />
                <Tooltip
                  cursor={{ fill: "#18181b" }}
                  content={<Etiqueta formato={(v) => moneda.format(v)} />}
                />
                <Bar
                  dataKey="gasto"
                  fill={ORO}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/*
         * Servicios y gasto van en dos gráficas y no en una con dos ejes: son
         * escalas distintas, y superponerlas deja que el eje elegido decida
         * cuál de las dos "va mejor".
         */}
        <Panel titulo="Servicios por mes">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ficha.porMes}
                margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
              >
                <CartesianGrid stroke={REJILLA} vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
                  tickFormatter={(mes: string) => mes.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "#18181b" }}
                  content={<Etiqueta formato={(v) => `${v} servicios`} />}
                />
                <Bar
                  dataKey="servicios"
                  fill={ORO}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel titulo="Con qué modelos">
          {ficha.porEmpleada.length === 0 ? (
            <p className="text-sm text-zinc-500">Todavía sin servicios.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={ficha.porEmpleada}
                  margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
                >
                  <CartesianGrid stroke={REJILLA} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="nombre"
                    tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    cursor={{ fill: "#18181b" }}
                    content={<Etiqueta formato={(v) => `${v} servicios`} />}
                  />
                  <Bar
                    dataKey="servicios"
                    fill={ORO}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel titulo="Cómo paga">
          {ficha.porMetodoPago.length === 0 ? (
            <p className="text-sm text-zinc-500">Todavía sin servicios.</p>
          ) : (
            <ul className="flex flex-col">
              {ficha.porMetodoPago.map((fila) => (
                <li
                  key={fila.metodo}
                  className="flex items-baseline justify-between gap-4 border-b border-zinc-800/50 py-2.5 last:border-b-0"
                >
                  <span className="text-sm capitalize text-zinc-300">
                    {fila.metodo}
                  </span>
                  <span className="tabular-nums text-sm text-white">
                    {fila.servicios} · {moneda.format(fila.gasto)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel titulo="Últimos servicios">
          {ficha.servicios.length === 0 ? (
            <p className="text-sm text-zinc-500">Todavía sin servicios.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="pb-2 font-semibold">Fecha</th>
                  <th className="pb-2 font-semibold">Modelo</th>
                  <th className="pb-2 font-semibold">Estado</th>
                  <th className="pb-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {ficha.servicios.map((servicio) => (
                  <tr
                    key={servicio.id}
                    className="border-t border-zinc-800/50 text-zinc-300"
                  >
                    <td className="py-2.5 text-zinc-500">
                      {fechaCorta(servicio.fecha)}
                    </td>
                    <td className="py-2.5">
                      {servicio.empleada ?? "Sin asignar"}
                      {servicio.registroManual ? (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                          Manual
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 capitalize text-zinc-500">
                      {servicio.estado}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-white">
                      {moneda.format(servicio.total ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel titulo={bloqueo.bloqueado ? "Bloqueado" : "Bloquear cliente"}>
            {bloqueo.bloqueado ? (
              <p className="mb-3 text-sm text-zinc-400">
                {bloqueo.motivo}
                {bloqueo.desde ? (
                  <span className="mt-1 block text-xs text-zinc-600">
                    Desde {fechaCorta(bloqueo.desde)}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mb-3 text-sm text-zinc-400">
                El bot deja de responderle por completo, sin decírselo.
              </p>
            )}
            <textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              rows={2}
              placeholder={
                bloqueo.bloqueado
                  ? "Por qué se levanta el bloqueo"
                  : "Por qué se bloquea"
              }
              className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#C5A55A] focus:outline-none"
            />
            {error ? (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={aplicarBloqueo}
              disabled={enCurso || motivo.trim().length < 3}
              className={`mt-3 w-full rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-40 ${
                bloqueo.bloqueado
                  ? "border border-zinc-700 text-zinc-300 hover:text-white"
                  : "bg-red-950 text-red-300 hover:bg-red-900"
              }`}
            >
              {enCurso
                ? "Aplicando..."
                : bloqueo.bloqueado
                  ? "Levantar bloqueo"
                  : "Bloquear"}
            </button>
          </Panel>

          <Panel titulo="Reputación">
            <ul className="flex flex-col">
              <li className="flex items-baseline justify-between gap-4 border-b border-zinc-800/50 py-2.5">
                <span className="text-sm text-zinc-400">Le calificaron</span>
                <span className="tabular-nums text-sm text-white">
                  {resumen.calificacionPromedioQueRecibio?.toFixed(1) ?? "Sin datos"}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-4 border-b border-zinc-800/50 py-2.5">
                <span className="text-sm text-zinc-400">Él calificó</span>
                <span className="tabular-nums text-sm text-white">
                  {resumen.calificacionPromedioQueDio?.toFixed(1) ?? "Sin datos"}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-sm text-zinc-400">Reportes recibidos</span>
                <span className="tabular-nums text-sm text-white">
                  {ficha.reportesRecibidos.length}
                </span>
              </li>
            </ul>
            {ficha.lealtad ? (
              <p className="mt-3 border-t border-zinc-800/50 pt-3 text-xs text-zinc-500">
                {ficha.lealtad.puntos} puntos
                {ficha.lealtad.nivel ? ` · nivel ${ficha.lealtad.nivel}` : ""}
              </p>
            ) : null}
          </Panel>
        </div>
      </div>

      {ficha.reportesRecibidos.length > 0 ? (
        <Panel titulo="Reportes en su contra">
          <ul className="flex flex-col gap-3">
            {ficha.reportesRecibidos.map((reporte) => (
              <li
                key={reporte.id}
                className="border-b border-zinc-800/50 pb-3 last:border-b-0 last:pb-0"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  {fechaCorta(reporte.createdAt)} · {reporte.categoria}
                  {reporte.outcome ? ` · ${reporte.outcome}` : ""}
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  {reporte.descripcion}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
