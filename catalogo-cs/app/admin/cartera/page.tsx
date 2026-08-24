import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getAllDebts } from "@/app/admin/liquidations/actions";
import CarteraClient from "@/components/erp/cartera-client";

export default async function CarteraPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  const debts = await getAllDebts();

  return <CarteraClient debts={debts ?? []} />;
}
