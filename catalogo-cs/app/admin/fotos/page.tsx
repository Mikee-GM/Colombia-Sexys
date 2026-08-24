import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getPhotoSubmissions } from "./actions";
import FotosClient from "@/components/erp/fotos-client";

export default async function FotosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin" && user.rol !== "jefe") redirect("/admin/dashboard");

  const submissions = await getPhotoSubmissions();

  return <FotosClient submissions={submissions ?? []} />;
}
