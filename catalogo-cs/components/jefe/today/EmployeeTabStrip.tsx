"use client";

import { useEffect, useRef } from "react";
import type {
  EmployeeNavigationItem,
  EmployeeTabId,
} from "./today-model";

function statusLabel(item: EmployeeNavigationItem) {
  if (item.available === null) return null;
  return item.available ? "Disponible" : "No disponible";
}

export default function EmployeeTabStrip({
  items,
  selectedId,
  onSelect,
}: {
  items: EmployeeNavigationItem[];
  selectedId: EmployeeTabId;
  onSelect: (id: EmployeeTabId) => void;
}) {
  const buttons = useRef(new Map<EmployeeTabId, HTMLButtonElement>());

  useEffect(() => {
    buttons.current.get(selectedId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedId]);

  return (
    <nav
      className="relative z-20 shrink-0 border-b border-zinc-800 bg-[#070707]"
      aria-label="Navegacion por empleada"
    >
      <div
        className="no-scrollbar flex h-14 items-end gap-1 overflow-x-auto px-2 pt-2 sm:px-3"
        role="tablist"
        aria-label="Empleadas"
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          const availability = statusLabel(item);
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) buttons.current.set(item.id, node);
                else buttons.current.delete(item.id);
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(item.id)}
              className={`group relative flex h-11 shrink-0 items-center gap-2 rounded-t-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A55A]/70 sm:px-3.5 ${
                selected
                  ? "border-zinc-700 border-b-black bg-black text-white"
                  : "border-transparent text-zinc-500 hover:border-zinc-800 hover:bg-zinc-950 hover:text-zinc-200"
              }`}
            >
              {availability && (
                <>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.available ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{availability}. </span>
                </>
              )}
              <span className="max-w-32 truncate">{item.name}</span>
              {item.hasActiveService && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 ring-2 ring-amber-400/15"
                  title="Servicio activo"
                  aria-label="Servicio activo"
                />
              )}
              {item.attentionCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C5A55A]/15 px-1.5 text-[10px] tabular-nums text-[#E8D5A3]">
                  {item.attentionCount}
                </span>
              )}
              {selected && (
                <span className="absolute inset-x-2 -bottom-px h-px bg-[#C5A55A]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
