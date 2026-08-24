"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CreditCard, Landmark, Wallet } from "lucide-react";

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
  Up,
  type BadgeTone,
} from "@/components/erp/primitives";
import { formatCurrency, formatDate } from "@/lib/calculations";
import type { DebtWithEmployee } from "@/components/liquidations/types";

/** Dias desde que se abrio la deuda; a partir de 14 se considera mora. */
const MORA_DIAS = 14;

function diasDesde(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

type Estado = { label: string; tone: BadgeTone };

function estadoDeuda(debt: DebtWithEmployee): Estado {
  if (debt.remainingAmount <= 0) return { label: "Saldada", tone: "green" };
  if (diasDesde(debt.createdAt) >= MORA_DIAS) {
    return { label: "En mora", tone: "red" };
  }
  return { label: "Vigente", tone: "amber" };
}

type Filtro = "todas" | "mora" | "saldadas";

export default function CarteraClient({ debts }: { debts: DebtWithEmployee[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");

  const totales = useMemo(() => {
    const abiertas = debts.filter((d) => d.remainingAmount > 0);
    const enMora = abiertas.filter((d) => diasDesde(d.createdAt) >= MORA_DIAS);

    return {
      deudaTotal: abiertas.reduce((sum, d) => sum + d.remainingAmount, 0),
      recaudado: debts.reduce((sum, d) => sum + d.paidAmount, 0),
      montoMora: enMora.reduce((sum, d) => sum + d.remainingAmount, 0),
      casosMora: enMora.length,
      empleadasConSaldo: new Set(abiertas.map((d) => d.employeeId)).size,
    };
  }, [debts]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return debts.filter((debt) => {
      if (filtro === "mora") {
        if (debt.remainingAmount <= 0) return false;
        if (diasDesde(debt.createdAt) < MORA_DIAS) return false;
      }
      if (filtro === "saldadas" && debt.remainingAmount > 0) return false;

      if (!termino) return true;
      const nombre = debt.employee?.name ?? "";
      const real = debt.employee?.realName ?? "";
      return (
        nombre.toLowerCase().includes(termino) ||
        real.toLowerCase().includes(termino) ||
        debt.description.toLowerCase().includes(termino)
      );
    });
  }, [debts, filtro, busqueda]);

  /* Los totales del pie corresponden a las filas visibles, no a toda la cartera. */
  const totalesVisibles = useMemo(
    () => ({
      original: visibles.reduce((sum, d) => sum + Number(d.amount), 0),
      abonado: visibles.reduce((sum, d) => sum + d.paidAmount, 0),
      saldo: visibles.reduce((sum, d) => sum + d.remainingAmount, 0),
    }),
    [visibles],
  );

  const filtros: Array<{ id: Filtro; label: string }> = [
    { id: "todas", label: "Todas" },
    { id: "mora", label: "En mora" },
    { id: "saldadas", label: "Saldadas" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Cartera y Deudas"
        description="Saldos de empleadas, abonos y efectivo por conciliar"
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Deuda total abierta"
          icon={Wallet}
          value={formatCurrency(totales.deudaTotal)}
          footnote={`${totales.empleadasConSaldo} ${
            totales.empleadasConSaldo === 1 ? "empleada" : "empleadas"
          } con saldo`}
        />
        <KpiCard
          label="Abonado historico"
          icon={CreditCard}
          value={formatCurrency(totales.recaudado)}
          footnote={<Up>{`${debts.length} deudas registradas`}</Up>}
        />
        <KpiCard
          label={`En mora - mas de ${MORA_DIAS} dias`}
          icon={AlertTriangle}
          value={formatCurrency(totales.montoMora)}
          footnote={`${totales.casosMora} ${
            totales.casosMora === 1 ? "caso" : "casos"
          }`}
        />
        <KpiCard
          label="Deudas saldadas"
          icon={Landmark}
          value={debts.filter((d) => d.remainingAmount <= 0).length}
          footnote="Sin saldo pendiente"
        />
      </KpiGrid>

      <Panel
        title="Cartera de deudas"
        subtitle="liquidaciones_deuda y liquidaciones_pago"
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar empleada o concepto"
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
              <Th>Empleada</Th>
              <Th>Concepto</Th>
              <Th numeric>Monto original</Th>
              <Th numeric>Abonado</Th>
              <Th numeric>Saldo</Th>
              <Th numeric>Antiguedad</Th>
              <Th>Estado</Th>
            </tr>
          </thead>

          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <Td colSpan={7} className="py-10 text-center text-zinc-500">
                  No hay deudas que coincidan con el filtro.
                </Td>
              </tr>
            ) : (
              visibles.map((debt) => {
                const estado = estadoDeuda(debt);
                const dias = diasDesde(debt.createdAt);

                return (
                  <tr key={debt.id}>
                    <Td>
                      <PersonCell
                        name={debt.employee?.name ?? "Empleada eliminada"}
                        meta={formatDate(debt.createdAt)}
                        href={
                          debt.employee
                            ? `/admin/modelos/${debt.employee.id}`
                            : undefined
                        }
                      />
                    </Td>
                    <Td>{debt.description}</Td>
                    <Td numeric>{formatCurrency(debt.amount)}</Td>
                    <Td numeric className="text-zinc-500">
                      {debt.paidAmount > 0 ? formatCurrency(debt.paidAmount) : <Empty />}
                    </Td>
                    <Td numeric>
                      {debt.remainingAmount > 0 ? (
                        <span
                          className={
                            estado.tone === "red"
                              ? "font-semibold text-red-400"
                              : "font-semibold text-white"
                          }
                        >
                          {formatCurrency(debt.remainingAmount)}
                        </span>
                      ) : (
                        <Empty />
                      )}
                    </Td>
                    <Td numeric>
                      {debt.remainingAmount > 0 ? `${dias} dias` : <Empty />}
                    </Td>
                    <Td>
                      <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>

          {visibles.length > 0 ? (
            <tfoot>
              <TFootRow>
                <Td>
                  Total &middot; {visibles.length}{" "}
                  {visibles.length === 1 ? "deuda" : "deudas"}
                </Td>
                <Td />
                <Td numeric>{formatCurrency(totalesVisibles.original)}</Td>
                <Td numeric>{formatCurrency(totalesVisibles.abonado)}</Td>
                <Td numeric>{formatCurrency(totalesVisibles.saldo)}</Td>
                <Td />
                <Td />
              </TFootRow>
            </tfoot>
          ) : null}
        </ErpTable>
      </Panel>
    </div>
  );
}
