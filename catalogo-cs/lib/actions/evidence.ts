"use server";

import { apiFetch } from "@/lib/api-server";
import type { EvidencePage } from "@/lib/types";

export async function getEvidence(params?: {
  kind?: "uber" | "transferencia";
  status?: string;
  cursor?: string;
}): Promise<EvidencePage> {
  const query = new URLSearchParams({ limit: "50" });
  if (params?.kind) query.set("kind", params.kind);
  if (params?.status) query.set("status", params.status);
  if (params?.cursor) query.set("cursor", params.cursor);
  return apiFetch<EvidencePage>(`/services/evidence?${query.toString()}`);
}

export async function reviewGroupReceipt(
  validationId: string,
  decision: "aprobado" | "rechazado",
  reason?: string,
) {
  return apiFetch(`/group-services/receipts/${validationId}/review`, {
    method: "PATCH",
    body: JSON.stringify({ decision, reason }),
  });
}
