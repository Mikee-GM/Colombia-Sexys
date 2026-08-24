import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getAllDebts } from "@/app/admin/liquidations/actions";
import { getCashObligations } from "@/app/admin/transport/actions";
import CarteraClient from "@/components/erp/cartera-client";
import CashObligationsPanel from "@/components/erp/cash-obligations-panel";

export const dynamic = "force-dynamic";

export default async function CarteraPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  // La cartera son las deudas mas el efectivo que aun no entregan las empleadas.
  const [debts, cash] = await Promise.all([
    getAllDebts().catch(() => []),
    getCashObligations().catch(() => ({
      obligations: [],
      employees: [],
      total: 0,
    })),
  ]);

  return (
    <CarteraClient debts={debts ?? []}>
      <CashObligationsPanel cash={cash} />
    </CarteraClient>
  );
}
