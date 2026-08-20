import { redirect } from "next/navigation";
import DriverShiftsClient from "@/components/driver-shifts/driver-shifts-client";
import { getCurrentUser } from "@/lib/auth";
import { listDriverShifts } from "./actions";

export default async function AdminTurnosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin/dashboard");

  const shifts = await listDriverShifts();

  return <DriverShiftsClient initialShifts={shifts} />;
}
