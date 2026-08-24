import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { optionalSource } from "@/lib/optional-source";
import { getCandidateScreenings } from "@/lib/actions/candidate-screening";
import { getRegulations, getStaffOnboarding } from "@/lib/actions/onboarding";
import OnboardingClient from "@/components/erp/onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin/dashboard");

  const [screenings, staff, regulations] = await Promise.all([
    optionalSource(getCandidateScreenings(), [], "onboarding"),
    optionalSource(getStaffOnboarding(), [], "onboarding"),
    optionalSource(getRegulations(), [], "onboarding"),
  ]);

  return (
    <OnboardingClient
      screenings={screenings ?? []}
      staff={staff ?? []}
      regulations={regulations ?? []}
    />
  );
}
