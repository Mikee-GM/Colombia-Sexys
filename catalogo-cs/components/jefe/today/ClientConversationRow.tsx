import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { ClientConversationGroup } from "./client-inbox-model";

function lastActivity(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE });
  return day.format(date) === day.format(new Date())
    ? date.toLocaleTimeString(APP_LOCALE, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIME_ZONE,
      })
    : date.toLocaleDateString(APP_LOCALE, {
        day: "2-digit",
        month: "short",
        timeZone: APP_TIME_ZONE,
      });
}

export default function ClientConversationRow({
  group,
  selected,
  onSelect,
}: {
  group: ClientConversationGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      aria-label={`Abrir conversaciones de ${group.clientName}`}
      className={`grid min-h-[76px] w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-zinc-900 px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#C5A55A] ${
        selected
          ? "bg-[#C5A55A]/10 shadow-[inset_2px_0_0_#C5A55A]"
          : "bg-black hover:bg-zinc-950"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-zinc-100">
          {group.clientName}
        </span>
        <span className="mt-1 block truncate text-xs text-zinc-400">
          {group.latest.lastMessage}
        </span>
        <span className="mt-1.5 block text-[11px] text-zinc-500">
          {group.conversations.length === 1
            ? "1 conversación"
            : `${group.conversations.length} conversaciones`}
          {group.needsReply ? " · Por responder" : ""}
        </span>
      </span>
      <span className="flex flex-col items-end gap-2">
        <time
          dateTime={group.latest.lastAt}
          className="text-[10px] tabular-nums text-zinc-500"
        >
          {lastActivity(group.latest.lastAt)}
        </time>
        {group.unreadCount > 0 && (
          <span
            aria-label={`${group.unreadCount} mensajes sin leer`}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C5A55A] px-1 text-[10px] font-bold text-black"
          >
            {group.unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
