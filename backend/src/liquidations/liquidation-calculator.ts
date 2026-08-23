import { fromCents, toCents } from '../common/money';
import { LiquidationRecord } from './entities/liquidation-record.entity';

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
}

/*
 * Todos los acumuladores de `calculateCut` trabajan en centavos enteros. Antes
 * eran flotantes que solo se redondeaban al devolver el resultado, asi que el
 * error de cada suma se arrastraba a lo largo de todos los registros de la
 * semana. `toCents` entra, `fromCents` sale, y entre medias solo hay enteros.
 */

export function calculateCut(records: LiquidationRecord[]): CutResult {
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

    const extra = toCents(record.electronicExtraAmount ?? record.extraAmount);
    rawExtrasTotal += extra;
    // El umbral son 1000 unidades, que en centavos son 100_000.
    calculatedExtras += extra >= 100_000 ? Math.round(extra * 0.85) : extra;

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
  };
}

export function buildCutReport(records: LiquidationRecord[]) {
  const officeRecords = records.filter((record) =>
    ['admin', 'jefe'].includes(record.sourceRole),
  );
  const employeeRecords = records.filter(
    (record) => record.sourceRole === 'empleada',
  );
  const officeCut = calculateCut(officeRecords);
  const employeeCut = calculateCut(employeeRecords);

  return {
    officeCut,
    employeeCut,
    finalCut: officeCut,
    officeRecords,
    employeeRecords,
    discrepancy: { exists: false, difference: 0 },
  };
}
