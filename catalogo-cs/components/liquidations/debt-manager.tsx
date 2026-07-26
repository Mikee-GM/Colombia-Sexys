"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addDebtPayment,
  createDebt,
  deleteDebt,
  deleteDebtPayment,
  getDebts,
} from "@/app/admin/liquidations/actions";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/calculations";
import type { LiquidationDebt } from "./types";

interface Props {
  employeeId: string;
  employeeName: string;
}

export default function DebtManager({ employeeId, employeeName }: Props) {
  const [debts, setDebts] = useState<LiquidationDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentDebtId, setPaymentDebtId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const loadDebts = useCallback(async () => {
    setLoading(true);
    try {
      setDebts((await getDebts(employeeId)) ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cargar las deudas");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void loadDebts();
  }, [loadDebts]);

  const run = async (operation: () => Promise<unknown>, successMessage: string) => {
    setSubmitting(true);
    try {
      await operation();
      toast.success(successMessage);
      await loadDebts();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La operación no pudo completarse");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async () => {
    const parsedAmount = Number(amount);
    if (parsedAmount <= 0 || description.trim().length < 2) {
      toast.error("Ingresa un monto válido y una descripción");
      return;
    }
    const success = await run(
      () => createDebt(employeeId, { amount: parsedAmount, description: description.trim() }),
      "Préstamo registrado",
    );
    if (success) {
      setAmount("");
      setDescription("");
      setShowForm(false);
    }
  };

  const handleAddPayment = async (debtId: string) => {
    const parsedAmount = Number(paymentAmount);
    if (parsedAmount <= 0) {
      toast.error("Ingresa un monto de abono válido");
      return;
    }
    const success = await run(
      () =>
        addDebtPayment(employeeId, debtId, {
          amount: parsedAmount,
          note: paymentNote.trim() || undefined,
        }),
      "Abono registrado",
    );
    if (success) {
      setPaymentAmount("");
      setPaymentNote("");
      setPaymentDebtId(null);
    }
  };

  const handleDeleteDebt = async (debtId: string) => {
    if (!confirm("¿Deseas retirar esta deuda del historial activo?")) return;
    await run(() => deleteDebt(employeeId, debtId), "Deuda retirada");
  };

  const handleDeletePayment = async (debtId: string, paymentId: string) => {
    if (!confirm("¿Deseas eliminar este abono?")) return;
    await run(
      () => deleteDebtPayment(employeeId, debtId, paymentId),
      "Abono eliminado",
    );
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-md">
      <header className="flex flex-col gap-4 border-b border-zinc-800 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-serif text-lg font-semibold text-zinc-100">Préstamos y deudas</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Saldos a favor de la empresa correspondientes a {employeeName}.
          </p>
        </div>
        <Button
          onClick={() => setShowForm((visible) => !visible)}
          className="rounded-full bg-brand-gold text-black hover:bg-brand-gold/80"
        >
          Nuevo préstamo
        </Button>
      </header>

      {showForm && (
        <div className="grid gap-4 border-b border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 lg:grid-cols-[1fr_2fr_auto] lg:items-end">
          <InputField
            label="Monto total"
            type="number"
            value={amount}
            onChange={setAmount}
            placeholder="5000"
          />
          <InputField
            label="Concepto o descripción"
            value={description}
            onChange={setDescription}
            placeholder="Préstamo para pasajes"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>Guardar</Button>
          </div>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {loading ? (
          <p className="text-sm text-zinc-500">Cargando...</p>
        ) : debts.length === 0 ? (
          <p className="py-4 text-center text-sm italic text-zinc-600">
            No hay deudas activas para esta empleada.
          </p>
        ) : (
          <div className="space-y-6">
            {debts.map((debt) => {
              const paid = debt.status === "paid" || debt.remainingAmount <= 0;
              return (
                <article
                  key={debt.id}
                  className={`rounded-2xl border p-4 sm:p-6 ${
                    paid
                      ? "border-green-900/30 bg-green-900/5"
                      : "border-zinc-800 bg-zinc-900/30"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-zinc-200">{debt.description}</h3>
                      <p className="text-xs text-zinc-500">{formatDateTime(debt.createdAt)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right">
                        <p className="text-sm text-zinc-400">Total: {formatCurrency(debt.amount)}</p>
                        <p className={`text-lg font-bold ${paid ? "text-green-400" : "text-brand-gold"}`}>
                          Resta: {formatCurrency(debt.remainingAmount)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDebt(debt.id)}
                        disabled={submitting}
                        className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                        aria-label={`Retirar deuda ${debt.description}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 border-l-2 border-zinc-800 pl-4">
                    <h4 className="text-xs font-semibold uppercase text-zinc-500">Historial de pagos</h4>
                    {debt.payments.length > 0 ? (
                      debt.payments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/50 p-2 text-sm text-zinc-400">
                          <span>{formatDateTime(payment.createdAt)} - {payment.note || "Abono"}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-medium text-green-400">{formatCurrency(payment.amount)}</span>
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(debt.id, payment.id)}
                              disabled={submitting}
                              className="p-1 text-zinc-600 hover:text-red-400"
                              aria-label="Eliminar abono"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-600">No hay pagos registrados.</p>
                    )}
                  </div>

                  {!paid && (
                    <div className="mt-4 border-t border-zinc-800 pt-4">
                      {paymentDebtId === debt.id ? (
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                          <InputField
                            label="Monto"
                            type="number"
                            value={paymentAmount}
                            onChange={setPaymentAmount}
                            placeholder="Monto del abono"
                            compact
                          />
                          <InputField
                            label="Nota"
                            value={paymentNote}
                            onChange={setPaymentNote}
                            placeholder="Nota opcional"
                            compact
                          />
                          <div className="flex items-end gap-2">
                            <Button size="sm" onClick={() => handleAddPayment(debt.id)} disabled={submitting}>Abonar</Button>
                            <Button size="sm" variant="ghost" onClick={() => setPaymentDebtId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setPaymentDebtId(debt.id)}>
                          Registrar abono
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "number";
  compact?: boolean;
}) {
  return (
    <label className="block text-xs text-zinc-400">
      <span className={compact ? "sr-only" : "mb-1 block"}>{label}</span>
      <input
        type={type}
        min={type === "number" ? "0.01" : undefined}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-gold"
      />
    </label>
  );
}
