import { fromCents, toCents } from '../common/money';

export const EMPLOYEE_SERVICE_PERCENTAGE = 60;
export const CARD_EXTRA_COMPANY_PERCENTAGE = 15;
export const CARD_EXTRA_COMMISSION_THRESHOLD = 1000;

export type CardExtraSnapshot = {
  amount: number;
  companyPercentage: number;
  commissionThreshold: number | null;
  companyCommission: number;
  employeeNet: number;
  snapshotStatus: 'captured' | 'legacy_unverified';
};

export type ServiceFinancialInput = {
  serviceBaseAmount: number;
  employeeServicePercentage: number;
  extensions: Array<{
    amount: number;
    employeeExpected: number;
  }>;
  cardExtras: CardExtraSnapshot[];
  customerTransportCharge: number;
  /** Cancelados/anulados se muestran, pero no generan ganancia esperada. */
  eligibleForEarnings?: boolean;
};

export type ServiceFinancialResult = {
  serviceBaseAmount: number;
  extensionsAmount: number;
  serviceCommissionableBase: number;
  employeeServiceExpected: number;
  cardExtrasTotal: number;
  cardExtraCompanyCommission: number;
  cardExtrasEmployeeNet: number;
  customerTransportCharge: number;
  employeeExpectedTotal: number;
};

/**
 * Snapshot financiero de un extra nuevo.
 *
 * La regla se aplica a cada fila, nunca al acumulado del servicio. Trabajar en
 * centavos evita que una suma semanal arrastre errores de punto flotante.
 */
export function calculateCardExtraSnapshot(amount: number): CardExtraSnapshot {
  const amountCents = toCents(amount);
  const thresholdCents = toCents(CARD_EXTRA_COMMISSION_THRESHOLD);
  const companyCommission =
    amountCents >= thresholdCents
      ? Math.round(amountCents * (CARD_EXTRA_COMPANY_PERCENTAGE / 100))
      : 0;

  return {
    amount: fromCents(amountCents),
    companyPercentage:
      companyCommission > 0 ? CARD_EXTRA_COMPANY_PERCENTAGE : 0,
    commissionThreshold: CARD_EXTRA_COMMISSION_THRESHOLD,
    companyCommission: fromCents(companyCommission),
    employeeNet: fromCents(amountCents - companyCommission),
    snapshotStatus: 'captured',
  };
}

/** Fuente unica de los importes que muestran historial, cards y resumen. */
export function calculateServiceFinancials(
  input: ServiceFinancialInput,
): ServiceFinancialResult {
  const serviceBase = toCents(input.serviceBaseAmount);
  const extensions = input.extensions.reduce(
    (sum, extension) => sum + toCents(extension.amount),
    0,
  );
  const commissionableBase = serviceBase + extensions;
  const percentage = Math.min(
    100,
    Math.max(0, Number(input.employeeServicePercentage)),
  );
  const eligible = input.eligibleForEarnings !== false;
  const employeeServiceExpected = eligible
    ? Math.round(serviceBase * (percentage / 100)) +
      input.extensions.reduce(
        (sum, extension) => sum + toCents(extension.employeeExpected),
        0,
      )
    : 0;
  const cardExtrasTotal = input.cardExtras.reduce(
    (sum, extra) => sum + toCents(extra.amount),
    0,
  );
  const companyCommission = eligible
    ? input.cardExtras.reduce(
        (sum, extra) => sum + toCents(extra.companyCommission),
        0,
      )
    : 0;
  const employeeNet = eligible
    ? input.cardExtras.reduce(
        (sum, extra) => sum + toCents(extra.employeeNet),
        0,
      )
    : 0;

  return {
    serviceBaseAmount: fromCents(serviceBase),
    extensionsAmount: fromCents(extensions),
    serviceCommissionableBase: fromCents(commissionableBase),
    employeeServiceExpected: fromCents(employeeServiceExpected),
    cardExtrasTotal: fromCents(cardExtrasTotal),
    cardExtraCompanyCommission: fromCents(companyCommission),
    cardExtrasEmployeeNet: fromCents(employeeNet),
    customerTransportCharge: fromCents(toCents(input.customerTransportCharge)),
    employeeExpectedTotal: fromCents(employeeServiceExpected + employeeNet),
  };
}
