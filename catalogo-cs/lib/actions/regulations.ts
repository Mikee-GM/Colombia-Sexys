"use server";

import { apiFetch } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

export interface RegulationOption {
  text: string;
  isCorrect: boolean;
}

export interface RegulationQuestion {
  text: string;
  options: RegulationOption[];
  groupKey?: string;
}

export interface PublishRegulationData {
  title: string;
  content: string;
  passingScore: number;
  targetRole: "empleada" | "chofer" | "jefe";
  questions: RegulationQuestion[];
  requireRetake?: boolean;
}

export async function publishRegulationAction(data: PublishRegulationData) {
  try {
    const result = await apiFetch("/employee-onboarding/regulation", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    
    // Revalidamos si hubiese alguna caché asociada a reglamentos
    revalidatePath("/admin/regulations");
    
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error publishing regulation:", error);
    return { success: false, error: error.message || "Failed to publish regulation" };
  }
}

export async function getCurrentRegulationAction(targetRole: "empleada" | "chofer" | "jefe") {
  try {
    const result = await apiFetch(`/employee-onboarding/regulation?targetRole=${targetRole}`, {
      method: "GET",
    });
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error fetching current regulation:", error);
    return { success: false, error: error.message || "Failed to fetch current regulation" };
  }
}

export async function getUserAttemptsAction(userId: string) {
  try {
    const result = await apiFetch(`/employee-onboarding/user-attempts/${userId}`, {
      method: "GET",
    });
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error fetching user attempts:", error);
    return { success: false, error: error.message || "Failed to fetch user attempts" };
  }
}

export async function getAttemptDetailAction(attemptId: string) {
  try {
    const result = await apiFetch(`/employee-onboarding/attempts/${attemptId}`, {
      method: "GET",
    });
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error fetching attempt detail:", error);
    return { success: false, error: error.message || "Failed to fetch attempt detail" };
  }
}
