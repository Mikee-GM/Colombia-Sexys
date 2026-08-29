"use server";

import { apiFetch } from "@/lib/api-server";
import type { ConversationMessage, Service } from "@/lib/types";

/**
 * Bitacora de chats para depuracion: lista de servicios sobre los que hay
 * conversacion registrada, para elegir cual revisar.
 *
 * Reutiliza el mismo listado que ya usa el resto del panel; no hace falta un
 * endpoint aparte solo para esta pantalla.
 */
export async function getServicesForChatReviewAction(): Promise<Service[]> {
  return apiFetch<Service[]>("/services?limit=300");
}

const MAX_PAGES = 20; // 20 x 100 = 2000 mensajes, muy por encima de cualquier flujo real.

/**
 * Trae la conversacion COMPLETA de un servicio, de principio a fin.
 *
 * El endpoint pagina hacia atras en el tiempo (cada `nextCursor` apunta a
 * mensajes mas viejos que los ya devueltos), asi que las paginas se guardan
 * en el orden en que llegan y se invierten al final para quedar en orden
 * cronologico real.
 */
export async function getFullServiceConversationAction(
  serviceId: string,
): Promise<ConversationMessage[]> {
  type Page = { messages: ConversationMessage[]; nextCursor: string | null };

  const pages: ConversationMessage[][] = [];
  let cursor: string | null = null;

  for (let i = 0; i < MAX_PAGES; i++) {
    const query: string = cursor
      ? `?limit=100&cursor=${encodeURIComponent(cursor)}`
      : "?limit=100";
    const result: Page = await apiFetch<Page>(
      `/telegram-conversations/service/${serviceId}${query}`,
    );
    pages.push(result.messages);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return pages.reverse().flat();
}
