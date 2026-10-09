/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import WeeklyServiceHistory from "./WeeklyServiceHistory";
import type { WeeklyHistoryData } from "@/lib/service-history";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
jest.mock("@/lib/actions/service-history", () => ({
  cancelOrVoidServiceAction: jest.fn(),
  softDeleteServiceAction: jest.fn(),
}));

const data: WeeklyHistoryData = {
  week: {
    startDate: "2026-10-05",
    endDate: "2026-10-11",
    previousStart: "2026-09-28",
    nextStart: "2026-10-12",
    canGoNext: false,
  },
  selectedEmployeeId: "employee-1",
  employees: [
    {
      id: "employee-1",
      name: "Modelo QA",
      bossId: "boss-1",
      bossName: "Jefe QA",
    },
  ],
  rows: [
    {
      id: "service-1",
      folio: "ABC12345",
      date: "2026-10-08T18:00:00.000Z",
      durationHours: 2,
      employeeId: "employee-1",
      employeeName: "Modelo QA",
      bossId: "boss-1",
      bossName: "Jefe QA",
      paymentMethod: "tarjeta",
      place: "Lugar QA",
      startAt: "2026-10-08T16:00:00.000Z",
      status: "finalizado",
      rating: 5,
      observations: "Sin incidencias",
      snapshotStatus: "captured",
      hasLegacyExtraSnapshots: false,
      financials: {
        serviceBaseAmount: 2000,
        extensionsAmount: 1000,
        serviceCommissionableBase: 3000,
        employeeServiceExpected: 1800,
        cardExtrasTotal: 1500,
        cardExtraCompanyCommission: 225,
        cardExtrasEmployeeNet: 1275,
        customerTransportCharge: 300,
        employeeExpectedTotal: 3075,
      },
    },
  ],
  summary: {
    services: 1,
    hours: 2,
    serviceBase: 2000,
    extensions: 1000,
    commissionableBase: 3000,
    employeeServiceExpected: 1800,
    cardExtras: 1500,
    cardExtraCompanyCommission: 225,
    cardExtrasEmployeeNet: 1275,
    customerTransport: 300,
    employeeExpectedTotal: 3075,
    cashService: 0,
    cardService: 3000,
    transferService: 0,
    mixedService: 0,
    cancelled: 0,
    averageRating: 5,
  },
};

describe("WeeklyServiceHistory", () => {
  it("muestra tabla desktop, card movil y resumen desde la misma fuente", () => {
    render(
      <WeeklyServiceHistory
        data={data}
        role="empleada"
        basePath="/empleada/historial"
      />,
    );
    expect(screen.getByText("Ganancia servicio 60%")).toBeTruthy();
    expect(screen.getAllByText("Transporte cliente").length).toBeGreaterThan(0);
    expect(screen.getByText("Ganancia 60%")).toBeTruthy();
    expect(screen.getAllByText(/3,075/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ABC12345").length).toBeGreaterThan(0);
  });

  it("no ofrece controles destructivos a empleada", () => {
    render(
      <WeeklyServiceHistory
        data={data}
        role="empleada"
        basePath="/empleada/historial"
      />,
    );
    expect(screen.queryByText("Eliminar")).toBeNull();
    expect(screen.queryByText("Anular")).toBeNull();
  });
});
