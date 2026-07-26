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

const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

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
      finesTotal += Number(record.fineAmount) || 0;
      continue;
    }

    let transport = Number(record.companyTransportExpense) || 0;
    const place = record.place?.trim().toLowerCase();
    const isNearby = ['montecarlo', 'magestic', 'majestic'].includes(
      place ?? '',
    );
    if (!record.cancelled && isNearby) {
      const calculatedTransport =
        (record.hasOutboundDriver ? 60 : 0) + (record.hasReturnDriver ? 60 : 0);
      if (calculatedTransport > 0) {
        nearbyTripsCount += 1;
        nearbyTripsCost += calculatedTransport;
        if (transport === 0) transport = calculatedTransport;
      }
    }
    transportTotal += transport + (Number(record.transportExcess) || 0);
    customerTransportCharges += Number(record.customerTransportCharge) || 0;
    employeeUberReimbursements += Number(record.employeeUberReimbursement) || 0;
    employeeCashDue += Number(record.employeeCashDue) || 0;

    if (record.cancelled) continue;

    const serviceTotal = Number(record.serviceTotal) || 0;
    const cards = (record.cardAmounts ?? []).reduce(
      (sum, amount) => sum + (Number(amount) || 0),
      0,
    );
    const promotion = record.promotion ? 300 : 0;

    salesTotal += serviceTotal + promotion;
    cardTotal += cards;
    promotionTotal += promotion;
    membershipTotal += Number(record.membershipAmount) || 0;

    const extra =
      Number(record.electronicExtraAmount ?? record.extraAmount) || 0;
    rawExtrasTotal += extra;
    calculatedExtras += extra >= 1000 ? extra * 0.85 : extra;

    if (record.paymentMethod === 'efectivo') cashTotal += serviceTotal;
    if (record.paymentMethod === 'transferencia') transferTotal += serviceTotal;
    if (record.paymentMethod === 'mixto') {
      cashTotal += Number(record.cashAmount) || 0;
    }

    companyCommission +=
      (serviceTotal + promotion) *
      ((Number(record.companyPercentage) || 40) / 100);
    employeeShareTotal +=
      serviceTotal * (1 - (Number(record.companyPercentage) || 40) / 100);
  }

  const result = money(
    -(employeeShareTotal + calculatedExtras + employeeUberReimbursements) +
      finesTotal,
  );

  const companyTransportExpenses = Math.max(
    0,
    transportTotal - employeeUberReimbursements,
  );
  const totalCollected =
    salesTotal + customerTransportCharges + membershipTotal + rawExtrasTotal;
  const netTransportBalance = customerTransportCharges - transportTotal;
  const netCompanyShare = companyCommission + netTransportBalance;

  return {
    salesTotal: money(salesTotal),
    finesTotal: money(finesTotal),
    cashTotal: money(cashTotal),
    companyCommission: money(companyCommission),
    transportTotal: money(transportTotal),
    cardTotal: money(cardTotal),
    calculatedExtras: money(calculatedExtras),
    membershipTotal: money(membershipTotal),
    promotionTotal: money(promotionTotal),
    nearbyTripsCount,
    nearbyTripsCost: money(nearbyTripsCost),
    customerTransportCharges: money(customerTransportCharges),
    employeeUberReimbursements: money(employeeUberReimbursements),
    employeeCashDue: money(employeeCashDue),
    employeeGrossPay: money(Math.max(0, -result)),
    result,
    direction:
      result > 0
        ? 'employee_owes_company'
        : result < 0
          ? 'company_owes_employee'
          : 'settled',
    count: records.length,
    totalCollected: money(totalCollected),
    rawExtrasTotal: money(rawExtrasTotal),
    netCompanyShare: money(netCompanyShare),
    netTransportBalance: money(netTransportBalance),
    transferTotal: money(transferTotal),
    companyTransportExpenses: money(companyTransportExpenses),
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
