"use client";

import { useMemo, useState } from "react";
import { Banknote, HandCoins, Receipt, Wallet } from "lucide-react";

import {
  Empty,
  ErpPageHeader,
  ErpTable,
  KpiCard,
  KpiGrid,
  Panel,
  PersonCell,
  StatusBadge,
  Td,
  TFootRow,
  Th,
  type BadgeTone,
} from "@/components/erp/primitives";
import { formatCurrency } from "@/lib/calculations";
import type { MoneyOverviewRow } from "@/components/erp/dinero/types";

type Filtro = "todas" | "por_pagar" | "deben" | "sin_liquidar";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "por_pagar", label: "Con saldo a favor" },
  { id: "deben", label: "Deben dinero" },
  { id: "sin_liquidar", label: "Sin liquidar" },
];

/** Como se lee el saldo de una fila, con su color. */
function estadoDelSaldo(fila: MoneyOverviewRow): {
  label: string;
  tone: BadgeTone;
} {
  if (fila.settlementStatus === "confirmed") {
    return { label: "Liquidada", tone: "green" };
  }
  if (fila.balance < 0) return { label: "Debe", tone: "red" };
  if (fila.balance > 0) return { label: "Por pagar", tone: "amber" };
  return { label: "Al día", tone: "zinc" };
}

/** Variacion contra el periodo anterior, o nada si no habia con que comparar. */
function Delta({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-zinc-600">sin base</span>;
  const positivo = valor >= 0;
  return (
    <span className={positivo ? "text-green-400" : "text-red-400"}>
      {positivo ? "+" : ""}
      {valor}%
    </span>
  );
}

export default function DineroListado({
  filas,
  startDate,
  endDate,
  esAdmin,
}: {
  filas: MoneyOverviewRow[];
  startDate: string;
  endDate: string;
  esAdmin: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");

  const totales = useMemo(
    () => ({
      porPagar: filas.reduce((suma, f) => suma + Math.max(0, f.balance), 0),
      efectivo: filas.reduce((suma, f) => suma + f.cashOutstanding, 0),
      deuda: filas.reduce((suma, f) => suma + f.debtOutstanding, 0),
      ingreso: filas.reduce((suma, f) => suma + f.totalCollected, 0),
      servicios: filas.reduce((suma, f) => suma + f.servicesCount, 0),
      sinLiquidar: filas.filter((f) => f.settlementStatus === "preview").length,
    }),
    [filas],
  );

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return filas.filter((fila) => {
      if (filtro === "por_pagar" && fila.balance <= 0) return false;
      if (filtro === "deben" && fila.debtOutstanding <= 0) return false;
      if (filtro === "sin_liquidar" && fila.settlementStatus !== "preview") {
        return false;
      }
      if (!texto) return true;
      return `${fila.employeeName} ${fila.realName ?? ""}`
        .toLowerCase()
        .includes(texto);
    });
  }, [filas, filtro, busqueda]);

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Dinero"
        description={`Semana del ${startDate} al ${endDate}. Todo lo que se cobra, se paga y se debe, por persona.`}
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Por pagar al personal"
          value={formatCurrency(totales.porPagar)}
          icon={HandCoins}
          footnote={
            totales.sinLiquidar
              ? `${totales.sinLiquidar} sin liquidar`
              : "Todo liquidado"
          }
        />
        <KpiCard
          label="Efectivo sin entregar"
          value={formatCurrency(totales.efectivo)}
          icon={Wallet}
          footnote="Cobrado al cliente y aún en su poder"
        />
        <KpiCard
          label="Deuda del personal"
          value={formatCurrency(totales.deuda)}
          icon={Receipt}
          footnote="Préstamos y cargos pendientes"
        />
        <KpiCard
          label="Ingreso de la semana"
          value={formatCurrency(totales.ingreso)}
          icon={Banknote}
          footnote={`${totales.servicios} servicios`}
        />
      </KpiGrid>

      <Panel
        title="Personal"
        subtitle="Abre a cualquiera para ver su dinero completo y operar sobre él"
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre"
              className="w-44 rounded-lg border border-zinc-800 bg-black/60 px-3 py-1.5 text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]/50"
            />

            <div className="flex flex-wrap gap-1">
              {FILTROS.map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => setFiltro(opcion.id)}
                  className={
                    filtro === opcion.id
                      ? "rounded-lg border border-[#C5A55A]/40 bg-[#C5A55A]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#C5A55A]"
                      : "rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }
                >
                  {opcion.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Persona</Th>
              <Th numeric>Servicios</Th>
              <Th numeric>Ingreso</Th>
              <Th numeric>Su ganancia</Th>
              <Th numeric>Efectivo</Th>
              <Th numeric>Deuda</Th>
              <Th numeric>Saldo</Th>
              <Th>Estado</Th>
            </tr>
          </thead>

          <tbody>
            {visibles.map((fila) => {
              const estado = estadoDelSaldo(fila);
              return (
                <tr key={fila.employeeId} className="hover:bg-zinc-900/40">
                  <Td>
                    <PersonCell
                      name={fila.employeeName}
                      meta={fila.realName ?? undefined}
                      href={`/admin/dinero/${fila.employeeId}?start=${startDate}&end=${endDate}`}
                    />
                  </Td>
                  <Td numeric>
                    {fila.servicesCount || <Empty />}
                    <div className="text-[11px] text-zinc-500">
                      <Delta valor={fila.salesDeltaPct} />
                    </div>
                  </Td>
                  <Td numeric>{formatCurrency(fila.totalCollected)}</Td>
                  <Td numeric>{formatCurrency(fila.employeeGrossPay)}</Td>
                  <Td numeric>
                    {fila.cashOutstanding ? (
                      <span className="text-amber-400">
                        {formatCurrency(fila.cashOutstanding)}
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </Td>
                  <Td numeric>
                    {fila.debtOutstanding ? (
                      <span className="text-red-400">
                        {formatCurrency(fila.debtOutstanding)}
                      </span>
                    ) : (
                      <Empty />
                    )}
                  </Td>
                  <Td numeric className="font-semibold text-white">
                    {formatCurrency(fila.balance)}
                  </Td>
                  <Td>
                    <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge>
                  </Td>
                </tr>
              );
            })}

            {!visibles.length ? (
              <tr>
                <Td colSpan={8} className="py-10 text-center text-zinc-500">
                  {filas.length
                    ? "Nadie coincide con el filtro."
                    : "Sin movimientos de dinero en esta semana."}
                </Td>
              </tr>
            ) : null}
          </tbody>

          {visibles.length ? (
            <tfoot>
              <TFootRow>
                <Td>{visibles.length} personas</Td>
                <Td numeric>
                  {visibles.reduce((s, f) => s + f.servicesCount, 0)}
                </Td>
                <Td numeric>
                  {formatCurrency(
                    visibles.reduce((s, f) => s + f.totalCollected, 0),
                  )}
                </Td>
                <Td numeric>
                  {formatCurrency(
                    visibles.reduce((s, f) => s + f.employeeGrossPay, 0),
                  )}
                </Td>
                <Td numeric>
                  {formatCurrency(
                    visibles.reduce((s, f) => s + f.cashOutstanding, 0),
                  )}
                </Td>
                <Td numeric>
                  {formatCurrency(
                    visibles.reduce((s, f) => s + f.debtOutstanding, 0),
                  )}
                </Td>
                <Td numeric>
                  {formatCurrency(visibles.reduce((s, f) => s + f.balance, 0))}
                </Td>
                <Td />
              </TFootRow>
            </tfoot>
          ) : null}
        </ErpTable>
      </Panel>

      {!esAdmin ? (
        <p className="text-[12px] text-zinc-500">
          Como jefe ves a tu equipo y puedes registrar movimientos, pero
          deshacerlos y liquidar la semana los reserva el administrador.
        </p>
      ) : null}
    </div>
  );
}
