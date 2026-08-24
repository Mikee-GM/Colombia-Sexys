import { redirect } from "next/navigation";

import { getCurrentUser, isRedirectError } from "@/lib/auth";
import { apiFetch } from "@/lib/api-server";
import type { ApiUser } from "@/lib/types";
import TurnosClient from "@/components/erp/turnos-client";
import { listDriverShifts } from "./actions";

export const dynamic = "force-dynamic";

/** Degrada una fuente sin tragarse las redirecciones de sesion de apiFetch. */
async function opcional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Fuente no disponible en turnos:", error);
    return fallback;
  }
}

export default async function AdminTurnosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin/dashboard");

  /*
   * Los usuarios solo resuelven el nombre de quien creo cada turno: si esa
   * lista falla, la malla se sigue viendo con la columna vacia.
   */
  const [shifts, users] = await Promise.all([
    opcional(listDriverShifts(), []),
    opcional(apiFetch<ApiUser[]>("/users"), []),
  ]);

  return <TurnosClient initialShifts={shifts ?? []} users={users ?? []} />;
}
