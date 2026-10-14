/** @jest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Driver } from "@/lib/types";
import LiveMap from "./LiveMap";

const mockContainer = document.createElement("div");
const mockMap = {
  getContainer: () => mockContainer,
  invalidateSize: jest.fn(),
  flyTo: jest.fn(),
};
const mockObserve = jest.fn();
const mockDisconnect = jest.fn();
const mockCloseStream = jest.fn();
let resizeCallback: ResizeObserverCallback;

jest.mock("leaflet", () => ({ divIcon: jest.fn() }));
jest.mock("leaflet/dist/leaflet.css", () => ({}));
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div aria-label="Mapa">{children}</div>
  ),
  Marker: () => null,
  Popup: () => null,
  TileLayer: () => null,
  useMap: () => mockMap,
}));

const driver: Driver = {
  id: "driver-1",
  usuarioId: "user-1",
  nombre: "Persona de prueba",
  telefono: "",
  disponible: true,
  ubicacionLat: "20.59",
  ubicacionLng: "-100.39",
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Object.defineProperties(mockContainer, {
    clientWidth: { configurable: true, value: 360 },
    clientHeight: { configurable: true, value: 400 },
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: jest.fn((callback: ResizeObserverCallback) => {
      resizeCallback = callback;
      return { observe: mockObserve, disconnect: mockDisconnect };
    }),
  });
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: jest.fn(() => ({ close: mockCloseStream })),
  });
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

it("ajusta Leaflet al espacio visible y al redimensionar sin mover el centro", () => {
  const { unmount } = render(<LiveMap employees={[]} drivers={[]} />);
  act(() => jest.advanceTimersByTime(20));
  expect(mockObserve).toHaveBeenCalledWith(mockContainer);
  expect(mockMap.invalidateSize).toHaveBeenLastCalledWith({ pan: false });
  expect(mockMap.flyTo).not.toHaveBeenCalled();

  mockMap.invalidateSize.mockClear();
  Object.defineProperty(mockContainer, "clientWidth", { value: 700 });
  act(() => {
    resizeCallback([], {} as ResizeObserver);
    jest.advanceTimersByTime(20);
  });
  expect(mockMap.invalidateSize).toHaveBeenCalledTimes(1);

  act(() => resizeCallback([], {} as ResizeObserver));
  unmount();
  act(() => jest.advanceTimersByTime(20));
  expect(mockMap.invalidateSize).toHaveBeenCalledTimes(1);
  expect(mockDisconnect).toHaveBeenCalledTimes(1);
  expect(mockCloseStream).toHaveBeenCalledTimes(1);
});

it("espera a que un mapa oculto recupere dimensiones antes de redibujarlo", () => {
  Object.defineProperty(mockContainer, "clientHeight", { value: 0 });
  render(<LiveMap employees={[]} drivers={[]} />);
  act(() => jest.advanceTimersByTime(20));
  expect(mockMap.invalidateSize).not.toHaveBeenCalled();

  Object.defineProperty(mockContainer, "clientHeight", { value: 400 });
  act(() => {
    resizeCallback([], {} as ResizeObserver);
    jest.advanceTimersByTime(20);
  });
  expect(mockMap.invalidateSize).toHaveBeenCalledTimes(1);
});

it("permite filtrar, seleccionar y limpiar mediante controles con nombre accesible", () => {
  render(<LiveMap employees={[]} drivers={[driver]} />);
  const search = screen.getByRole("textbox", { name: "Buscar personas en el mapa" });
  fireEvent.change(search, { target: { value: "inexistente" } });
  expect(screen.getByText("No se encontraron coincidencias")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
  fireEvent.click(screen.getByRole("button", { name: /Persona de prueba/ }));
  expect(mockMap.flyTo).toHaveBeenCalledWith([20.59, -100.39], 15, { duration: 1.2 });
  fireEvent.click(screen.getByRole("button", { name: "Quitar filtro" }));
  expect(screen.queryByText("Enfocando a:")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Empleadas" }));
  expect(screen.getByRole("button", { name: "Empleadas" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("No se encontraron coincidencias")).toBeTruthy();
});
