import { fromCents, toCents } from '../common/money';
import { LiquidationRecord } from './entities/liquidation-record.entity';

/**
 * Politica de comision sobre extras con tarjeta.
 *
 * Estos dos numeros estaban incrustados aqui. Ahora llegan desde
 * `liquidation_settings` para que administracion los cambie desde la pantalla
 * del corte, y los valores por defecto son los que tenia el codigo, de modo que
 * un calculo sin configuracion da exactamente el resultado de antes.
 */
export interface CardExtraCommissionPolicy {
  /** Porcentaje que retiene la empresa. 15 significa que la empleada cobra el 85%. */
  percentage: number;
  /** Importe minimo del extra para que la comision aplique. */
  threshold: number;
}

export const DEFAULT_CARD_EXTRA_COMMISSION: CardExtraCommissionPolicy = {
  percentage: 15,
  threshold: 1000,
};

export interface CutResult {
  salesTotal: number;
  finesTotal: number;
  cashTotal: number;
  companyCommission: number;
  transportTotal: number;
  cardTotal: number;
  calculatedExtras: number;
  membershipTotal: number;
  promotionTotal: number;
  nearbyTripsCount: number;
  nearbyTripsCost: number;
  customerTransportCharges: number;
  employeeUberReimbursements: number;
  employeeCashDue: number;
  employeeGrossPay: number;
  result: number;
  direction: 'employee_owes_company' | 'company_owes_employee' | 'settled';
  count: number;
  totalCollected: number;
  rawExtrasTotal: number;
  netCompanyShare: number;
  netTransportBalance: number;
  transferTotal: number;
  companyTransportExpenses: number;
  /** Extras cobrados con tarjeta, antes de aplicarles la comision. */
  cardExtrasTotal: number;
  /** Lo que la comision de tarjeta le resto a la empleada en el periodo. */
  cardExtraCommission: number;
}

/*
 * Todos los acumuladores de `calculateCut` trabajan en centavos enteros. Antes
 * eran flotantes que solo se redondeaban al devolver el resultado, asi que el
 * error de cada suma se arrastraba a lo largo de todos los registros de la
 * semana. `toCents` entra, `fromCents` sale, y entre medias solo hay enteros.
 */

export function calculateCut(
  records: LiquidationRecord[],
  commission: CardExtraCommissionPolicy = DEFAULT_CARD_EXTRA_COMMISSION,
): CutResult {
  const thresholdCents = toCents(commission.threshold);
  // La comision se guarda como porcentaje; lo que se multiplica es lo que queda.
  const employeeShareOfCardExtras =
    1 - Math.min(100, Math.max(0, commission.percentage)) / 100;

  let salesTotal = 0;
  let finesTotal = 0;
  let cashTotal = 0;
  let companyCommission = 0;
  let transportTotal = 0;
  let cardTotal = 0;
  let calculatedExtras = 0;
  let rawExtrasTotal = 0;
  let membershipTotal = 0;
  let promotionTotal = 0;
  let nearbyTripsCount = 0;
  let nearbyTripsCost = 0;
  let customerTransportCharges = 0;
  let employeeUberReimbursements = 0;
  let employeeCashDue = 0;
  let employeeShareTotal = 0;
  let transferTotal = 0;
  let cardExtrasTotal = 0;
  let cardExtraCommission = 0;

  for (const record of records) {
    if (record.isFine) {
      finesTotal += toCents(record.fineAmount);
      continue;
    }

    let transport = toCents(record.companyTransportExpense);
    const place = record.place?.trim().toLowerCase();
    const isNearby = ['montecarlo', 'magestic', 'majestic'].includes(
      place ?? '',
    );
    if (!record.cancelled && isNearby) {
      const calculatedTransport = toCents(
        (record.hasOutboundDriver ? 60 : 0) + (record.hasReturnDriver ? 60 : 0),
      );
      if (calculatedTransport > 0) {
        nearbyTripsCount += 1;
        nearbyTripsCost += calculatedTransport;
        if (transport === 0) transport = calculatedTransport;
      }
    }
    transportTotal += transport + toCents(record.transportExcess);
    customerTransportCharges += toCents(record.customerTransportCharge);
    employeeUberReimbursements += toCents(record.employeeUberReimbursement);
    employeeCashDue += toCents(record.employeeCashDue);

    if (record.cancelled) continue;

    const serviceTotal = toCents(record.serviceTotal);
    const cards = (record.cardAmounts ?? []).reduce(
      (sum, amount) => sum + toCents(amount),
      0,
    );
    const promotion = record.promotion ? toCents(300) : 0;

    salesTotal += serviceTotal + promotion;
    cardTotal += cards;
    promotionTotal += promotion;
    membershipTotal += toCents(record.membershipAmount);

    /*
     * Los extras son integros de la empleada.
     *
     * Antes se le retenia un 15 % a partir de 1000: la casa se quedaba una
     * parte de algo que es suyo por completo, y como la hoja solo mostraba el
     * resultado ya recortado, la retencion no aparecia por ningun lado. Ni la
     * empleada ni la oficina podian ver por que el numero no cuadraba con lo
     * que se habia cobrado.
     *
     * `rawExtrasTotal` y `calculatedExtras` se conservan los dos porque el
     * corte los usa para cosas distintas —lo cobrado al cliente y lo que se le
     * paga a ella— aunque ahora valgan lo mismo.
     */
    const extra = toCents(record.electronicExtraAmount ?? record.extraAmount);
    rawExtrasTotal += extra;

    /*
     * Solo la tarjeta paga comision, y solo a partir del umbral.
     *
     * La condicion anterior era "no es efectivo", que retenia igual sobre la
     * transferencia pese a no costarle nada a la empresa: eso era quedarse con
     * parte de algo que es integro de la empleada. Ahora la retencion se limita
     * a lo que si tiene un costo real, y tanto el porcentaje como el umbral
     * salen de `liquidation_settings`, de modo que la regla se ve y se cambia
     * desde la pantalla del corte en vez de estar escondida en el codigo.
     *
     * `cardExtrasTotal` y `cardExtraCommission` se devuelven aparte para que la
     * retencion sea visible en la hoja: el problema de la version anterior no
     * era solo cuanto se retenia, sino que el corte solo mostraba el resultado
     * ya recortado y nadie podia cuadrar el numero con lo cobrado.
     *
     * `cardExtra` se acota a `extra` porque los dos importes se guardan por
     * separado en el registro: si alguno llegara descuadrado, la parte con
     * comision nunca puede exceder el total de extras de ese servicio.
     */
    const cardExtra = Math.min(extra, toCents(record.cardExtraAmount));
    const uncommissionedExtra = extra - cardExtra;
    cardExtrasTotal += cardExtra;

    if (cardExtra >= thresholdCents && cardExtra > 0) {
      const employeeKeeps = Math.round(cardExtra * employeeShareOfCardExtras);
      cardExtraCommission += cardExtra - employeeKeeps;
      calculatedExtras += employeeKeeps + uncommissionedExtra;
    } else {
      calculatedExtras += extra;
    }

    if (record.paymentMethod === 'efectivo') cashTotal += serviceTotal;
    if (record.paymentMethod === 'transferencia') transferTotal += serviceTotal;
    if (record.paymentMethod === 'mixto') {
      cashTotal += toCents(record.cashAmount);
    }

    const companyPercentage = Number(record.companyPercentage) || 40;
    companyCommission += Math.round(
      (serviceTotal + promotion) * (companyPercentage / 100),
    );
    employeeShareTotal += Math.round(
      serviceTotal * (1 - companyPercentage / 100),
    );
  }

  const resultCents =
    -(employeeShareTotal + calculatedExtras + employeeUberReimbursements) +
    finesTotal;
  const result = fromCents(resultCents);

  const companyTransportExpenses = Math.max(
    0,
    transportTotal - employeeUberReimbursements,
  );
  const totalCollected =
    salesTotal + customerTransportCharges + membershipTotal + rawExtrasTotal;
  const netTransportBalance = customerTransportCharges - transportTotal;
  const netCompanyShare = companyCommission + netTransportBalance;

  return {
    salesTotal: fromCents(salesTotal),
    finesTotal: fromCents(finesTotal),
    cashTotal: fromCents(cashTotal),
    companyCommission: fromCents(companyCommission),
    transportTotal: fromCents(transportTotal),
    cardTotal: fromCents(cardTotal),
    calculatedExtras: fromCents(calculatedExtras),
    membershipTotal: fromCents(membershipTotal),
    promotionTotal: fromCents(promotionTotal),
    nearbyTripsCount,
    nearbyTripsCost: fromCents(nearbyTripsCost),
    customerTransportCharges: fromCents(customerTransportCharges),
    employeeUberReimbursements: fromCents(employeeUberReimbursements),
    employeeCashDue: fromCents(employeeCashDue),
    employeeGrossPay: fromCents(Math.max(0, -resultCents)),
    result,
    direction:
      result > 0
        ? 'employee_owes_company'
        : result < 0
          ? 'company_owes_employee'
          : 'settled',
    count: records.length,
    totalCollected: fromCents(totalCollected),
    rawExtrasTotal: fromCents(rawExtrasTotal),
    netCompanyShare: fromCents(netCompanyShare),
    netTransportBalance: fromCents(netTransportBalance),
    transferTotal: fromCents(transferTotal),
    companyTransportExpenses: fromCents(companyTransportExpenses),
    cardExtrasTotal: fromCents(cardExtrasTotal),
    cardExtraCommission: fromCents(cardExtraCommission),
  };
}

export function buildCutReport(
  records: LiquidationRecord[],
  commission: CardExtraCommissionPolicy = DEFAULT_CARD_EXTRA_COMMISSION,
) {
  const officeRecords = records.filter((record) =>
    ['admin', 'jefe'].includes(record.sourceRole),
  );
  const employeeRecords = records.filter(
    (record) => record.sourceRole === 'empleada',
  );
  const officeCut = calculateCut(officeRecords, commission);
  const employeeCut = calculateCut(employeeRecords, commission);

  return {
    officeCut,
    employeeCut,
    finalCut: officeCut,
    officeRecords,
    employeeRecords,
    discrepancy: { exists: false, difference: 0 },
  };
}
