"use server";

import { apiFetch } from "@/lib/api-server";
import type { EvidencePage } from "@/lib/types";

export async function getEvidence(params?: {
  kind?: "uber" | "transferencia";
  status?: string;
  cursor?: string;
  employeeId?: string;
  /** Limites del periodo, en YYYY-MM-DD, como los maneja el corte semanal. */
  from?: string;
  to?: string;
  limit?: number;
}): Promise<EvidencePage> {
  const query = new URLSearchParams({ limit: String(params?.limit ?? 50) });
  if (params?.kind) query.set("kind", params.kind);
  if (params?.status) query.set("status", params.status);
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.employeeId) query.set("employeeId", params.employeeId);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  return apiFetch<EvidencePage>(`/services/evidence?${query.toString()}`);
}

/**
 * Comprobantes de transferencia de una empleada en un periodo.
 *
 * Los pide el corte: quien lo revisa necesita ver la captura del cobro junto a
 * la cifra, y hasta ahora tenia que ir a Evidencias y emparejarlas a mano por
 * fecha y monto.
 */
export async function getEmployeeTransferReceipts(
  employeeId: string,
  from: string,
  to: string,
): Promise<EvidencePage> {
  return getEvidence({ kind: "transferencia", employeeId, from, to, limit: 100 });
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
