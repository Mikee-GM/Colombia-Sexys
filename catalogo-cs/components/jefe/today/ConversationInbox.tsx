import { Search } from "lucide-react";
import AllOperationsRadar from "./AllOperationsRadar";
import EmployeeOperationSections from "./EmployeeOperationSections";
import type { OperationSection } from "./today-model";

export default function ConversationInbox({
  sections,
  radar,
  title,
  total,
  search,
  selectedId,
  onSearch,
  onSelect,
}: {
  sections: OperationSection[];
  radar: boolean;
  title: string;
  total: number;
  search: string;
  selectedId: string | null;
  onSearch: (value: string) => void;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-black" aria-label="Conversaciones">
      <header className="border-b border-zinc-800 px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C5A55A]">
              Bandeja
            </p>
            <h1 className="font-heading text-2xl font-semibold text-white">
              {title}
            </h1>
          </div>
          <span className="text-xs tabular-nums text-zinc-500">{total}</span>
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 focus-within:border-[#C5A55A]/70">
          <Search size={15} className="shrink-0 text-zinc-600" />
          <span className="sr-only">Buscar conversaciones</span>
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Cliente, empleada o mensaje"
            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
          />
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.length > 0 ? (
          radar ? (
            <AllOperationsRadar
              sections={sections}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ) : (
            <EmployeeOperationSections
              sections={sections}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-zinc-300">
              No hay operaciones en esta vista
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              Solo aparecen conversaciones y servicios autorizados para tu
              equipo.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
