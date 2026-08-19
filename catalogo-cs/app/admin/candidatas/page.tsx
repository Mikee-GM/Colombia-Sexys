import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getCandidateScreenings,
  getScreeningQuestions,
} from "@/lib/actions/candidate-screening";
import CandidatasClient from "@/components/admin/candidatas/CandidatasClient";

export default async function CandidatasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin");

  const [screenings, questions] = await Promise.all([
    getCandidateScreenings(),
    getScreeningQuestions(),
  ]);

  return <CandidatasClient initialScreenings={screenings} initialQuestions={questions} />;
}
