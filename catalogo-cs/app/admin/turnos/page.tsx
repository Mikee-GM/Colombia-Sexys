import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { apiFetch } from "@/lib/api-server";
import type { ApiUser } from "@/lib/types";
import TurnosClient from "@/components/erp/turnos-client";
import { listDriverShifts } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminTurnosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin/dashboard");

  /*
   * Los usuarios solo resuelven el nombre de quien creo cada turno: si esa
   * lista falla, la malla se sigue viendo con la columna vacia.
   */
  const [shifts, users] = await Promise.all([
    optionalSource(listDriverShifts(), [], "turnos"),
    optionalSource(apiFetch<ApiUser[]>("/users"), [], "turnos"),
  ]);

  return <TurnosClient initialShifts={shifts ?? []} users={users ?? []} />;
}
