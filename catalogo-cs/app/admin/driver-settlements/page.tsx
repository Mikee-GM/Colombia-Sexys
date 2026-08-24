import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getDriverSettlements } from "@/app/admin/transport/actions";
import { getOperationalWeek } from "@/lib/week-range";
import DriverSettlementsClient from "@/components/erp/driver-settlements-client";

export default async function DriverSettlementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  const { startDate, endDate } = getOperationalWeek();
  const trips = await getDriverSettlements(startDate, endDate);

  return (
    <DriverSettlementsClient
      trips={trips ?? []}
      startDate={startDate}
      endDate={endDate}
      canSettle={user.rol === "admin"}
    />
  );
}
