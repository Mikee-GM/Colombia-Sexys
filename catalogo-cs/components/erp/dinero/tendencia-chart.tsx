"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/calculations";
import type { MoneyTrendPoint } from "@/components/erp/dinero/types";

/**
 * Ganancia de la empleada en las ultimas semanas.
 *
 * Una cifra sola no dice si la semana fue buena: 4.000 puede ser el doble de lo
 * normal o la mitad. La serie de al lado es lo que convierte el numero en una
 * lectura, y por eso la ultima barra —la semana que se esta mirando— va en el
 * dorado pleno y el resto un tono por debajo.
 *
 * Una sola serie, asi que un solo color y sin leyenda: el titulo del panel ya
 * dice que se esta midiendo.
 */

const ORO = "#C5A55A";
const ORO_APAGADO = "#8B7635";
const REJILLA = "#27272a";
const TINTA_SUAVE = "#71717a";

/** "2026-08-17" -> "17 ago", que es lo que cabe bajo una barra estrecha. */
function etiquetaSemana(iso: string) {
  const [, mes, dia] = iso.split("-");
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${Number(dia)} ${meses[Number(mes) - 1] ?? ""}`;
}

function Etiqueta({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MoneyTrendPoint & { corto: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const punto = payload[0].payload;
  return (
    <div className="rounded-xl border border-zinc-800 bg-black px-3 py-2 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7635]">
        Semana del {punto.corto}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">
        {formatCurrency(punto.employeeGrossPay)}
      </p>
      <p className="text-[11px] text-zinc-500">
        {punto.servicesCount} servicios · {formatCurrency(punto.salesTotal)} en
        ventas
      </p>
    </div>
  );
}

export default function TendenciaChart({
  puntos,
}: {
  puntos: MoneyTrendPoint[];
}) {
  const datos = puntos.map((punto) => ({
    ...punto,
    corto: etiquetaSemana(punto.weekStart),
  }));
  const ultima = datos.length - 1;

  return (
    <div className="h-[190px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={datos}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap="26%"
        >
          <CartesianGrid
            vertical={false}
            stroke={REJILLA}
            strokeDasharray="2 4"
          />
          <XAxis
            dataKey="corto"
            tickLine={false}
            axisLine={{ stroke: REJILLA }}
            tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: TINTA_SUAVE, fontSize: 11 }}
            tickFormatter={(valor: number) =>
              valor >= 1000 ? `${Math.round(valor / 1000)}k` : String(valor)
            }
          />
          <Tooltip
            content={<Etiqueta />}
            cursor={{ fill: "rgba(197, 165, 90, 0.08)" }}
          />
          <Bar dataKey="employeeGrossPay" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {datos.map((punto, indice) => (
              <Cell
                key={punto.weekStart}
                fill={indice === ultima ? ORO : ORO_APAGADO}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
