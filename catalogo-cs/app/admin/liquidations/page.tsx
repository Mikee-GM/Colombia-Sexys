import { getCurrentUser } from "@/lib/auth";
import LiquidationsClient from "@/components/liquidations/liquidations-client";

export default async function LiquidationsPage() {
  const user = await getCurrentUser();
  return <LiquidationsClient isAdmin={user?.rol === "admin"} />;
}