import { redirect } from "next/navigation";
import ServiceTrash from "@/components/history/ServiceTrash";
import { getServiceTrash } from "@/lib/actions/service-history";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ServiceTrashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/");
  return <ServiceTrash items={await getServiceTrash()} />;
}
