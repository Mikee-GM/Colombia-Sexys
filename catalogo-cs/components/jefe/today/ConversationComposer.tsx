import { Loader2, Send } from "lucide-react";

export default function ConversationComposer({
  value,
  humanControl,
  sending,
  changingMode,
  onChange,
  onSend,
  onTakeover,
}: {
  value: string;
  humanControl: boolean;
  sending: boolean;
  changingMode: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onTakeover: () => void;
}) {
  return (
    <div className="border-t border-zinc-800 bg-[#070707] p-3 sm:p-4">
      {!humanControl ? (
        <button
          type="button"
          onClick={onTakeover}
          disabled={changingMode}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#C5A55A] px-4 text-xs font-bold uppercase tracking-[0.1em] text-black disabled:opacity-50 sm:hidden"
        >
          {changingMode && <Loader2 size={15} className="animate-spin" />}
          Tomar conversacion
        </button>
      ) : (
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Escribe como jefe"
            disabled={sending}
            className="min-h-11 max-h-32 min-w-0 flex-1 resize-y rounded-xl border border-zinc-800 bg-black px-3.5 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#C5A55A] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !value.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C5A55A] text-black disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enviar mensaje"
          >
            {sending ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Send size={17} />
            )}
          </button>
        </div>
      )}
      {!humanControl && (
        <p className="mt-2 text-center text-[10px] text-zinc-600">
          La IA responde. Toma el control antes de escribir.
        </p>
      )}
    </div>
  );
}
