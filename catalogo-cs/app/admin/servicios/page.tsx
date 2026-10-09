import { redirect } from "next/navigation";
import WeeklyServiceHistory from "@/components/history/WeeklyServiceHistory";
import { getWeeklyServiceHistory } from "@/lib/actions/service-history";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminServicesControlPage({
  searchParams,
}: {
  searchParams: Promise<{ weekStart?: string; employeeId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/");
  const data = await getWeeklyServiceHistory(await searchParams);
  return (
    <div className="mx-auto max-w-[1900px]">
      <WeeklyServiceHistory
        data={data}
        role="admin"
        basePath="/admin/servicios"
      />
    </div>
  );
}
