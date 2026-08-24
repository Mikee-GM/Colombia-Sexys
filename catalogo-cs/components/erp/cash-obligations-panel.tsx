"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Empty,
  ErpTable,
  Panel,
  PersonCell,
  RecordLink,
  StatusBadge,
  Td,
  TFootRow,
  Th,
  type BadgeTone,
} from "@/components/erp/primitives";
import {
  closeCashObligation,
  registerCashPayment,
  type CashSummary,
} from "@/app/admin/transport/actions";
import { formatCurrency } from "@/lib/calculations";

/**
 * Efectivo que las empleadas todavia no entregan.
 *
 * Vivia dentro de /admin/transport junto con la configuracion de zonas y los
 * cortes de choferes. Pertenece a la cartera: es dinero por cobrar, no
 * configuracion de transporte.
 */

const CALCULO_TONE: Record<string, BadgeTone> = {
  ready: "green",
  provisional: "amber",
  paid: "zinc",
};

const CALCULO_LABEL: Record<string, string> = {
  ready: "Calculada",
  provisional: "Provisional",
  paid: "Pagada",
};

export default function CashObligationsPanel({ cash }: { cash: CashSummary }) {
  const [pending, startTransition] = useTransition();
  const [montos, setMontos] = useState<Record<string, string>>({});

  const nombrePorEmpleada = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const empleada of cash.employees) mapa.set(empleada.id, empleada.name);
    return mapa;
  }, [cash.employees]);

  const pendientes = useMemo(
    () => cash.obligations.filter((item) => item.status === "pending"),
    [cash.obligations],
  );

  /* Una fila por empleada: el saldo es lo que resta de todas sus obligaciones. */
  const porEmpleada = useMemo(() => {
    const grupos = new Map<
      string,
      { employeeId: string; saldo: number; servicios: number; bloqueadas: number }
    >();

    for (const obligacion of pendientes) {
      const grupo = grupos.get(obligacion.employeeId) ?? {
        employeeId: obligacion.employeeId,
        saldo: 0,
        servicios: 0,
        bloqueadas: 0,
      };

      grupo.saldo +=
        Number(obligacion.amount) - Number(obligacion.paidAmount);
      grupo.servicios += 1;
      if (obligacion.calculationStatus === "provisional") grupo.bloqueadas += 1;

      grupos.set(obligacion.employeeId, grupo);
    }

    return [...grupos.values()].sort((a, b) => b.saldo - a.saldo);
  }, [pendientes]);

  const run = (accion: () => Promise<unknown>, mensaje: string) => {
    startTransition(async () => {
      try {
        await accion();
        toast.success(mensaje);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible completar la operacion",
        );
      }
    });
  };

  const abonar = (employeeId: string) => {
    const monto = Number(montos[employeeId]);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Escribe un monto valido");
      return;
    }

    run(() => registerCashPayment(employeeId, monto), "Abono registrado");
    setMontos((prev) => ({ ...prev, [employeeId]: "" }));
  };

  return (
    <Panel
      title="Efectivo por entregar"
      subtitle="empleadas_obligacion_efectivo - servicios sin conciliar"
      flush
      action={
        <StatusBadge tone={cash.total > 0 ? "amber" : "green"}>
          {cash.total > 0 ? formatCurrency(cash.total) : "Todo conciliado"}
        </StatusBadge>
      }
    >
      <ErpTable>
        <thead>
          <tr>
            <Th>Empleada</Th>
            <Th numeric>Servicios</Th>
            <Th numeric>Saldo</Th>
            <Th>Calculo</Th>
            <Th>Registrar abono</Th>
          </tr>
        </thead>

        <tbody>
          {porEmpleada.length === 0 ? (
            <tr>
              <Td colSpan={5} className="py-10 text-center text-zinc-500">
                No hay entregas de efectivo pendientes.
              </Td>
            </tr>
          ) : (
            porEmpleada.map((grupo) => (
              <tr key={grupo.employeeId}>
                <Td>
                  <PersonCell
                    name={
                      nombrePorEmpleada.get(grupo.employeeId) ?? "Empleada"
                    }
                    meta="Efectivo en calle"
                    href={`/admin/modelos/${grupo.employeeId}`}
                  />
                </Td>

                <Td numeric>{grupo.servicios}</Td>

                <Td numeric>
                  <span className="font-semibold text-white">
                    {formatCurrency(grupo.saldo)}
                  </span>
                </Td>

                <Td>
                  {grupo.bloqueadas > 0 ? (
                    <StatusBadge tone="amber">
                      {grupo.bloqueadas} provisional
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="green">Calculada</StatusBadge>
                  )}
                </Td>

                <Td>
                  <div className="flex items-center gap-2">
                    <input
                      value={montos[grupo.employeeId] ?? ""}
                      onChange={(event) =>
                        setMontos((prev) => ({
                          ...prev,
                          [grupo.employeeId]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="Monto"
                      className="w-[120px] rounded-xl border border-zinc-800 bg-black px-3 py-2 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-[#C5A55A]"
                    />

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => abonar(grupo.employeeId)}
                      className="rounded-xl border border-[#C5A55A] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:bg-[#C5A55A] hover:text-black disabled:opacity-50"
                    >
                      Abonar
                    </button>
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>

        {porEmpleada.length > 0 ? (
          <tfoot>
            <TFootRow>
              <Td>
                Total &middot; {porEmpleada.length}{" "}
                {porEmpleada.length === 1 ? "empleada" : "empleadas"}
              </Td>
              <Td numeric>{pendientes.length}</Td>
              <Td numeric>{formatCurrency(cash.total)}</Td>
              <Td />
              <Td />
            </TFootRow>
          </tfoot>
        ) : null}
      </ErpTable>

      {pendientes.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-zinc-800 p-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8B7635]">
            Servicios pendientes
          </span>

          <div className="flex flex-col">
            {pendientes.slice(0, 10).map((obligacion) => {
              const saldo =
                Number(obligacion.amount) - Number(obligacion.paidAmount);

              return (
                <div
                  key={obligacion.id}
                  className="flex items-center justify-between gap-3 border-b border-zinc-800/55 py-2.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <RecordLink
                      href={`/admin/services/${obligacion.serviceId}`}
                      className="w-fit text-[13px]"
                    >
                      SR-{obligacion.serviceId.slice(-6).toUpperCase()}
                    </RecordLink>

                    <span className="text-[11px] text-zinc-500">
                      {nombrePorEmpleada.get(obligacion.employeeId) ??
                        "Empleada"}
                      {obligacion.pendingReason
                        ? ` - ${obligacion.pendingReason}`
                        : ""}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[13px] tabular-nums text-zinc-300">
                      {saldo > 0 ? formatCurrency(saldo) : <Empty />}
                    </span>

                    <StatusBadge
                      tone={
                        CALCULO_TONE[obligacion.calculationStatus] ?? "zinc"
                      }
                    >
                      {CALCULO_LABEL[obligacion.calculationStatus] ??
                        obligacion.calculationStatus}
                    </StatusBadge>

                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => closeCashObligation(obligacion.id),
                          "Servicio saldado",
                        )
                      }
                      className="text-[11px] font-bold uppercase tracking-wider text-[#C5A55A] transition-colors hover:text-[#E8D5A3] disabled:opacity-50"
                    >
                      Saldar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
