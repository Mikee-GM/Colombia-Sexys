/** @jest-environment jsdom */

import { render, screen, within } from "@testing-library/react";
import CutComparison from "./cut-comparison";
import { buildCutComparisonRows } from "./cut-comparison-model";
import type { CutResult, LiquidationRecord, LiquidationReport } from "./types";

jest.mock("./liquidation-record-editor", () => ({
  __esModule: true,
  default: ({ record, locked }: { record: LiquidationRecord; locked: boolean }) => (
    <button data-testid="record-editor" disabled={locked}>Editar {record.id}</button>
  ),
}));

const record = (overrides: Partial<LiquidationRecord> = {}): LiquidationRecord => ({
  id: "office-1", serviceId: "service-1", employeeId: "employee-1", sourceRole: "admin",
  occurredAt: "2026-10-13T16:00:00.000Z", serviceTotal: 1200, paymentMethod: "efectivo",
  cashAmount: 1200, cardAmounts: [], companyPercentage: 50, extraAmount: 0, promotion: false,
  membershipAmount: 0, companyTransportExpense: 100, customerTransportCharge: 0,
  employeeUberReimbursement: 0, employeeCashDue: 0, electronicExtraAmount: 0,
  cardExtraAmount: 0, transportExcess: 0, place: "Lugar QA", cancelled: false, isFine: false, fineAmount: 0,
  ...overrides,
});

const cut: CutResult = {
  salesTotal: 1200, finesTotal: 0, cashTotal: 1200, companyCommission: 600, transportTotal: 100,
  cardTotal: 0, calculatedExtras: 0, membershipTotal: 0, promotionTotal: 0, nearbyTripsCount: 0,
  nearbyTripsCost: 0, customerTransportCharges: 0, employeeUberReimbursements: 0,
  employeeCashDue: 600, employeeGrossPay: 500, result: -700, direction: "employee_owes_company",
  count: 1, cardExtrasTotal: 0, cardExtraCommission: 0,
};

const report = (overrides: Partial<LiquidationReport> = {}): LiquidationReport => ({
  employee: { id: "employee-1", name: "Persona QA" },
  period: { startDate: "2026-10-12", endDate: "2026-10-18" },
  officeCut: cut, employeeCut: { ...cut, salesTotal: 1100 }, finalCut: cut,
  officeRecords: [record()],
  employeeRecords: [record({ id: "employee-record-1", sourceRole: "empleada", serviceTotal: 1100 })],
  discrepancy: { exists: true, difference: 100 },
  serviceDiscrepancies: [{ serviceId: "service-1", officeTotal: 1200, employeeTotal: 1100, difference: 100 }],
  commissionSettings: { cardExtraCommissionPercentage: 0, cardExtraCommissionThreshold: 0 },
  weeklySettlement: { status: "preview", grossEmployeePay: 500, cashOutstanding: 600, cashOffset: 500, netEmployeePay: 0, remainingCashDebt: 100, confirmedAt: null },
  ...overrides,
});

describe("hoja de corte: comparación de registros existentes", () => {
  it("empareja por servicio, conserva ambos registros y la diferencia del backend", () => {
    const data = report();
    const rows = buildCutComparisonRows(data);
    expect(rows).toHaveLength(1);
    expect(rows[0].office).toEqual(data.officeRecords);
    expect(rows[0].employee).toEqual(data.employeeRecords);
    expect(rows[0].discrepancy).toBe(data.serviceDiscrepancies[0]);
  });

  it("no confunde ajustes sin servicio aunque coincidan fecha e importe", () => {
    const rows = buildCutComparisonRows(report({
      officeRecords: [record({ serviceId: null })],
      employeeRecords: [record({ id: "employee-adjustment", serviceId: null, sourceRole: "empleada" })],
      serviceDiscrepancies: [],
    }));
    expect(rows).toHaveLength(2);
    expect(rows[0].employee).toEqual([]);
    expect(rows[1].office).toEqual([]);
    expect(rows.every((row) => !row.discrepancy)).toBe(true);
  });

  it("no pierde registros repetidos de un mismo servicio ni los que sólo reporta la empleada", () => {
    const rows = buildCutComparisonRows(report({
      officeRecords: [record(), record({ id: "office-2" })],
      employeeRecords: [record({ id: "employee-only", serviceId: "service-2", sourceRole: "empleada", occurredAt: "2026-10-14T16:00:00.000Z" })],
    }));
    expect(rows[0].employee[0].id).toBe("employee-only");
    expect(rows[0].office).toEqual([]);
    expect(rows[1].office).toHaveLength(2);
  });

  it("con registros múltiples muestra el resultado reportado sin afirmar igualdad de sus sumas", () => {
    render(<CutComparison report={report({
      officeRecords: [record({ id: "office-extra", serviceTotal: 500 }), record()],
      employeeRecords: [record({ id: "employee-record-1", sourceRole: "empleada" })],
      serviceDiscrepancies: [],
      discrepancy: { exists: false, difference: 0 },
    })} />);
    const article = screen.getByRole("article", { name: "Registro service-" });
    expect(within(article).getByText("500")).toBeTruthy();
    expect(within(article).getByText("Sin diferencia reportada")).toBeTruthy();
    expect(within(article).queryByText("Total coincide")).toBeNull();
  });

  it("muestra oficina y empleada con importes diferentes sin recalcular el corte", () => {
    render(<CutComparison report={report()} />);
    const article = screen.getByRole("article", { name: "Registro service-" });
    expect(within(article).getByRole("heading", { name: "Oficina" })).toBeTruthy();
    expect(within(article).getByRole("heading", { name: "Empleada" })).toBeTruthy();
    expect(within(article).getByText(/Diferencia de total:/).textContent).toContain("100");
    expect(within(article).getAllByText(/1,200/).length).toBeGreaterThan(0);
    expect(within(article).getByText(/1,100/)).toBeTruthy();
    expect(screen.queryByTestId("record-editor")).toBeNull();
  });

  it("distingue ausencia de un registro de un importe cero", () => {
    render(<CutComparison report={report({
      officeRecords: [],
      serviceDiscrepancies: [{ serviceId: "service-1", officeTotal: null, employeeTotal: 1100, difference: -1100 }],
    })} />);
    expect(screen.getByText("Falta registro de oficina.")).toBeTruthy();
    expect(screen.getByText("Sin registro")).toBeTruthy();
  });

  it("conserva edición sólo de oficina para admin y el bloqueo de un corte confirmado", () => {
    render(<CutComparison report={report()} isAdmin locked />);
    const editors = screen.getAllByTestId("record-editor");
    expect(editors).toHaveLength(1);
    expect(editors[0].textContent).toBe("Editar office-1");
    expect((editors[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("mantiene visibles cancelaciones y multas independientes", () => {
    render(<CutComparison report={report({
      officeRecords: [record({ cancelled: true }), record({ id: "fine-1", serviceId: null, isFine: true, fineAmount: 200 })],
    })} />);
    expect(screen.getByText("Cancelado")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Ajuste independiente" }).textContent).toContain("200");
  });
});
