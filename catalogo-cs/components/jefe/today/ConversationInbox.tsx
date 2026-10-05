import { Search } from "lucide-react";
import EmployeeConversationGroup from "./EmployeeConversationGroup";
import type {
  EmployeeConversationGroup as Group,
  TodayFilter,
} from "./today-model";

const FILTERS: Array<{ value: TodayFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "unanswered", label: "Sin responder" },
  { value: "service", label: "Servicio" },
  { value: "in_progress", label: "En curso" },
];

export default function ConversationInbox({
  groups,
  total,
  search,
  filter,
  selectedId,
  onSearch,
  onFilter,
  onSelect,
}: {
  groups: Group[];
  total: number;
  search: string;
  filter: TodayFilter;
  selectedId: string | null;
  onSearch: (value: string) => void;
  onFilter: (value: TodayFilter) => void;
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
              Conversaciones
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
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1" aria-label="Filtros">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onFilter(item.value)}
              aria-pressed={filter === item.value}
              className={`h-8 shrink-0 rounded-full px-3 text-[10px] font-semibold transition-colors ${
                filter === item.value
                  ? "bg-[#C5A55A] text-black"
                  : "border border-zinc-800 text-zinc-500 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length > 0 ? (
          groups.map((group) => (
            <EmployeeConversationGroup
              key={group.employeeId}
              group={group}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-zinc-300">
              No hay conversaciones para este filtro
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              La bandeja muestra chats vinculados a servicios de tu equipo.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
