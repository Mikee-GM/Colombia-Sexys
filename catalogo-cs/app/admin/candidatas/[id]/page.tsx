import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCandidateScreening } from "@/lib/actions/candidate-screening";
import CandidateDetailClient from "@/components/admin/candidatas/CandidateDetailClient";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CandidateScreeningDetailPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin");

  const { id } = await params;
  const screening = await getCandidateScreening(id);

  return <CandidateDetailClient screening={screening} />;
}
