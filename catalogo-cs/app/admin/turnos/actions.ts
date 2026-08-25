"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type {
  DriverShiftCandidates,
  DriverShiftsForDriver,
  DriverShiftDetail,
  DriverShiftSummary,
} from "@/lib/types";

export async function listDriverShifts() {
  return apiFetch<DriverShiftSummary[]>("/driver-shifts");
}

export async function getDriverShift(id: string) {
  return apiFetch<DriverShiftDetail>(`/driver-shifts/${id}`);
}

export async function getDriverShiftCandidates(id: string) {
  return apiFetch<DriverShiftCandidates>(`/driver-shifts/${id}/candidates`);
}

/**
 * Turnos vistos desde la ficha de un chofer: los que ya tiene y los que puede
 * tomar. Es la vista contraria a la de la malla, que parte del turno.
 */
export async function getShiftsForDriver(driverId: string) {
  return apiFetch<DriverShiftsForDriver>(`/driver-shifts/driver/${driverId}`);
}

export async function createDriverShift(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  daysOfWeek: number[];
  capacity?: number;
}) {
  const shift = await apiFetch<DriverShiftDetail>("/driver-shifts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/admin/turnos");
  return shift;
}

export async function updateDriverShift(
  id: string,
  input: {
    title?: string;
    startsAt?: string;
    endsAt?: string;
    daysOfWeek?: number[];
    capacity?: number;
  },
) {
  const shift = await apiFetch<DriverShiftDetail>(`/driver-shifts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  revalidatePath("/admin/turnos");
  return shift;
}

export async function deactivateDriverShift(id: string) {
  await apiFetch(`/driver-shifts/${id}/deactivate`, { method: "POST" });
  revalidatePath("/admin/turnos");
}

export async function assignDriverToShift(shiftId: string, driverId: string) {
  await apiFetch(`/driver-shifts/${shiftId}/assign`, {
    method: "POST",
    body: JSON.stringify({ driverId }),
  });
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/choferes");
}

export async function unassignDriverFromShift(
  shiftId: string,
  driverId: string,
) {
  await apiFetch(`/driver-shifts/${shiftId}/assign/${driverId}`, {
    method: "DELETE",
  });
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/choferes");
}
