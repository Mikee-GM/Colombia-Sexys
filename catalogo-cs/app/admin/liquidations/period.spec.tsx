/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import LiquidationsPage from "./page";
import LiquidacionEmpleadaPage from "./[id]/page";
import { getLiquidationReport, getWeeklySummary } from "./actions";
import { getEmployeeTransferReceipts } from "@/lib/actions/evidence";

jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => { throw new Error("redirect"); }),
  notFound: jest.fn(() => { throw new Error("notFound"); }),
}));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn(async () => ({ rol: "admin" })) }));
jest.mock("./actions", () => ({
  getWeeklySummary: jest.fn(async () => []),
  getLiquidationReport: jest.fn(async () => ({ employee: { id: "person-1" } })),
}));
jest.mock("@/lib/actions/evidence", () => ({
  getEmployeeTransferReceipts: jest.fn(async () => ({ items: [], nextCursor: null })),
}));
jest.mock("@/components/erp/primitives", () => ({ ErpPageHeader: () => null }));
jest.mock("@/components/erp/corte-semanal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/erp/liquidacion-empleada", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/liquidations/liquidations-client", () => ({
  __esModule: true,
  default: ({ initialReference }: { initialReference: string }) => <div>Referencia: {initialReference}</div>,
}));

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

it("comparte el instante del servidor con el cliente y consulta el domingo completo", async () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-12T05:59:59.999Z"));
  render(await LiquidationsPage());
  expect(getWeeklySummary).toHaveBeenCalledWith("2026-10-05T06:00:00.000Z", "2026-10-12T05:59:59.999Z");
  expect(screen.getByText("Referencia: 2026-10-12T05:59:59.999Z")).toBeTruthy();
});

it("abre el detalle con el mismo intervalo y conserva el contrato date-only de evidencias", async () => {
  await LiquidacionEmpleadaPage({
    params: Promise.resolve({ id: "person-1" }),
    searchParams: Promise.resolve({ start: "2026-10-12", end: "2026-10-18" }),
  });
  expect(getLiquidationReport).toHaveBeenCalledWith("2026-10-12T06:00:00.000Z", "2026-10-19T05:59:59.999Z", "person-1");
  expect(getEmployeeTransferReceipts).toHaveBeenCalledWith("person-1", "2026-10-12", "2026-10-18");
});

it("no consulta datos con fechas de calendario invalidas", async () => {
  await expect(LiquidacionEmpleadaPage({
    params: Promise.resolve({ id: "person-1" }),
    searchParams: Promise.resolve({ start: "2026-02-30", end: "2026-03-01" }),
  })).rejects.toThrow("notFound");
  expect(getLiquidationReport).not.toHaveBeenCalled();
});
