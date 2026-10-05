import { ArrowLeft, Bot, ClipboardList, Loader2, UserRound } from "lucide-react";
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
    <header className="flex min-h-16 items-center gap-3 border-b border-zinc-800 bg-[#070707] px-3 py-2 sm:px-4">
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 md:hidden"
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
          {conversation.employeeName} · {conversation.service.estado.replaceAll("_", " ")}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenService}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:border-[#C5A55A] hover:text-[#C5A55A] xl:hidden"
        aria-label="Ver servicio"
      >
        <ClipboardList size={16} />
      </button>
      <button
        type="button"
        onClick={onToggleMode}
        disabled={changingMode}
        className={`hidden h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-[10px] font-bold uppercase tracking-[0.08em] disabled:opacity-50 sm:flex ${
          human
            ? "border border-zinc-700 text-zinc-300 hover:border-[#C5A55A]"
            : "bg-[#C5A55A] text-black hover:bg-[#d8b769]"
        }`}
      >
        {changingMode ? <Loader2 size={14} className="animate-spin" /> : null}
        {human ? "Devolver a IA" : "Tomar conversacion"}
      </button>
    </header>
  );
}
