/** @jest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { assignInternalTransport } from "@/lib/actions/jefe-panel";
import type { Service, Trip } from "@/lib/types";
import { TransportPanel } from "@/components/jefe/TeamOperations";
import ServiceInspector from "./ServiceInspector";
import {
  shouldRefreshTodayWorkspace,
  type JefeConversation,
} from "./today-model";

jest.mock("@/lib/actions/jefe-panel", () => ({
  assignInternalTransport: jest.fn().mockResolvedValue({ success: true }),
  assignExternalTransport: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("@/components/admin/evaluations/evaluation-history-sheet", () =>
  jest.fn(() => null),
);
jest.mock("@/components/services/create-service-dialog", () =>
  jest.fn(() => null),
);
jest.mock("@/components/services/cancel-service-dialog", () =>
  jest.fn(() => null),
);
jest.mock("@/components/services/service-reschedule-dialog", () =>
  jest.fn(() => null),
);
jest.mock("@/components/services/service-location-dialog", () =>
  jest.fn(() => null),
);
jest.mock("@/components/erp/galeria-fotos", () => jest.fn(() => null));
jest.mock("@/components/services/cerrar-por-oficina", () =>
  jest.fn(() => null),
);
jest.mock("@/components/services/reasignar-modelo", () =>
  jest.fn(() => null),
);
jest.mock("@/components/jefe/ManualServiceControls", () =>
  jest.fn(() => null),
);
jest.mock("@/components/jefe/GroupServiceOrganizer", () =>
  jest.fn(() => null),
);
jest.mock("@/components/jefe/uber-screenshot-uploader", () =>
  jest.fn(() => null),
);
jest.mock("@/components/jefe/CanalConModelo", () => jest.fn(() => null));

const mockedAssignInternalTransport = jest.mocked(assignInternalTransport);

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: "service-transport",
    empleadaId: "employee-1",
    clienteId: "client-1",
    jefeId: "boss-1",
    metodoPago: "efectivo",
    duracionPactadaHoras: "1",
    duracionFinalHoras: null,
    ubicacionClienteLat: "19.4",
    ubicacionClienteLng: "-99.1",
    precioBaseHoraPactado: "1000",
    totalBase: "1000",
    totalExtras: "0",
    totalFinal: "1000",
    horaInicioServicio: null,
    horaFinServicio: null,
    horaLlegadaCasa: null,
    prorrogasUsadas: 0,
    estado: "pendiente",
    operationalState: "esperando_transporte_ida",
    notas: null,
    iaActiva: true,
    calificacion: null,
    comentariosCalificacion: null,
    servicioPrevioId: null,
    horaInicioEstimada: null,
    createdAt: "2026-10-08T10:00:00.000Z",
    calculationStatus: "ready",
    pendingReason: null,
    customerTotal: 1000,
    uberDeduction: 0,
    updatedAt: "2026-10-08T10:00:00.000Z",
    viajes: [],
    cliente: {
      id: "client-1",
      telegramChatId: "100",
      nombreTelegram: "Cliente QA",
    },
    empleada: {
      id: "employee-1",
      usuarioId: "employee-user-1",
      nombreReal: "Empleada QA",
      nombreArtistico: "Empleada QA",
      slugCatalogo: "empleada-qa",
      fotoPerfilUrl: null,
      descripcion: null,
      precioBaseHora: "1000",
      disponible: true,
      catalogoActivo: true,
      totalServiciosValorados: 0,
      promedioCalificacion: null,
      ubicacionLat: null,
      ubicacionLng: null,
    },
    ...overrides,
  };
}

function conversation(currentService: Service): JefeConversation {
  return {
    id: currentService.id,
    clientId: currentService.clienteId,
    clientName: "Cliente QA",
    telegramId: "100",
    employeeId: currentService.empleadaId,
    employeeName: "Empleada QA",
    service: currentService,
    bookingSessionId: null,
    bookingData: null,
    bookingDraft: null,
    relatedServices: [currentService],
    messages: [],
    lastMessage: "",
    lastAt: currentService.updatedAt,
    mode: "AI_ACTIVE",
    needsReply: false,
    unreadCount: 0,
  };
}

function renderPanel(currentService: Service) {
  return render(
    <TransportPanel service={currentService} onRefresh={jest.fn()} />,
  );
}

describe("asignación de transporte desde Hoy", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(cleanup);

  it("abre Chofer interno y Uber / DiDi desde el CTA principal sin viaje", () => {
    const currentService = service();
    render(
      <ServiceInspector
        conversation={conversation(currentService)}
        employees={[currentService.empleada!]}
        onRefresh={jest.fn()}
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "ASIGNAR TRANSPORTE" })[0],
    );

    expect(
      screen.getByRole("button", { name: "Chofer interno" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Uber / DiDi" })).toBeDefined();
  });

  it("elige chofer y llama assignInternalTransport con el servicio", async () => {
    renderPanel(service());
    fireEvent.click(
      screen.getByRole("button", { name: "Asignar transporte" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Chofer interno" }));

    await waitFor(() =>
      expect(mockedAssignInternalTransport).toHaveBeenCalledWith(
        "service-transport",
      ),
    );
  });

  it("elige Uber / DiDi y abre ExternalTransportSheet", () => {
    renderPanel(service());
    fireEvent.click(
      screen.getByRole("button", { name: "Asignar transporte" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Uber / DiDi" }));

    expect(screen.getByText("Asignar transporte externo")).toBeDefined();
    expect(screen.getByText("Link compartido del viaje")).toBeDefined();
    expect(screen.getByText("Costo")).toBeDefined();
  });

  it("muestra Viaje de ida al crear un externo sin viaje previo", () => {
    renderPanel(service());
    fireEvent.click(
      screen.getByRole("button", { name: "Asignar transporte" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Uber / DiDi" }));

    expect(screen.getByText("Viaje de ida")).toBeDefined();
    expect(screen.queryByText("Viaje de regreso")).toBeNull();
  });

  it("muestra búsqueda de chofer después de crear el viaje interno", () => {
    const pendingTrip: Trip = {
      id: "trip-1",
      servicioId: "service-transport",
      choferId: "driver-offered",
      tipo: "ida",
      estado: "notificado",
      proveedorTransporte: "interno",
      tarifa: 100,
    };
    renderPanel(service({ viajes: [pendingTrip] }));

    expect(screen.getByText("Buscando chofer...")).toBeDefined();
    expect(
      screen.getByText("Viaje enviado a los choferes disponibles."),
    ).toBeDefined();
  });

  it("muestra los datos del chofer solamente después de aceptar", () => {
    const acceptedTrip: Trip = {
      id: "trip-accepted",
      servicioId: "service-transport",
      choferId: "driver-1",
      tipo: "ida",
      estado: "aceptado",
      proveedorTransporte: "interno",
      tarifa: 100,
      chofer: {
        id: "driver-1",
        nombre: "Chofer QA",
        vehiculoMarca: "Nissan",
        vehiculoModelo: "Versa",
        vehiculoColor: "Negro",
        vehiculoPlaca: "QA-123",
      },
    };
    renderPanel(
      service({
        operationalState: "transporte_ida_asignado",
        viajes: [acceptedTrip],
      }),
    );

    expect(screen.getByText("Chofer asignado")).toBeDefined();
    expect(screen.getByText("Chofer QA")).toBeDefined();
    expect(screen.getByText("Nissan · Versa · Negro")).toBeDefined();
    expect(screen.getByText("Placas QA-123")).toBeDefined();
  });

  it("funciona sin viajes para regreso y conserva la dirección explícita", () => {
    renderPanel(
      service({ operationalState: "preparando_regreso", viajes: [] }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Asignar transporte" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Uber / DiDi" }));

    expect(screen.getByText("Viaje de regreso")).toBeDefined();
  });

  it.each([
    "internal_transport_selected",
    "trip_accepted",
    "external_transport_assigned",
    "trip_status_updated",
  ])("refresca TodayWorkspace al recibir %s", (eventType) => {
    expect(shouldRefreshTodayWorkspace(eventType)).toBe(true);
  });
});
