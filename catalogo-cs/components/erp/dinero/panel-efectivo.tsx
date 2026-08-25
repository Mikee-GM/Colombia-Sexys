"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Empty,
  ErpTable,
  Panel,
  StatusBadge,
  Td,
  Th,
  codigoServicio,
  type BadgeTone,
} from "@/components/erp/primitives";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/calculations";
import {
  cerrarObligacion,
  deshacerEfectivo,
  registrarEfectivo,
} from "@/app/admin/dinero/actions";
import type {
  CashObligation,
  CashPayment,
} from "@/components/erp/dinero/types";

/**
 * Efectivo que la empleada cobro al cliente y todavia no ha entregado.
 *
 * Las dos mitades van juntas a proposito: arriba lo que debe entregar, abajo lo
 * que ya entrego. Separadas —que es como estaban, en pantallas distintas— no
 * habia forma de ver por que un saldo bajo, ni de encontrar el abono que habia
 * que corregir cuando bajaba de menos.
 */

const CALCULO_TONE: Record<string, BadgeTone> = {
  ready: "green",
  provisional: "amber",
  paid: "zinc",
};

const CALCULO_LABEL: Record<string, string> = {
  ready: "Calculada",
  provisional: "Provisional",
  paid: "Entregada",
};

export default function PanelEfectivo({
  employeeId,
  obligaciones,
  abonos,
  esAdmin,
}: {
  employeeId: string;
  obligaciones: CashObligation[];
  abonos: CashPayment[];
  esAdmin: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const pendienteTotal = useMemo(
    () =>
      obligaciones.reduce(
        (suma, fila) => suma + Math.max(0, fila.amount - fila.paidAmount),
        0,
      ),
    [obligaciones],
  );

  function registrar() {
    const cantidad = Number(monto);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast.error("Escribe un monto válido");
      return;
    }
    iniciar(async () => {
      try {
        await registrarEfectivo(employeeId, cantidad, nota.trim() || undefined);
        setMonto("");
        setNota("");
        toast.success(`Registrados ${formatCurrency(cantidad)} en efectivo`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo registrar",
        );
      }
    });
  }

  function deshacer(paymentId: string) {
    iniciar(async () => {
      try {
        await deshacerEfectivo(paymentId, employeeId);
        setConfirmando(null);
        toast.success("Abono deshecho: el efectivo vuelve a estar pendiente");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo deshacer",
        );
      }
    });
  }

  function cerrar(id: string) {
    iniciar(async () => {
      try {
        await cerrarObligacion(id, employeeId);
        toast.success("Entrega cerrada");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo cerrar",
        );
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel
        title="Efectivo por entregar"
        subtitle={`${formatCurrency(pendienteTotal)} pendientes`}
        flush
      >
        <div className="border-b border-zinc-800 p-5">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                Monto entregado
              </span>
              <input
                value={monto}
                onChange={(evento) => setMonto(evento.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="w-32 rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-[13px] tabular-nums text-zinc-100 outline-none focus:border-[#C5A55A]/50"
              />
            </label>

            <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                Nota
              </span>
              <input
                value={nota}
                onChange={(evento) => setNota(evento.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-zinc-800 bg-black/60 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A]/50"
              />
            </label>

            <button
              type="button"
              onClick={registrar}
              disabled={pendiente}
              className="rounded-xl border border-[#C5A55A]/50 px-4 py-2 text-[12px] font-semibold text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-40"
            >
              Registrar
            </button>
          </div>
        </div>

        <ErpTable>
          <thead>
            <tr>
              <Th>Servicio</Th>
              <Th numeric>Debe</Th>
              <Th>Estado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {obligaciones.map((fila) => {
              const restante = Math.max(0, fila.amount - fila.paidAmount);
              return (
                <tr key={fila.id}>
                  <Td>
                    <span className="text-zinc-300">
                      {codigoServicio(fila.serviceId)}
                    </span>
                    <div className="text-[11px] text-zinc-500">
                      {formatDate(fila.serviceDate)}
                    </div>
                  </Td>
                  <Td numeric>
                    {restante ? formatCurrency(restante) : <Empty />}
                  </Td>
                  <Td>
                    <StatusBadge
                      tone={CALCULO_TONE[fila.calculationStatus] ?? "zinc"}
                    >
                      {CALCULO_LABEL[fila.calculationStatus] ??
                        fila.calculationStatus}
                    </StatusBadge>
                    {fila.pendingReason ? (
                      <p className="mt-1 text-[11px] text-zinc-600">
                        {fila.pendingReason}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    {restante > 0 && fila.calculationStatus === "ready" ? (
                      <button
                        type="button"
                        onClick={() => cerrar(fila.id)}
                        disabled={pendiente}
                        className="text-[12px] text-zinc-400 underline decoration-[#C5A55A]/40 underline-offset-4 hover:text-[#C5A55A] disabled:opacity-40"
                      >
                        Dar por entregada
                      </button>
                    ) : null}
                  </Td>
                </tr>
              );
            })}

            {!obligaciones.length ? (
              <tr>
                <Td colSpan={4} className="py-8 text-center text-zinc-500">
                  No tiene efectivo pendiente.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </ErpTable>
      </Panel>

      <Panel
        title="Entregas registradas"
        subtitle="Cada una se puede deshacer; queda marcada, no desaparece"
        flush
      >
        <ErpTable>
          <thead>
            <tr>
              <Th>Cuándo</Th>
              <Th numeric>Monto</Th>
              <Th>Origen</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {abonos.map((abono) => {
              const revertido = Boolean(abono.revertedAt);
              return (
                <tr key={abono.id} className={revertido ? "opacity-50" : ""}>
                  <Td>
                    {formatDateTime(abono.createdAt)}
                    {abono.note ? (
                      <p className="text-[11px] text-zinc-500">{abono.note}</p>
                    ) : null}
                  </Td>
                  <Td numeric className={revertido ? "line-through" : ""}>
                    {formatCurrency(abono.amount)}
                  </Td>
                  <Td>
                    <StatusBadge
                      tone={abono.origin === "weekly_offset" ? "blue" : "zinc"}
                    >
                      {abono.origin === "weekly_offset"
                        ? "Del corte"
                        : "En mano"}
                    </StatusBadge>
                  </Td>
                  <Td>
                    {revertido ? (
                      <span className="text-[11px] text-zinc-500">
                        Deshecho
                        {abono.revertedAt
                          ? ` el ${formatDate(abono.revertedAt)}`
                          : ""}
                      </span>
                    ) : abono.origin === "weekly_offset" ? (
                      /*
                       * Este abono lo creo la confirmacion del corte. Deshacerlo
                       * por su cuenta dejaria la liquidacion diciendo que se pago
                       * algo que ya no esta pagado, asi que se manda arriba.
                       */
                      <span className="text-[11px] text-zinc-600">
                        Se deshace con la liquidación
                      </span>
                    ) : confirmando === abono.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => deshacer(abono.id)}
                          disabled={pendiente}
                          className="text-[12px] font-semibold text-red-400 disabled:opacity-40"
                        >
                          Confirmar
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
                        onClick={() => setConfirmando(abono.id)}
                        disabled={!esAdmin}
                        className="text-[12px] text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Deshacer
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}

            {!abonos.length ? (
              <tr>
                <Td colSpan={4} className="py-8 text-center text-zinc-500">
                  Todavía no ha entregado efectivo.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </ErpTable>
      </Panel>
    </div>
  );
}
