import { Bot, UserRound } from "lucide-react";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { JefeConversation } from "./today-model";

function conversationTime(value: string) {
  const date = new Date(value);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
  }).format(new Date());
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
  }).format(date);
  if (day === today) {
    return date.toLocaleTimeString(APP_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: APP_TIME_ZONE,
    });
  }
  return date.toLocaleDateString(APP_LOCALE, {
    day: "2-digit",
    month: "short",
    timeZone: APP_TIME_ZONE,
  });
}

export default function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: JefeConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`grid min-h-[76px] w-full grid-cols-[40px_minmax(0,1fr)_auto] gap-3 border-b border-zinc-900 px-3 py-3 text-left transition-colors ${
        selected
          ? "bg-[#C5A55A]/10"
          : "bg-black hover:bg-zinc-950 focus-visible:bg-zinc-950"
      }`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-sm font-semibold text-[#E8D5A3]">
        {conversation.clientName.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-100">
            {conversation.clientName}
          </span>
          {conversation.needsReply && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C5A55A]" />
          )}
        </span>
        <span className="mt-1 block truncate text-xs text-zinc-500">
          {conversation.lastMessage}
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-zinc-600">
          <span className="flex items-center gap-1">
            {conversation.mode === "AI_ACTIVE" ? (
              <Bot size={11} />
            ) : (
              <UserRound size={11} />
            )}
            {conversation.mode === "AI_ACTIVE" ? "IA" : "Humano"}
          </span>
          <span>{conversation.service.estado.replaceAll("_", " ")}</span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-2">
        <time className="text-[10px] tabular-nums text-zinc-600">
          {conversationTime(conversation.lastAt)}
        </time>
        {conversation.unreadCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C5A55A] px-1 text-[10px] font-bold text-black">
            {conversation.unreadCount}
          </span>
        )}
      </span>
    </button>
  );
}
