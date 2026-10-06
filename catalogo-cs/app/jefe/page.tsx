import { redirect } from "next/navigation";
import TodayWorkspace from "@/components/jefe/today/TodayWorkspace";
import { getJefeTodaySnapshot } from "@/lib/actions/jefe-panel";
import { getMyWorkShift } from "@/lib/actions/work-shift";

interface PageProps {
  /** Compatibilidad con enlaces existentes de solicitudes grupales. */
  searchParams: Promise<{ tab?: string }>;
}

export default async function JefePage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  if (tab === "grupos") redirect("/jefe/grupos");

  const [snapshot, workShift] = await Promise.all([
    getJefeTodaySnapshot(),
    getMyWorkShift(),
  ]);

  return <TodayWorkspace initialSnapshot={snapshot} workShift={workShift} />;
}
