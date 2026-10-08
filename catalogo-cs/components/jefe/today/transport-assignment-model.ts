import type { Service, Trip } from "@/lib/types";
import { operationStateForService } from "./today-model";

export type TransportAssignmentContext = {
  tripType: Trip["tipo"];
  trip?: Trip;
  needsAssignment: boolean;
};

/**
 * Resuelve el traslado que el jefe puede gestionar sin asumir que ya existe
 * un viaje. La eleccion de proveedor es precisamente la que crea ese viaje.
 */
export function transportAssignmentContext(
  service: Service,
): TransportAssignmentContext | null {
  const trips = service.viajes ?? [];
  const state = operationStateForService(service);
  const needsOutboundTransport = state === "esperando_transporte_ida";
  const needsReturnTransport =
    state === "preparando_regreso" ||
    (service.estadoLiquidacion === "transporte_pendiente" &&
      !trips.some((trip) => trip.tipo === "regreso"));

  if (!needsOutboundTransport && !needsReturnTransport) return null;

  const tripType = needsReturnTransport ? "regreso" : "ida";
  const trip = trips.find((item) => item.tipo === tripType);
  return {
    tripType,
    trip,
    needsAssignment: !trip,
  };
}

export function transportChoicePrompt(tripType: Trip["tipo"]): string {
  return `¿Cómo se realizará el viaje de ${tripType}?`;
}
