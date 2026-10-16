"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  applyConfirmedGroupReceipt,
  confirmReceiptCep,
  getReceiptBankAccounts,
  type ReceiptBankAccount,
} from "@/lib/actions/evidence";

export type ReceiptVerificationInfo = {
  id: string;
  serviceId?: string | null;
  serviceType?: "individual" | "grupal" | null;
  status?: string | null;
  amount?: number | null;
  expectedAmount?: number | null;
  originBank?: string | null;
  destinationBank?: string | null;
  destinationAccount?: string | null;
  trackingKey?: string | null;
  transferDate?: string | null;
  paymentConfirmedAt?: string | null;
};

const BANXICO_CEP_URL = "https://www.banxico.org.mx/cep/";
const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-[#C5A55A]";

function field(value?: string | number | null) {
  return value == null || String(value).trim() === ""
    ? "No visible en la foto"
    : String(value);
}

export default function ReceiptVerification({
  receipt,
  onConfirmed,
}: {
  receipt: ReceiptVerificationInfo;
  onConfirmed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<ReceiptBankAccount[]>([]);
  const [pending, startTransition] = useTransition();
  const [confirmedAt, setConfirmedAt] = useState(receipt.paymentConfirmedAt);
  const [groupApplied, setGroupApplied] = useState(
    receipt.status === "PAGO_REGISTRADO",
  );
  const [attested, setAttested] = useState(false);
  const [trackingKey, setTrackingKey] = useState(receipt.trackingKey ?? "");
  const [transferDate, setTransferDate] = useState(receipt.transferDate ?? "");
  const [originBank, setOriginBank] = useState(receipt.originBank ?? "");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState(
    receipt.amount == null ? "" : String(receipt.amount),
  );
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const selectedAccountNumber = selectedAccount?.clabe || selectedAccount?.cuenta;

  function toggle() {
    if (!open && accounts.length === 0) {
      startTransition(async () => {
        try {
          setAccounts(await getReceiptBankAccounts());
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "No se pudieron cargar las cuentas",
          );
        }
      });
    }
    setOpen(!open);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Dato copiado");
    } catch {
      toast.error("No se pudo copiar el dato");
    }
  }

  function confirm() {
    if (!attested) return;
    const parsedAmount = Number(amount);
    if (
      !trackingKey.trim() ||
      !originBank.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(transferDate) ||
      !accountId ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      toast.error("Completa los datos comprobados en el CEP");
      return;
    }
    startTransition(async () => {
      try {
        const result = await confirmReceiptCep(receipt.id, {
          claveRastreo: trackingKey.trim(),
          fechaTransferencia: transferDate,
          bancoOrigen: originBank.trim(),
          cuentaDestinoId: accountId,
          monto: parsedAmount,
        });
        setConfirmedAt(result.pagoConfirmadoAt ?? new Date().toISOString());
        toast.success("Consulta del CEP registrada");
        if (receipt.serviceType === "grupal" && receipt.serviceId) {
          try {
            await applyConfirmedGroupReceipt(receipt.serviceId, receipt.id, parsedAmount);
            setGroupApplied(true);
            toast.success("Pago aplicado al servicio grupal");
          } catch {
            toast.error("CEP registrado; falta aplicar el pago al servicio grupal");
          }
        }
        onConfirmed?.();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo registrar la confirmación",
        );
      }
    });
  }

  function applyGroupPayment() {
    if (!receipt.serviceId) return;
    startTransition(async () => {
      try {
        await applyConfirmedGroupReceipt(receipt.serviceId!, receipt.id, Number(amount));
        setGroupApplied(true);
        onConfirmed?.();
        toast.success("Pago aplicado al servicio grupal");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo aplicar el pago");
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-white">Verificación de transferencia</p>
          <p className="text-xs text-zinc-400">
            {confirmedAt
              ? "CEP comprobado manualmente"
              : "La lectura de la foto no confirma que el dinero llegó"}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded-lg border border-[#C5A55A] px-3 py-2 text-xs font-semibold text-[#E8D5A3]"
        >
          {open ? "Ocultar datos" : "Revisar datos"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Clave de rastreo", receipt.trackingKey],
              ["Fecha de transferencia", receipt.transferDate],
              ["Banco de origen", receipt.originBank],
              ["Banco de destino", receipt.destinationBank],
              ["Cuenta beneficiaria", receipt.destinationAccount],
              ["Monto leído", receipt.amount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-zinc-800 p-2">
                <p className="text-[11px] text-zinc-500">{label}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-all text-xs">{field(value)}</span>
                  {value != null && String(value).trim() !== "" && (
                    <button
                      type="button"
                      onClick={() => void copy(String(value))}
                      className="shrink-0 text-[11px] text-[#C5A55A]"
                    >
                      Copiar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {receipt.expectedAmount != null && (
            <p className="text-xs text-zinc-400">
              Monto esperado: ${Number(receipt.expectedAmount).toFixed(2)}
            </p>
          )}
          <a
            href={BANXICO_CEP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[#C5A55A] px-3 py-2 text-xs font-semibold text-[#E8D5A3]"
          >
            Consultar CEP en Banxico <ExternalLink size={14} />
          </a>
          <p className="text-xs text-zinc-400">
            Banxico solicita un código de seguridad. Si falta un dato en la foto,
            consúltalo al cliente y escríbelo tras revisar el CEP oficial.
          </p>

          {!confirmedAt && receipt.serviceId && (
            <div className="space-y-3 border-t border-zinc-800 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span>Clave de rastreo del CEP</span>
                  <input className={inputClass} value={trackingKey} onChange={(event) => setTrackingKey(event.target.value)} />
                </label>
                <label className="space-y-1 text-xs">
                  <span>Fecha del CEP (AAAA-MM-DD)</span>
                  <input className={inputClass} value={transferDate} onChange={(event) => setTransferDate(event.target.value)} placeholder="AAAA-MM-DD" />
                </label>
                <label className="space-y-1 text-xs">
                  <span>Banco de origen</span>
                  <input className={inputClass} value={originBank} onChange={(event) => setOriginBank(event.target.value)} />
                </label>
                <label className="space-y-1 text-xs">
                  <span>Cuenta beneficiaria comprobada</span>
                  <select className={inputClass} value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={pending}>
                    <option value="">Selecciona la cuenta del CEP</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.banco} · {account.alias || account.titular} · {(account.clabe || account.cuenta || "").slice(-4)}
                      </option>
                    ))}
                  </select>
                  {selectedAccount && (
                    <span className="flex items-center justify-between gap-2 text-zinc-400">
                      <span>Banco receptor: {selectedAccount.banco}</span>
                      {selectedAccountNumber && (
                        <button type="button" onClick={() => void copy(selectedAccountNumber)} className="text-[#C5A55A]">
                          Copiar cuenta
                        </button>
                      )}
                    </span>
                  )}
                </label>
                <label className="space-y-1 text-xs">
                  <span>Monto acreditado según CEP</span>
                  <input className={inputClass} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </label>
              </div>
              <label className="flex items-start gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
                <span>Consulté el CEP en Banxico y comprobé la clave, el monto y la cuenta beneficiaria.</span>
              </label>
              <button
                type="button"
                onClick={confirm}
                disabled={pending || !attested}
                className="rounded-lg bg-[#C5A55A] px-4 py-2.5 text-xs font-bold text-black disabled:opacity-50"
              >
                {pending ? "Guardando..." : "Registrar confirmación manual del CEP"}
              </button>
            </div>
          )}
          {confirmedAt && receipt.serviceType === "grupal" && !groupApplied && (
            <button
              type="button"
              onClick={applyGroupPayment}
              disabled={pending}
              className="rounded-lg bg-[#C5A55A] px-4 py-2.5 text-xs font-bold text-black disabled:opacity-50"
            >
              Aplicar pago confirmado al servicio grupal
            </button>
          )}
        </div>
      )}
    </div>
  );
}
