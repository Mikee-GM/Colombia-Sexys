import { ChevronDown } from "lucide-react";
import ConversationRow from "./ConversationRow";
import type { EmployeeConversationGroup as Group } from "./today-model";

export default function EmployeeConversationGroup({
  group,
  selectedId,
  onSelect,
}: {
  group: Group;
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <section aria-labelledby={`employee-${group.employeeId}`}>
      <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-y border-zinc-900 bg-[#070707]/95 px-3 backdrop-blur">
        <ChevronDown size={13} className="text-zinc-600" />
        <h3
          id={`employee-${group.employeeId}`}
          className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          {group.employeeName}
        </h3>
        <span className="text-[10px] tabular-nums text-zinc-600">
          {group.conversations.length}
        </span>
      </div>
      {group.conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          selected={conversation.id === selectedId}
          onSelect={() => onSelect(conversation.id)}
        />
      ))}
    </section>
  );
}
