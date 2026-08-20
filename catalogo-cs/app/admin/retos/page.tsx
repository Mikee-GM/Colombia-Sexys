import { redirect } from "next/navigation";
import ChallengesClient from "@/components/challenges/challenges-client";
import { getCurrentUser } from "@/lib/auth";
import { getChallengesRoster, listChallenges } from "./actions";

export default async function AdminRetosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin/dashboard");

  const [challenges, roster] = await Promise.all([
    listChallenges(),
    getChallengesRoster(),
  ]);

  return (
    <ChallengesClient
      role="admin"
      initialChallenges={challenges}
      employees={roster.employees}
      drivers={roster.drivers}
    />
  );
}
