"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateRecord } from "@/app/admin/liquidations/actions";
import type { LiquidationRecord } from "./types";

const PAYMENT_METHODS: Array<{
  value: LiquidationRecord["paymentMethod"];
  label: string;
}> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "mixto", label: "Mixto" },
  { value: "membresia", label: "Membresía" },
];

interface Props {
  record: LiquidationRecord;
  locked: boolean;
  onUpdated: () => void;
}

export default function LiquidationRecordEditor({
  record,
  locked,
  onUpdated,
}: Props) {
  const [percentage, setPercentage] = useState(record.companyPercentage);
  const [paymentMethod, setPaymentMethod] = useState(record.paymentMethod);
  const [savingPercentage, startPercentageSave] = useTransition();
  const [savingMethod, startMethodSave] = useTransition();

  const handleSavePercentage = () => {
    startPercentageSave(async () => {
      try {
        await updateRecord(record.id, { companyPercentage: percentage });
        toast.success("Porcentaje actualizado");
        onUpdated();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el porcentaje",
        );
      }
    });
  };

  const handleSaveMethod = () => {
    startMethodSave(async () => {
      try {
        await updateRecord(record.id, { paymentMethod });
        toast.success("Método de pago actualizado");
        onUpdated();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el método de pago",
        );
      }
    });
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-zinc-800 bg-black/30 p-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
          <span>
            {percentage}% empresa / {100 - percentage}% modelo
          </span>
          {percentage !== record.companyPercentage && (
            <button
              type="button"
              disabled={locked || savingPercentage}
              onClick={handleSavePercentage}
              className="rounded-full border border-brand-gold px-3 py-0.5 text-[10px] font-bold uppercase text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600"
            >
              {savingPercentage ? "Guardando..." : "Guardar"}
            </button>
          )}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percentage}
          disabled={locked || savingPercentage}
          onChange={(event) => setPercentage(Number(event.target.value))}
          className="w-full accent-brand-gold disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={paymentMethod}
          disabled={locked || savingMethod}
          onChange={(event) =>
            setPaymentMethod(
              event.target.value as LiquidationRecord["paymentMethod"],
            )
          }
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-50"
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
        {paymentMethod !== record.paymentMethod && (
          <button
            type="button"
            disabled={locked || savingMethod}
            onClick={handleSaveMethod}
            className="whitespace-nowrap rounded-full border border-brand-gold px-3 py-1.5 text-[10px] font-bold uppercase text-brand-gold disabled:border-zinc-800 disabled:text-zinc-600"
          >
            {savingMethod ? "Guardando..." : "Confirmar método"}
          </button>
        )}
      </div>
    </div>
  );
}
