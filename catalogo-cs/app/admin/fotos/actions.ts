"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api-server";

export type SubmissionStatus =
  | "pendiente"
  | "aprobada_publica"
  | "aprobada_privada"
  | "rechazada";

export type ReviewAction =
  | "aprobar_publica"
  | "aprobar_privada"
  | "rechazar";

export type PhotoSubmission = {
  id: string;
  empleadaId: string;
  url: string;
  estado: SubmissionStatus;
  semanaInicio: string;
  revisadoPorUserId: string | null;
  revisadoAt: string | null;
  createdAt: string;
  empleada?: {
    id: string;
    nombreArtistico: string;
    nombreReal: string;
    fotoPerfilUrl: string | null;
  } | null;
};

export async function getPhotoSubmissions(estado?: SubmissionStatus) {
  const query = estado ? `?estado=${estado}` : "";
  return apiFetch<PhotoSubmission[]>(`/weekly-content/submissions${query}`);
}

export async function reviewPhotoSubmission(id: string, action: ReviewAction) {
  const result = await apiFetch<PhotoSubmission>(
    `/weekly-content/submissions/${id}/review`,
    { method: "POST", body: JSON.stringify({ action }) },
  );
  revalidatePath("/admin/fotos");
  return result;
}
