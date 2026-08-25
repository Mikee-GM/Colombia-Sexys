"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api-server";
import type {
  EmployeeMoneyDetail,
  MoneyOverviewRow,
} from "@/components/erp/dinero/types";

/**
 * Acciones del panel de dinero.
 *
 * Cada operacion que mueve un saldo tiene aqui su pareja para deshacerla. Es
 * deliberado: estos registros los captura el administrador a mano mientras
 * atiende otras cosas, asi que equivocarse de persona o de monto es normal, y
 * hasta ahora un error de esos se quedaba grabado sin salida.
 *
 * Ninguna revalida solo su propia pantalla: el mismo saldo se ve en el listado,
 * en la ficha y en las vistas antiguas, y dejar una con el numero viejo es
 * exactamente el fallo que hacia dudar de si el cambio se habia guardado.
 */
const RUTAS_DE_DINERO = [
  "/admin/dinero",
  "/admin/liquidations",
  "/admin/transport",
];

function refrescarDinero(employeeId?: string) {
  for (const ruta of RUTAS_DE_DINERO) revalidatePath(ruta);
  if (employeeId) revalidatePath(`/admin/dinero/${employeeId}`);
}

const periodo = (startDate: string, endDate: string) =>
  new URLSearchParams({ startDate, endDate }).toString();

/* -------------------------------------------------------------------------- */
/* Lectura                                                                    */
/* -------------------------------------------------------------------------- */

export async function getMoneyOverview(startDate: string, endDate: string) {
  return await apiFetch<MoneyOverviewRow[]>(
    `/liquidations/money-overview?${periodo(startDate, endDate)}`,
  );
}

export async function getEmployeeMoney(
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  return await apiFetch<EmployeeMoneyDetail>(
    `/liquidations/employees/${employeeId}/money?${periodo(startDate, endDate)}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Efectivo que la empleada debe entregar                                     */
/* -------------------------------------------------------------------------- */

/** Registra el efectivo que la empleada acaba de entregar. */
export async function registrarEfectivo(
  employeeId: string,
  amount: number,
  note?: string,
) {
  const resultado = await apiFetch("/transport-operations/cash-payments", {
    method: "POST",
    body: JSON.stringify({ employeeId, amount, note }),
  });
  refrescarDinero(employeeId);
  return resultado;
}

/**
 * Deshace un abono de efectivo.
 *
 * Devuelve a cada obligacion lo que este abono le habia aplicado, usando las
 * asignaciones que quedaron guardadas al registrarlo. El abono no se borra: se
 * marca como revertido y sigue en el historial, porque un saldo que cambia sin
 * dejar rastro es un saldo que nadie puede explicar despues.
 */
export async function deshacerEfectivo(
  paymentId: string,
  employeeId: string,
  reason?: string,
) {
  const resultado = await apiFetch(
    `/transport-operations/cash-payments/${paymentId}/revert`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
  refrescarDinero(employeeId);
  return resultado;
}

export async function cerrarObligacion(id: string, employeeId: string) {
  const resultado = await apiFetch(
    `/transport-operations/cash-obligations/${id}/close`,
    { method: "POST" },
  );
  refrescarDinero(employeeId);
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Liquidacion semanal                                                        */
/* -------------------------------------------------------------------------- */

/** Marca a la empleada como pagada en esta semana. */
export async function marcarComoPagada(
  employeeId: string,
  startDate: string,
  endDate: string,
) {
  const resultado = await apiFetch("/liquidations/weekly-settlements/confirm", {
    method: "POST",
    body: JSON.stringify({ employeeId, startDate, endDate }),
  });
  refrescarDinero(employeeId);
  return resultado;
}

/**
 * Deshace la liquidacion de la semana.
 *
 * Confirmarla hace dos cosas —guarda el corte y compensa el efectivo pendiente
 * con un abono automatico—, asi que deshacerla revierte tambien ese abono. Si
 * no, el efectivo seguiria figurando como entregado y el saldo quedaria mal en
 * la direccion mas dificil de notar: a favor de la casa.
 */
export async function deshacerLiquidacion(
  employeeId: string,
  startDate: string,
  endDate: string,
  reason?: string,
) {
  const resultado = await apiFetch("/liquidations/weekly-settlements/undo", {
    method: "POST",
    body: JSON.stringify({ employeeId, startDate, endDate, reason }),
  });
  refrescarDinero(employeeId);
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Deudas                                                                     */
/* -------------------------------------------------------------------------- */

export async function crearDeuda(
  employeeId: string,
  amount: number,
  description: string,
) {
  const deuda = await apiFetch(
    `/liquidations/employees/${employeeId}/debts`,
    { method: "POST", body: JSON.stringify({ amount, description }) },
  );
  refrescarDinero(employeeId);
  return deuda;
}

/** Deshace el alta de una deuda. El backend la marca, no la borra. */
export async function deshacerDeuda(employeeId: string, debtId: string) {
  await apiFetch<void>(
    `/liquidations/employees/${employeeId}/debts/${debtId}`,
    { method: "DELETE" },
  );
  refrescarDinero(employeeId);
}

export async function abonarDeuda(
  employeeId: string,
  debtId: string,
  amount: number,
  note?: string,
) {
  const deuda = await apiFetch(
    `/liquidations/employees/${employeeId}/debts/${debtId}/payments`,
    { method: "POST", body: JSON.stringify({ amount, note }) },
  );
  refrescarDinero(employeeId);
  return deuda;
}

/** Deshace un abono a una deuda. */
export async function deshacerAbono(
  employeeId: string,
  debtId: string,
  paymentId: string,
) {
  await apiFetch<void>(
    `/liquidations/employees/${employeeId}/debts/${debtId}/payments/${paymentId}`,
    { method: "DELETE" },
  );
  refrescarDinero(employeeId);
}
