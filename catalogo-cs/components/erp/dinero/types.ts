import type {
  CutResult,
  LiquidationDebt,
  SettlementDirection,
} from "@/components/liquidations/types";

/**
 * Formas que devuelve el panel de dinero del backend.
 *
 * Viven aparte de `components/liquidations/types` porque aquellas describen el
 * corte semanal y estas describen la ficha completa de una persona: el mismo
 * dominio visto desde otra pregunta.
 */

/** Una fila del listado de personal. */
export interface MoneyOverviewRow {
  employeeId: string;
  employeeName: string;
  realName: string | null;
  active: boolean;
  servicesCount: number;
  salesTotal: number;
  totalCollected: number;
  companyCommission: number;
  finesTotal: number;
  employeeGrossPay: number;
  cashOffset: number;
  netEmployeePay: number;
  cashOutstanding: number;
  debtOutstanding: number;
  /** Lo que se le paga menos lo que debe. El efectivo ya va dentro del neto. */
  balance: number;
  settlementStatus: "preview" | "confirmed";
  confirmedAt: string | null;
  /** `null` cuando el periodo anterior fue cero: no hay porcentaje que valga. */
  salesDeltaPct: number | null;
}

export interface MoneyPerformance {
  servicesCount: number;
  cancelledCount: number;
  finesCount: number;
  cancelRate: number;
  averageTicket: number;
  daysWorked: number;
  servicesPerActiveDay: number;
}

export interface MoneyTrendPoint {
  weekStart: string;
  salesTotal: number;
  employeeGrossPay: number;
  servicesCount: number;
}

export interface CashObligation {
  id: string;
  serviceId: string;
  employeeId: string;
  amount: number;
  paidAmount: number;
  status: "pending" | "paid";
  calculationStatus: "provisional" | "ready" | "paid";
  pendingReason: string | null;
  serviceDate: string;
  createdAt: string;
}

export interface CashPayment {
  id: string;
  employeeId: string;
  amount: number;
  note: string | null;
  origin: "physical" | "weekly_offset";
  createdAt: string;
  /** Con fecha, el abono esta deshecho y ya no cuenta en el saldo. */
  revertedAt: string | null;
  revertedByUserId: string | null;
  revertedReason: string | null;
}

export interface WeeklySettlementBlock {
  status: "preview" | "confirmed";
  grossEmployeePay: number;
  cashOutstanding: number;
  cashOffset: number;
  netEmployeePay: number;
  remainingCashDebt: number;
  confirmedAt: string | null;
}

export interface EmployeeMoneyDetail {
  employee: { id: string; name: string };
  period: { startDate: string; endDate: string };
  finalCut: CutResult & {
    direction: SettlementDirection;
    totalCollected: number;
    transferTotal: number;
    netCompanyShare: number;
  };
  weeklySettlement: WeeklySettlementBlock;
  performance: MoneyPerformance;
  paymentMix: { cash: number; transfer: number; card: number };
  comparison: {
    previous: {
      salesTotal: number;
      employeeGrossPay: number;
      servicesCount: number;
    };
    deltas: {
      salesTotal: number | null;
      employeeGrossPay: number | null;
      servicesCount: number | null;
    };
  };
  trend: MoneyTrendPoint[];
  debts: LiquidationDebt[];
  cashObligations: CashObligation[];
  cashPayments: CashPayment[];
  balance: {
    netEmployeePay: number;
    debtOutstanding: number;
    cashOutstanding: number;
    total: number;
  };
}
