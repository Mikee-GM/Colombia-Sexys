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

/**
 * Ingreso facturado por dia de la semana.
 *
 * Antes eran divs con `height` en porcentaje dentro de un contenedor flex de
 * altura automatica. Un porcentaje solo resuelve contra un padre con altura
 * definida, asi que las barras salian de cero pixeles: la grafica estaba ahi
 * pero no se veia ninguna barra. Ahora la geometria la calcula Recharts sobre
 * un alto real.
 *
 * Una sola serie, asi que un solo color y sin leyenda: el titulo del panel ya
 * dice que es. El dorado de la marca no sirve para varias series —sus cuatro
 * pasos quedan a una distancia perceptual de 5 sobre 15 minimo, o sea que no se
 * distinguen entre si— pero para magnitud de una sola medida es exacto.
 */

const ORO = "#C5A55A";
const ORO_APAGADO = "#8B7635";
const REJILLA = "#27272a";
const TINTA_SUAVE = "#71717a";

export interface IngresoDiario {
  corto: string;
  total: number;
}

function Etiqueta({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-black px-3 py-2 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7635]">
        {label}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  );
}

export default function IngresoPorDiaChart({
  datos,
}: {
  datos: IngresoDiario[];
}) {
  const mayor = Math.max(...datos.map((item) => item.total), 0);

  return (
    <div className="mt-2 h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={datos}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap="24%"
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
          <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {datos.map((item) => (
              // El dia mas fuerte de la semana se lee de un vistazo; el resto
              // queda en el mismo dorado, un tono por debajo.
              <Cell
                key={item.corto}
                fill={item.total > 0 && item.total === mayor ? ORO : ORO_APAGADO}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
