export type SettlementDirection =
  | "employee_owes_company"
  | "company_owes_employee"
  | "settled";

export interface LiquidationRecord {
  id: string;
  serviceId: string | null;
  employeeId: string;
  sourceRole: "admin" | "jefe" | "empleada";
  occurredAt: string;
  serviceTotal: number;
  paymentMethod: "efectivo" | "tarjeta" | "transferencia" | "mixto" | "membresia";
  cashAmount: number;
  cardAmounts: number[];
  companyPercentage: number;
  extraAmount: number;
  promotion: boolean;
  membershipAmount: number;
  companyTransportExpense: number;
  customerTransportCharge: number;
  employeeUberReimbursement: number;
  employeeCashDue: number;
  electronicExtraAmount: number;
  transportExcess: number;
  place: string | null;
  cancelled: boolean;
  isFine: boolean;
  fineAmount: number;
}

export type LiquidationRecordInput = Omit<
  LiquidationRecord,
  "id" | "serviceId" | "sourceRole"
>;

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
  direction: SettlementDirection;
  count: number;
}

export interface LiquidationReport {
  employee: { id: string; name: string };
  period: { startDate: string; endDate: string };
  officeCut: CutResult;
  employeeCut: CutResult;
  finalCut: CutResult;
  officeRecords: LiquidationRecord[];
  employeeRecords: LiquidationRecord[];
  discrepancy: { exists: boolean; difference: number };
  weeklySettlement: {
    status: "preview" | "confirmed";
    grossEmployeePay: number;
    cashOutstanding: number;
    cashOffset: number;
    netEmployeePay: number;
    remainingCashDebt: number;
    confirmedAt: string | null;
  };
}

export interface LiquidationEmployee {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  bosses: Array<{ id: string; name: string }>;
}

export interface LiquidationPayment {
  id: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface LiquidationDebt {
  id: string;
  employeeId: string;
  amount: number;
  description: string;
  status: "pending" | "paid";
  createdAt: string;
  payments: LiquidationPayment[];
  paidAmount: number;
  remainingAmount: number;
}

export interface CreateDebtInput {
  amount: number;
  description: string;
}

export interface CreatePaymentInput {
  amount: number;
  note?: string;
}
