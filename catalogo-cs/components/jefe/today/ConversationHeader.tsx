import {
  ArrowLeft,
  Bot,
  ClipboardList,
  Loader2,
  UserRound,
} from "lucide-react";
import type { JefeConversation } from "./today-model";

export default function ConversationHeader({
  conversation,
  changingMode,
  onBack,
  onOpenService,
  onToggleMode,
}: {
  conversation: JefeConversation;
  changingMode: boolean;
  onBack: () => void;
  onOpenService: () => void;
  onToggleMode: () => void;
}) {
  const human = conversation.mode === "HUMAN_ACTIVE";
  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-[#070707] px-3 py-2 sm:px-4">
      <button
        type="button"
        onClick={onBack}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-[#C5A55A] lg:hidden"
        aria-label="Volver a conversaciones"
      >
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-zinc-100">
            {conversation.clientName}
          </h2>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${
              human
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-[#C5A55A]/10 text-[#E8D5A3]"
            }`}
          >
            {human ? <UserRound size={10} /> : <Bot size={10} />}
            {human ? "Humano" : "IA"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
          {conversation.employeeName} ·{" "}
          {conversation.service
            ? conversation.service.estado.replaceAll("_", " ")
            : "conversación previa al servicio"}
        </p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          onClick={onOpenService}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 text-xs font-semibold text-zinc-300 hover:border-[#C5A55A] hover:text-[#C5A55A] focus-visible:outline-2 focus-visible:outline-[#C5A55A] sm:flex-none xl:hidden"
          aria-label="Ver servicio"
        >
          <ClipboardList size={16} />
          Ver servicio
        </button>
        <button
          type="button"
          onClick={onToggleMode}
          disabled={changingMode}
          className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[10px] font-bold uppercase tracking-[0.08em] focus-visible:outline-2 focus-visible:outline-[#C5A55A] disabled:opacity-50 sm:flex-none ${
            human
              ? "border border-zinc-700 text-zinc-300 hover:border-[#C5A55A]"
              : "bg-[#C5A55A] text-black hover:bg-[#d8b769]"
          }`}
        >
          {changingMode ? <Loader2 size={14} className="animate-spin" /> : null}
          {human ? "Devolver a IA" : "Tomar conversacion"}
        </button>
      </div>
    </header>
  );
}
