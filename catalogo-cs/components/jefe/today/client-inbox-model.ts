import { filterConversations, type JefeConversation } from "./today-model";

export type ClientConversationGroup = {
  id: string;
  clientName: string;
  conversations: JefeConversation[];
  latest: JefeConversation;
  matchingConversationId: string | null;
  unreadCount: number;
  needsReply: boolean;
};

function compareRecent(left: JefeConversation, right: JefeConversation) {
  const leftAt = Date.parse(left.lastAt) || 0;
  const rightAt = Date.parse(right.lastAt) || 0;
  return rightAt - leftAt || left.id.localeCompare(right.id);
}

/** Agrupa solo la presentación: cada historial y su destino siguen separados. */
export function buildClientConversationGroups(
  conversations: JefeConversation[],
  search = "",
): ClientConversationGroup[] {
  const grouped = new Map<string, JefeConversation[]>();
  for (const conversation of conversations) {
    // No unir registros incompletos ni clientes distintos que comparten nombre.
    const id = conversation.clientId
      ? `client:${conversation.clientId}`
      : `conversation:${conversation.id}`;
    const threads = grouped.get(id) ?? [];
    threads.push(conversation);
    grouped.set(id, threads);
  }

  return Array.from(grouped, ([id, threads]) => {
    const ordered = [...threads].sort(compareRecent);
    const matches = filterConversations(ordered, "all", search);
    if (matches.length === 0) return null;
    const latest = ordered[0];
    return {
      id,
      clientName: latest.clientName,
      conversations: ordered,
      latest,
      matchingConversationId: search.trim() ? matches[0].id : null,
      unreadCount: ordered.reduce(
        (total, thread) => total + thread.unreadCount,
        0,
      ),
      needsReply: ordered.some((thread) => thread.needsReply),
    } satisfies ClientConversationGroup;
  })
    .filter((group): group is ClientConversationGroup => group !== null)
    .sort((left, right) => compareRecent(left.latest, right.latest));
}

export function conversationForClient(
  group: ClientConversationGroup,
  rememberedId: string | null | undefined,
): string {
  if (group.matchingConversationId) return group.matchingConversationId;
  return group.conversations.some((thread) => thread.id === rememberedId)
    ? rememberedId!
    : group.latest.id;
}

export function reconcileConversationDrafts(
  drafts: Record<string, string>,
  previous: JefeConversation[],
  next: JefeConversation[],
): Record<string, string> {
  const nextIds = new Set(next.map((thread) => thread.id));
  let result = drafts;
  for (const source of previous) {
    if (
      nextIds.has(source.id) ||
      !source.bookingSessionId ||
      !Object.prototype.hasOwnProperty.call(drafts, source.id)
    ) continue;
    const sameContext = (thread: JefeConversation) =>
      thread.clientId === source.clientId &&
      thread.bookingSessionId === source.bookingSessionId;
    const replacements = next.filter(sameContext);
    // Nunca elegir entre destinos ambiguos ni sustituir un borrador existente.
    if (previous.filter(sameContext).length !== 1 || replacements.length !== 1) continue;
    const destinationId = replacements[0].id;
    if (Object.prototype.hasOwnProperty.call(result, destinationId)) continue;
    if (result === drafts) result = { ...drafts };
    result[destinationId] = drafts[source.id];
    delete result[source.id];
  }
  return result;
}
