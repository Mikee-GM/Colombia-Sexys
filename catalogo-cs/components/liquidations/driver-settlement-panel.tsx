"use client";

import { useState } from "react";
import { toast } from "sonner";
import { confirmDriverSettlement } from "@/app/admin/liquidations/actions";
import type { DriverLiquidationReport } from "./types";

const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

const statusLabel: Record<DriverLiquidationReport["weeklySettlement"]["status"], string> = {
  preview: "Sin actividad registrada",
  pending: "Pendiente de pago",
  paid: "Pagada",
};

export default function DriverSettlementPanel({
  report,
  period,
  onConfirmed,
  ranking,
}: {
  report: DriverLiquidationReport;
  period: { start: Date; end: Date };
  onConfirmed: () => void;
  ranking?: { position: number; total: number } | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const { weeklySettlement, trips, driver } = report;

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmDriverSettlement(
        period.start.toISOString().slice(0, 10),
        period.end.toISOString().slice(0, 10),
        driver.id,
      );
      toast.success("Liquidación semanal confirmada");
      onConfirmed();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No fue posible confirmar la liquidación",
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      {ranking && (
        <span className="inline-block w-fit rounded-full border border-brand-gold/30 bg-brand-gold/10 px-3 py-1 text-xs font-bold text-brand-gold">
          Ranking #{ranking.position} de {ranking.total}
        </span>
      )}
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Total de la semana</p>
            <p className="mt-2 font-serif text-2xl text-zinc-100">{money(weeklySettlement.totalPay)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Estado</p>
            <p className="mt-2 font-serif text-2xl text-zinc-100">
              {statusLabel[weeklySettlement.status]}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={confirming || weeklySettlement.status === "paid" || trips.length === 0}
          onClick={() => void handleConfirm()}
          className="mt-5 w-full rounded-xl border border-brand-gold py-3 text-xs font-semibold uppercase tracking-wider text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600"
        >
          {weeklySettlement.status === "paid"
            ? "Liquidación pagada"
            : confirming
              ? "Confirmando"
              : "Confirmar liquidación semanal"}
        </button>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Viajes de la semana
        </h2>
        <div className="space-y-2">
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="flex items-center justify-between rounded-xl border border-zinc-900 p-3 text-xs text-zinc-400"
            >
              <span className="capitalize">
                {trip.tipo} · {trip.zona} ·{" "}
                {trip.horaFinViaje
                  ? new Date(trip.horaFinViaje).toLocaleDateString("es-MX")
                  : "--"}
              </span>
              <span className="text-zinc-200">{money(trip.driverPayout)}</span>
            </div>
          ))}
          {trips.length === 0 && (
            <p className="text-sm text-zinc-500">Sin viajes en esta semana.</p>
          )}
        </div>
      </section>
    </div>
  );
}
