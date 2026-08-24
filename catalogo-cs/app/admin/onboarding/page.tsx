import { redirect } from "next/navigation";

import { getCurrentUser, isRedirectError } from "@/lib/auth";
import { getCandidateScreenings } from "@/lib/actions/candidate-screening";
import { getRegulations, getStaffOnboarding } from "@/lib/actions/onboarding";
import OnboardingClient from "@/components/erp/onboarding-client";

export const dynamic = "force-dynamic";

/** Degrada una fuente sin tragarse las redirecciones de sesion de apiFetch. */
async function opcional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("Fuente no disponible en onboarding:", error);
    return fallback;
  }
}

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin");
  if (user.rol !== "admin") redirect("/admin/dashboard");

  const [screenings, staff, regulations] = await Promise.all([
    opcional(getCandidateScreenings(), []),
    opcional(getStaffOnboarding(), []),
    opcional(getRegulations(), []),
  ]);

  return (
    <OnboardingClient
      screenings={screenings ?? []}
      staff={staff ?? []}
      regulations={regulations ?? []}
    />
  );
}
