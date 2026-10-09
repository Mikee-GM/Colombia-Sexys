import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import WeeklyServiceHistory from "@/components/history/WeeklyServiceHistory";
import { getCurrentUser } from "@/lib/auth";
import { getWeeklyServiceHistory } from "@/lib/actions/service-history";

export const dynamic = "force-dynamic";

export default async function JefeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ weekStart?: string; employeeId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "jefe" && user.rol !== "admin") redirect("/");
  const params = await searchParams;
  const data = await getWeeklyServiceHistory(params);
  return (
    <>
      <Link
        href="/jefe"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-800 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:border-[#C5A55A] hover:text-[#C5A55A]"
      >
        <ArrowLeft size={14} /> Volver a Hoy
      </Link>
      <WeeklyServiceHistory
        data={data}
        role={user.rol === "admin" ? "admin" : "jefe"}
        basePath="/jefe/historial"
      />
    </>
  );
}
