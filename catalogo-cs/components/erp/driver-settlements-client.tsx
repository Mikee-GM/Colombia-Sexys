"use client";

import { useMemo, useState, useTransition } from "react";
import { Car, CreditCard, Route, TrendingUp } from "lucide-react";
import { toast } from "sonner";

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
} from "@/components/erp/primitives";
import {
  payDriverSettlement,
  undoDriverSettlement,
  type DriverTripSettlement,
} from "@/app/admin/transport/actions";
import { formatCurrency } from "@/lib/calculations";

type Props = {
  trips: DriverTripSettlement[];
  startDate: string;
  endDate: string;
  /** Solo el admin puede marcar un corte como pagado. */
  canSettle: boolean;
};

type DriverGroup = {
  id: string;
  name: string;
  ida: number;
  regreso: number;
  payout: number;
  settled: boolean;
};

export default function DriverSettlementsClient({
  trips,
  startDate,
  endDate,
  canSettle,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");

  /* El backend devuelve los trayectos sueltos; el corte se arma por chofer. */
  const grupos = useMemo(() => {
    const porChofer = new Map<string, DriverGroup & { total: number }>();

    for (const trip of trips) {
      if (!trip.choferId) continue;

      const grupo = porChofer.get(trip.choferId) ?? {
        id: trip.choferId,
        name: trip.chofer?.nombre || "Chofer",
        ida: 0,
        regreso: 0,
        payout: 0,
        settled: true,
        total: 0,
      };

      if (trip.tipo === "ida") grupo.ida += 1;
      else grupo.regreso += 1;

      grupo.payout += Number(trip.driverPayout) || 0;
      grupo.total += 1;
      if (!trip.driverSettlementId) grupo.settled = false;

      porChofer.set(trip.choferId, grupo);
    }

    return [...porChofer.values()].sort((a, b) => b.payout - a.payout);
  }, [trips]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return grupos;
    return grupos.filter((g) => g.name.toLowerCase().includes(termino));
  }, [grupos, busqueda]);

  const totales = useMemo(
    () => ({
      ida: visibles.reduce((sum, g) => sum + g.ida, 0),
      regreso: visibles.reduce((sum, g) => sum + g.regreso, 0),
      payout: visibles.reduce((sum, g) => sum + g.payout, 0),
      pendientes: grupos.filter((g) => !g.settled).length,
    }),
    [visibles, grupos],
  );

  const handleSettle = (driverId: string) => {
    startTransition(async () => {
      try {
        await payDriverSettlement(driverId, startDate, endDate);
        toast.success("Corte marcado como pagado");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible cerrar el corte",
        );
      }
    });
  };

  /*
   * Deshacer suelta los viajes que colgaban del corte para que la siguiente
   * liquidacion vuelva a recogerlos. Se pide el motivo por la misma razon que
   * en el de la modelo: sin el escrito, dentro de una semana una correccion
   * legitima es indistinguible de un descuadre.
   */
  const handleUndo = (driverId: string) => {
    const motivo = window
      .prompt("¿Por qué hay que reabrir esta semana?")
      ?.trim();
    if (!motivo) return;
    if (motivo.length < 10) {
      toast.error("Escribe un motivo un poco más completo.");
      return;
    }
    startTransition(async () => {
      try {
        await undoDriverSettlement(driverId, startDate, motivo);
        toast.success("Semana reabierta. Los viajes vuelven a estar libres.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible reabrir el corte",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ErpPageHeader
        title="Cortes de Choferes"
        description={`Liquidacion de transporte interno - semana del ${startDate} al ${endDate}`}
      />

      <KpiGrid columns={4}>
        <KpiCard
          label="Viajes de la semana"
          icon={Car}
          value={totales.ida + totales.regreso}
          footnote={`${totales.ida} de ida - ${totales.regreso} de regreso`}
        />
        <KpiCard
          label="Payout a choferes"
          icon={CreditCard}
          value={formatCurrency(totales.payout)}
          footnote="Suma de driver_payout de los trayectos"
        />
        <KpiCard
          label="Choferes con actividad"
          icon={Route}
          value={grupos.length}
          footnote="Solo transporte interno finalizado"
        />
        <KpiCard
          label="Cortes sin pagar"
          icon={TrendingUp}
          value={totales.pendientes}
          footnote={
            totales.pendientes > 0
              ? "Pendientes de marcar como pagados"
              : "Todos los cortes estan cerrados"
          }
        />
      </KpiGrid>

      <Panel
        title="Corte semanal por chofer"
        subtitle="viajes con proveedor interno y estado finalizado"
        flush
        action={
          <input
            type="search"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar chofer"
            className="w-full rounded-xl border border-zinc-800 bg-black px-3.5 py-2.5 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A] sm:w-[240px]"
          />
        }
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Chofer</Th>
              <Th numeric>Ida</Th>
              <Th numeric>Regreso</Th>
              <Th numeric>Trayectos</Th>
              <Th numeric>Payout</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>

          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <Td colSpan={7} className="py-10 text-center text-zinc-500">
                  No hay trayectos internos finalizados en este periodo.
                </Td>
              </tr>
            ) : (
              visibles.map((grupo) => (
                <tr key={grupo.id}>
                  <Td>
                    <PersonCell
                      name={grupo.name}
                      meta="Transporte interno"
                      href={`/admin/choferes`}
                    />
                  </Td>
                  <Td numeric>{grupo.ida || <Empty />}</Td>
                  <Td numeric>{grupo.regreso || <Empty />}</Td>
                  <Td numeric>{grupo.ida + grupo.regreso}</Td>
                  <Td numeric>
                    <span className="font-semibold text-white">
                      {formatCurrency(grupo.payout)}
                    </span>
                  </Td>
                  <Td>
                    {grupo.settled ? (
                      <StatusBadge tone="green">Pagado</StatusBadge>
                    ) : (
                      <StatusBadge tone="amber">Por pagar</StatusBadge>
                    )}
                  </Td>
                  <Td className="text-right">
                    {canSettle && !grupo.settled && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleSettle(grupo.id)}
                        className="rounded-xl border border-[#C5A55A] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
                      >
                        Marcar pagado
                      </button>
                    )}
                    {canSettle && grupo.settled && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleUndo(grupo.id)}
                        className="rounded-xl border border-zinc-800 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-50"
                      >
                        Reabrir
                      </button>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>

          {visibles.length > 0 ? (
            <tfoot>
              <TFootRow>
                <Td>
                  Total &middot; {visibles.length}{" "}
                  {visibles.length === 1 ? "chofer" : "choferes"}
                </Td>
                <Td numeric>{totales.ida}</Td>
                <Td numeric>{totales.regreso}</Td>
                <Td numeric>{totales.ida + totales.regreso}</Td>
                <Td numeric>{formatCurrency(totales.payout)}</Td>
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
