/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LiquidationsClient from "./liquidations-client";
import { confirmWeeklySettlement, getActiveDrivers, getDriverReport, getLiquidationEmployees, getLiquidationReport } from "@/app/admin/liquidations/actions";
import type { LiquidationReport } from "./types";
import { getStartAndEndOfWeek, getWeekStringFromDate } from "@/lib/calculations";

jest.mock("@/app/admin/liquidations/actions", () => ({
  getLiquidationEmployees: jest.fn(),
  getLiquidationReport: jest.fn(),
  confirmWeeklySettlement: jest.fn(),
  getActiveDrivers: jest.fn().mockResolvedValue([]),
  getDriverReport: jest.fn(),
  getEmployeeRankingPositions: jest.fn().mockResolvedValue([]),
  getDriverRankingPositions: jest.fn().mockResolvedValue([]),
}));
jest.mock("./cut-comparison", () => ({ __esModule: true, default: ({ report }: { report: LiquidationReport }) => <div>Corte cargado: {report.employee.name}</div> }));
jest.mock("./liquidation-summary", () => ({ __esModule: true, default: () => null }));
jest.mock("./liquidation-breakdown", () => ({ __esModule: true, default: () => null }));
jest.mock("./debt-manager", () => ({ __esModule: true, default: () => null }));
jest.mock("./driver-settlement-panel", () => ({ __esModule: true, default: () => null }));
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

beforeEach(() => { jest.clearAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function report(id: string, name: string): LiquidationReport {
  return {
    employee: { id, name },
    period: { startDate: "2026-10-12", endDate: "2026-10-18" },
    officeRecords: [], employeeRecords: [], serviceDiscrepancies: [],
    discrepancy: { exists: false, difference: 0 },
    commissionSettings: { cardExtraCommissionPercentage: 0, cardExtraCommissionThreshold: 0 },
    officeCut: {} as LiquidationReport["officeCut"],
    employeeCut: {} as LiquidationReport["employeeCut"],
    finalCut: {} as LiquidationReport["finalCut"],
    weeklySettlement: { status: "preview", grossEmployeePay: 0, cashOutstanding: 0, cashOffset: 0, netEmployeePay: 0, remainingCashDebt: 0, confirmedAt: null },
  };
}

it("no mezcla el corte anterior con otra persona cuando las respuestas llegan fuera de orden", async () => {
  const first = deferred<LiquidationReport>();
  const second = deferred<LiquidationReport>();
  jest.mocked(getLiquidationEmployees).mockResolvedValue([
    { id: "person-1", userId: "user-1", name: "Persona QA 01", active: true, bosses: [] },
    { id: "person-2", userId: "user-2", name: "Persona QA 02", active: true, bosses: [] },
  ]);
  jest.mocked(getLiquidationReport).mockImplementation((_start, _end, employeeId) => employeeId === "person-1" ? first.promise : second.promise);
  render(<LiquidationsClient initialReference="2026-10-14T12:00:00Z" />);
  fireEvent.click(await screen.findByRole("button", { name: "Persona QA 01" }));
  fireEvent.click(screen.getByRole("button", { name: "Persona QA 02" }));
  await act(async () => { second.resolve(report("person-2", "Persona QA 02")); });
  expect(screen.getByText("Corte cargado: Persona QA 02")).toBeTruthy();
  await act(async () => { first.resolve(report("person-1", "Persona QA 01")); });
  expect(screen.queryByText("Corte cargado: Persona QA 01")).toBeNull();
  expect(screen.getByText("Corte cargado: Persona QA 02")).toBeTruthy();
});

it("una confirmación tardía conserva la selección actual y confirma sólo la persona original", async () => {
  const confirmation = deferred<unknown>();
  jest.mocked(confirmWeeklySettlement).mockReturnValue(confirmation.promise);
  jest.mocked(getLiquidationEmployees).mockResolvedValue([
    { id: "person-1", userId: "user-1", name: "Persona QA 01", active: true, bosses: [] },
    { id: "person-2", userId: "user-2", name: "Persona QA 02", active: true, bosses: [] },
  ]);
  jest.mocked(getLiquidationReport).mockImplementation(async (_start, _end, employeeId) => report(employeeId, employeeId === "person-1" ? "Persona QA 01" : "Persona QA 02"));
  render(<LiquidationsClient initialReference="2026-10-14T12:00:00Z" />);
  fireEvent.click(await screen.findByRole("button", { name: "Persona QA 01" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar liquidación semanal" }));
  fireEvent.click(screen.getByRole("button", { name: "Persona QA 02" }));
  expect(await screen.findByText("Corte cargado: Persona QA 02")).toBeTruthy();
  await act(async () => { confirmation.resolve({}); });
  expect(screen.queryByText("Corte cargado: Persona QA 01")).toBeNull();
  expect(screen.getByText("Corte cargado: Persona QA 02")).toBeTruthy();
  expect(confirmWeeklySettlement).toHaveBeenCalledWith(expect.any(String), expect.any(String), "person-1");
});

it("consulta y confirma exactamente la semana del negocio usando la referencia del servidor", async () => {
  const start = "2026-10-05T06:00:00.000Z";
  const end = "2026-10-12T05:59:59.999Z";
  jest.mocked(getLiquidationEmployees).mockResolvedValue([
    { id: "person-1", userId: "user-1", name: "Persona QA 01", active: true, bosses: [] },
  ]);
  jest.mocked(getLiquidationReport).mockResolvedValue(report("person-1", "Persona QA 01"));
  jest.mocked(confirmWeeklySettlement).mockResolvedValue({});
  render(<LiquidationsClient initialReference="2026-10-12T05:59:59.999Z" />);
  expect(screen.getByText("2026-W41")).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Persona QA 01" }));
  expect(getLiquidationEmployees).toHaveBeenCalledWith(start, end);
  expect(getLiquidationReport).toHaveBeenCalledWith(start, end, "person-1");
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar liquidación semanal" }));
  await waitFor(() => expect(confirmWeeklySettlement).toHaveBeenCalledWith(start, end, "person-1"));
  fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
  await waitFor(() => expect(getLiquidationEmployees).toHaveBeenLastCalledWith(
    "2026-10-12T06:00:00.000Z", "2026-10-19T05:59:59.999Z",
  ));
  expect(screen.getByText("2026-W42")).toBeTruthy();
});

it("conserva el criterio anterior de choferes al cambiar modo y navegar semanas", async () => {
  const reference = new Date("2026-10-12T05:59:59.999Z");
  const legacyPeriod = (date: Date) => {
    const { start, end } = getStartAndEndOfWeek(date);
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)] as const;
  };
  jest.mocked(getLiquidationEmployees).mockResolvedValue([]);
  jest.mocked(getActiveDrivers).mockResolvedValue([{ id: "driver-1", name: "Persona QA chofer" }]);
  jest.mocked(getDriverReport).mockResolvedValue({
    driver: { id: "driver-1", name: "Persona QA chofer" },
    period: { startDate: "2026-10-12", endDate: "2026-10-18" },
    trips: [],
    weeklySettlement: { status: "preview", totalPay: 0, confirmedAt: null },
  });
  render(<LiquidationsClient initialReference={reference.toISOString()} />);
  // Navegar el corte corregido no debe cambiar la referencia del modo choferes.
  fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
  fireEvent.click(screen.getByRole("button", { name: "Choferes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Persona QA chofer" }));
  expect(getActiveDrivers).toHaveBeenLastCalledWith(...legacyPeriod(reference));
  expect(getDriverReport).toHaveBeenLastCalledWith(...legacyPeriod(reference), "driver-1");
  expect(screen.getByText(getWeekStringFromDate(reference))).toBeTruthy();

  const next = new Date(reference);
  next.setDate(next.getDate() + 7);
  fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
  await waitFor(() => expect(getActiveDrivers).toHaveBeenLastCalledWith(...legacyPeriod(next)));
  await waitFor(() => expect(getDriverReport).toHaveBeenLastCalledWith(...legacyPeriod(next), "driver-1"));
  expect(screen.getByText(getWeekStringFromDate(next))).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Empleadas" }));
  expect(screen.getByText("2026-W42")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Choferes" }));
  await waitFor(() => expect(getActiveDrivers).toHaveBeenLastCalledWith(...legacyPeriod(next)));
  expect(screen.getByText(getWeekStringFromDate(next))).toBeTruthy();
});
