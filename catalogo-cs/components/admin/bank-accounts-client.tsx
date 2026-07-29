"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteBankAccount,
  saveBankAccount,
  type BankAccount,
  type BankAccountInput,
} from "@/app/admin/bank-accounts/actions";

const emptyAccount: BankAccountInput = {
  banco: "",
  titular: "",
  cuenta: "",
  ultimos4: "",
  clabe: "",
  alias: "",
  activa: true,
};

const inputClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#C5A55A]";

export default function BankAccountsClient({
  initialAccounts,
}: {
  initialAccounts: BankAccount[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BankAccountInput>(emptyAccount);
  const [pending, startTransition] = useTransition();

  function edit(account: BankAccount) {
    setEditingId(account.id);
    setForm({
      banco: account.banco,
      titular: account.titular,
      cuenta: account.cuenta || "",
      ultimos4: account.ultimos4 || "",
      clabe: account.clabe || "",
      alias: account.alias || "",
      activa: account.activa,
    });
  }

  function reset() {
    setEditingId(null);
    setForm(emptyAccount);
  }

  function submit() {
    if (!form.banco.trim() || !form.titular.trim()) {
      toast.error("Banco y titular son obligatorios");
      return;
    }
    if (!form.cuenta?.trim() && !form.clabe?.trim()) {
      toast.error("Ingresa una cuenta, tarjeta o CLABE");
      return;
    }
    startTransition(async () => {
      try {
        const saved = await saveBankAccount(editingId, form);
        setAccounts((current) =>
          editingId
            ? current.map((item) => (item.id === saved.id ? saved : item))
            : [...current, saved],
        );
        reset();
        toast.success(editingId ? "Cuenta actualizada" : "Cuenta agregada");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo guardar",
        );
      }
    });
  }

  function remove(account: BankAccount) {
    if (!window.confirm(`¿Eliminar la cuenta de ${account.banco}?`)) return;
    startTransition(async () => {
      try {
        await deleteBankAccount(account.id);
        setAccounts((current) =>
          current.filter((item) => item.id !== account.id),
        );
        if (editingId === account.id) reset();
        toast.success("Cuenta eliminada");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo eliminar",
        );
      }
    });
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-3">
        {accounts.map((account) => (
          <article
            key={account.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-2xl">{account.banco}</h2>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                      account.activa
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {account.activa ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{account.titular}</p>
                {account.cuenta && (
                  <p className="mt-3 text-sm text-[#E8D5A3]">
                    Cuenta/tarjeta: {account.cuenta}
                  </p>
                )}
                {account.clabe && (
                  <p className="mt-1 text-sm text-[#E8D5A3]">
                    CLABE: {account.clabe}
                  </p>
                )}
                {account.alias && (
                  <p className="mt-2 text-xs text-zinc-600">
                    Alias: {account.alias}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => edit(account)}
                  className="rounded-xl border border-zinc-700 p-3 text-zinc-300 hover:border-[#C5A55A] hover:text-[#C5A55A]"
                  aria-label="Editar cuenta"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(account)}
                  className="rounded-xl border border-red-500/50 p-3 text-red-300 hover:bg-red-500 hover:text-white"
                  aria-label="Eliminar cuenta"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
        {!accounts.length && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-16 text-center text-sm text-zinc-500">
            Todavía no hay cuentas configuradas.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#C5A55A]/40 bg-zinc-950 p-5 xl:sticky xl:top-6">
        <h2 className="font-heading text-2xl">
          {editingId ? "Editar cuenta" : "Nueva cuenta"}
        </h2>
        <div className="mt-5 space-y-3">
          <input
            className={inputClass}
            value={form.banco}
            onChange={(event) => setForm({ ...form, banco: event.target.value })}
            placeholder="Banco"
          />
          <input
            className={inputClass}
            value={form.titular}
            onChange={(event) =>
              setForm({ ...form, titular: event.target.value })
            }
            placeholder="Titular"
          />
          <input
            className={inputClass}
            value={form.cuenta || ""}
            onChange={(event) =>
              setForm({ ...form, cuenta: event.target.value })
            }
            placeholder="Número de cuenta o tarjeta"
          />
          <input
            className={inputClass}
            value={form.clabe || ""}
            onChange={(event) => setForm({ ...form, clabe: event.target.value })}
            maxLength={18}
            inputMode="numeric"
            placeholder="CLABE (18 dígitos)"
          />
          <input
            className={inputClass}
            value={form.alias || ""}
            onChange={(event) => setForm({ ...form, alias: event.target.value })}
            placeholder="Alias interno, opcional"
          />
          <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.activa}
              onChange={(event) =>
                setForm({ ...form, activa: event.target.checked })
              }
              className="accent-[#C5A55A]"
            />
            Compartir esta cuenta con clientes
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#C5A55A] px-4 py-3 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-40"
          >
            <Plus size={16} />
            {editingId ? "Guardar cambios" : "Agregar cuenta"}
          </button>
          {editingId && (
            <button
              type="button"
              disabled={pending}
              onClick={reset}
              className="rounded-xl border border-zinc-700 px-4 text-xs text-zinc-400"
            >
              Cancelar
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
