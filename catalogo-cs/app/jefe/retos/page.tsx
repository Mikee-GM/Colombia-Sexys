import { redirect } from "next/navigation";
import ChallengesClient from "@/components/challenges/challenges-client";
import { getChallengesRoster, listChallenges } from "@/app/admin/retos/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function JefeRetosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol === "admin") redirect("/admin/retos");
  if (user.rol !== "jefe") redirect("/admin");

  const [challenges, roster] = await Promise.all([
    listChallenges(),
    getChallengesRoster(),
  ]);
  const employees = roster.employees.filter((employee) => employee.jefeId === user.id);

  return (
    <ChallengesClient
      role="jefe"
      initialChallenges={challenges}
      employees={employees}
      drivers={roster.drivers}
    />
  );
}
