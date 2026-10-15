import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { JefeConversation } from "./today-model";

function contextLabel(conversation: JefeConversation) {
  const reference =
    conversation.service?.id ??
    conversation.bookingSessionId ??
    conversation.id;
  const date = new Date(conversation.service?.createdAt ?? conversation.lastAt);
  const dateLabel = Number.isFinite(date.getTime())
    ? date.toLocaleString(APP_LOCALE, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIME_ZONE,
      })
    : "";
  return [
    conversation.employeeName,
    `${conversation.service ? "Servicio" : "Chat"} ${reference.slice(-8)}`,
    dateLabel,
    conversation.unreadCount > 0 ? `${conversation.unreadCount} sin leer` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ClientConversationSelector({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: JefeConversation[];
  selectedId: string;
  onSelect: (conversationId: string) => void;
}) {
  if (conversations.length < 2) return null;
  return (
    <div className="shrink-0 border-b border-zinc-800 bg-black px-3 py-2 sm:px-4">
      <label className="block text-[11px] text-zinc-400">
        Conversación de este cliente
        <select
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
          className="mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-base text-zinc-100 focus-visible:outline-2 focus-visible:outline-[#C5A55A] sm:text-sm"
        >
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {contextLabel(conversation)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        Cada conversación conserva su historial y contexto por separado.
      </p>
    </div>
  );
}
