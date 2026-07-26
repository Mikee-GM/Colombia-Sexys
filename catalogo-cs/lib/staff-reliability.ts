import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";

export type StaffTrustScores = Record<string, number | null>;

type StaffMember = {
  id: string;
  onboarding?: {
    attemptCount?: number;
    trustScore?: number;
  } | null;
};

export async function getStaffTrustScores(): Promise<StaffTrustScores> {
  try {
    const staff = await apiFetch<StaffMember[]>("/staff-onboarding/staff");
    return staff.reduce((scores: StaffTrustScores, member) => {
      const onboarding = member.onboarding;
      scores[member.id] =
        onboarding &&
        typeof onboarding.attemptCount === "number" &&
        onboarding.attemptCount > 0 &&
        typeof onboarding.trustScore === "number"
          ? onboarding.trustScore
          : null;
      return scores;
    }, {});
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error("getStaffTrustScores error:", error);
    return {};
  }
}
