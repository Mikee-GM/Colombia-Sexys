import { redirect } from "next/navigation";
import WeeklyServiceHistory from "@/components/history/WeeklyServiceHistory";
import { getWeeklyServiceHistory } from "@/lib/actions/service-history";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EmployeeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ weekStart?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "empleada") redirect("/");
  const params = await searchParams;
  const data = await getWeeklyServiceHistory({ weekStart: params.weekStart });
  return (
    <main className="min-h-dvh bg-[#0B0D13] px-3 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-white sm:px-6">
      <div className="mx-auto max-w-[1600px]">
        <WeeklyServiceHistory
          data={data}
          role="empleada"
          basePath="/empleada/historial"
        />
      </div>
    </main>
  );
}
