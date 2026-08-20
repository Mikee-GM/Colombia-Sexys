"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type {
  CandidateScreening,
  CandidateScreeningStatus,
  ScreeningQuestion,
} from "@/lib/types";

export async function getScreeningQuestions() {
  return apiFetch<ScreeningQuestion[]>("/candidate-screening/questions");
}

export async function createScreeningQuestion(
  data: string | { text: string; options?: Array<{ text: string; isCorrect?: boolean }> },
) {
  const payload = typeof data === "string" ? { text: data } : data;
  const question = await apiFetch<ScreeningQuestion>(
    "/candidate-screening/questions",
    { method: "POST", body: JSON.stringify(payload) },
  );
  revalidatePath("/admin/candidatas");
  return question;
}

export async function updateScreeningQuestion(
  id: string,
  data: {
    text?: string;
    active?: boolean;
    options?: Array<{ text: string; isCorrect?: boolean }>;
  },
) {
  const question = await apiFetch<ScreeningQuestion>(
    `/candidate-screening/questions/${id}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  revalidatePath("/admin/candidatas");
  return question;
}

export async function deleteScreeningQuestion(id: string) {
  await apiFetch<void>(`/candidate-screening/questions/${id}`, {
    method: "DELETE",
  });
  revalidatePath("/admin/candidatas");
}

export async function reorderScreeningQuestions(questionIds: string[]) {
  const questions = await apiFetch<ScreeningQuestion[]>(
    "/candidate-screening/questions/reorder",
    { method: "POST", body: JSON.stringify({ questionIds }) },
  );
  revalidatePath("/admin/candidatas");
  return questions;
}

export async function getCandidateScreenings(status?: CandidateScreeningStatus) {
  const query = status ? `?status=${status}` : "";
  return apiFetch<CandidateScreening[]>(`/candidate-screening${query}`);
}

export async function getCandidateScreening(id: string) {
  return apiFetch<CandidateScreening>(`/candidate-screening/${id}`);
}

export async function createCandidateScreening(data: {
  candidateName: string;
  candidatePhone?: string;
  questionIds: string[];
}) {
  const screening = await apiFetch<CandidateScreening>("/candidate-screening", {
    method: "POST",
    body: JSON.stringify(data),
  });
  revalidatePath("/admin/candidatas");
  return screening;
}

export async function promoteCandidateScreening(id: string, employeeId: string) {
  const screening = await apiFetch<CandidateScreening>(
    `/candidate-screening/${id}/promote`,
    { method: "PATCH", body: JSON.stringify({ employeeId }) },
  );
  revalidatePath("/admin/candidatas");
  revalidatePath(`/admin/candidatas/${id}`);
  return screening;
}
