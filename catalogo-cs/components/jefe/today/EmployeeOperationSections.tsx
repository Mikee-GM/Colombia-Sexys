import ConversationRow from "./ConversationRow";
import type { OperationSection } from "./today-model";

export default function EmployeeOperationSections({
  sections,
  selectedId,
  showEmployee = false,
  onSelect,
}: {
  sections: OperationSection[];
  selectedId: string | null;
  showEmployee?: boolean;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <div>
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`operation-${section.id}`}>
          <div className="sticky top-0 z-10 flex h-8 items-center justify-between border-y border-zinc-900 bg-[#070707]/95 px-3 backdrop-blur">
            <h3
              id={`operation-${section.id}`}
              className="text-[9px] font-semibold uppercase tracking-[0.17em] text-zinc-500"
            >
              {section.label}
            </h3>
            <span className="text-[9px] tabular-nums text-zinc-700">
              {section.conversations.length}
            </span>
          </div>
          {section.conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              selected={conversation.id === selectedId}
              showEmployee={showEmployee}
              onSelect={() => onSelect(conversation.id)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
