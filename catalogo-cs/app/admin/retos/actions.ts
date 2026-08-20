"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type {
  ChallengeDetail,
  ChallengeMetric,
  ChallengeParticipantType,
  ChallengeSummary,
  Driver,
  Employee,
} from "@/lib/types";

export async function getChallengesRoster() {
  const [employees, drivers] = await Promise.all([
    apiFetch<Employee[]>("/employees"),
    apiFetch<Driver[]>("/drivers"),
  ]);
  return { employees, drivers };
}

export async function listChallenges() {
  return apiFetch<ChallengeSummary[]>("/challenges");
}

export async function getChallenge(id: string) {
  return apiFetch<ChallengeDetail>(`/challenges/${id}`);
}

export async function createChallenge(input: {
  title: string;
  participantType: ChallengeParticipantType;
  metric: ChallengeMetric;
  participantIds: string[];
  startsAt?: string;
  endsAt: string;
}) {
  const challenge = await apiFetch<ChallengeDetail>("/challenges", {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/admin/retos");
  revalidatePath("/jefe/retos");
  return challenge;
}

export async function cancelChallenge(id: string) {
  await apiFetch(`/challenges/${id}/cancel`, { method: "POST" });
  revalidatePath("/admin/retos");
  revalidatePath("/jefe/retos");
}
