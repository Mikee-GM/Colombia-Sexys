"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Panel, StatusBadge } from "@/components/erp/primitives";
import { formatCurrency, formatDate } from "@/lib/calculations";
import {
  abonarDeuda,
  crearDeuda,
  deshacerAbono,
  deshacerDeuda,
} from "@/app/admin/dinero/actions";
import type { LiquidationDebt } from "@/components/liquidations/types";

/**
 * Deudas de la empleada: prestamos y cargos que se le registraron.
 *
 * Cada deuda se despliega con sus abonos porque la pregunta que se hace el
 * administrador no es "cuanto debe" sino "por que debe eso": un saldo sin sus
 * movimientos no se puede discutir con ella, y discutirlo es justo lo que pasa
 * cuando el numero no le cuadra.
 */
export default function PanelDeudas({
  employeeId,
  deudas,
  esAdmin,
}: {
  employeeId: string;
  deudas: LiquidationDebt[];
  esAdmin: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [abonos, setAbonos] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const total = useMemo(
    () => deudas.reduce((suma, deuda) => suma + deuda.remainingAmount, 0),
    [deudas],
  );

  function registrar() {
    const cantidad = Number(monto);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast.error("Escribe un monto válido");
      return;
    }
    if (!descripcion.trim()) {
      toast.error("Describe de qué es la deuda");
      return;
    }
    iniciar(async () => {
      try {
        await crearDeuda(employeeId, cantidad, descripcion.trim());
        setMonto("");
        setDescripcion("");
        toast.success("Deuda registrada");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo registrar",
        );
      }
    });
  }

  function abonar(debtId: string) {
    const cantidad = Number(abonos[debtId]);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast.error("Escribe un monto válido");
      return;
    }
    iniciar(async () => {
      try {
        await abonarDeuda(employeeId, debtId, cantidad);
        setAbonos((previo) => ({ ...previo, [debtId]: "" }));
        toast.success(`Abonados ${formatCurrency(cantidad)}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo abonar",
        );
      }
    });
  }

  function quitarDeuda(debtId: string) {
    iniciar(async () => {
      try {
        await deshacerDeuda(employeeId, debtId);
        setConfirmando(null);
        toast.success("Deuda deshecha");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo deshacer",
        );
      }
    });
  }

  function quitarAbono(debtId: string, paymentId: string) {
    iniciar(async () => {
      try {
        await deshacerAbono(employeeId, debtId, paymentId);
        toast.success("Abono deshecho");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo deshacer",
        );
      }
    });
  }

  return (
    <Panel
      title="Deudas"
      subtitle={
        total > 0 ? `${formatCurrency(total)} pendientes` : "Sin deuda viva"
      }
    >
      <div className="flex flex-wrap items-end gap-2 border-b border-zinc-800 pb-5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
            Monto
          </span>
          <input
            value={monto}
            onChange={(evento) => setMonto(evento.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-32 rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-[13px] tabular-nums text-zinc-100 outline-none focus:border-[#C5A55A]/50"
          />
        </label>

        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
            Concepto
          </span>
          <input
            value={descripcion}
            onChange={(evento) => setDescripcion(evento.target.value)}
            placeholder="Préstamo, adelanto, cargo"
            className="w-full rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]/50"
          />
        </label>

        <button
          type="button"
          onClick={registrar}
          disabled={pendiente}
          className="rounded-xl border border-[#C5A55A]/50 px-4 py-2 text-[12px] font-semibold text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-40"
        >
          Registrar deuda
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {deudas.map((deuda) => {
          const desplegada = abierta === deuda.id;
          const saldada = deuda.remainingAmount <= 0;
          return (
            <div
              key={deuda.id}
              className="rounded-xl border border-zinc-800 bg-black/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-[13px] text-zinc-200">
                    {deuda.description}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Abierta el {formatDate(deuda.createdAt)} ·{" "}
                    {formatCurrency(deuda.paidAmount)} abonados de{" "}
                    {formatCurrency(deuda.amount)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge tone={saldada ? "green" : "amber"}>
                    {saldada
                      ? "Saldada"
                      : `Debe ${formatCurrency(deuda.remainingAmount)}`}
                  </StatusBadge>

                  <button
                    type="button"
                    onClick={() => setAbierta(desplegada ? null : deuda.id)}
                    className="text-[12px] text-zinc-400 underline decoration-[#C5A55A]/40 underline-offset-4 hover:text-[#C5A55A]"
                  >
                    {desplegada ? "Cerrar" : "Ver movimientos"}
                  </button>
                </div>
              </div>

              {desplegada ? (
                <div className="border-t border-zinc-800 p-4">
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      value={abonos[deuda.id] ?? ""}
                      onChange={(evento) =>
                        setAbonos((previo) => ({
                          ...previo,
                          [deuda.id]: evento.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="Monto a abonar"
                      className="w-40 rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-[13px] tabular-nums text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]/50"
                    />
                    <button
                      type="button"
                      onClick={() => abonar(deuda.id)}
                      disabled={pendiente || saldada}
                      className="rounded-xl border border-zinc-700 px-3 py-2 text-[12px] text-zinc-200 transition-colors hover:border-[#C5A55A]/50 hover:text-[#C5A55A] disabled:opacity-40"
                    >
                      Abonar
                    </button>

                    {confirmando === deuda.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => quitarDeuda(deuda.id)}
                          disabled={pendiente}
                          className="text-[12px] font-semibold text-red-400 disabled:opacity-40"
                        >
                          Confirmar borrado
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmando(null)}
                          className="text-[12px] text-zinc-500 hover:text-zinc-300"
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmando(deuda.id)}
                        disabled={!esAdmin}
                        className="text-[12px] text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Deshacer la deuda entera
                      </button>
                    )}
                  </div>

                  <ul className="mt-4 flex flex-col gap-2">
                    {deuda.payments.map((pago) => (
                      <li
                        key={pago.id}
                        className="flex items-center justify-between gap-3 text-[12px]"
                      >
                        <span className="text-zinc-400">
                          {formatDate(pago.createdAt)}
                          {pago.note ? ` · ${pago.note}` : ""}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="tabular-nums text-zinc-200">
                            {formatCurrency(pago.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => quitarAbono(deuda.id, pago.id)}
                            disabled={pendiente || !esAdmin}
                            className="text-zinc-500 underline decoration-zinc-700 underline-offset-4 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Deshacer
                          </button>
                        </span>
                      </li>
                    ))}

                    {!deuda.payments.length ? (
                      <li className="text-[12px] text-zinc-600">
                        Sin abonos todavía.
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}

        {!deudas.length ? (
          <p className="py-6 text-center text-[13px] text-zinc-500">
            No tiene deudas registradas.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
