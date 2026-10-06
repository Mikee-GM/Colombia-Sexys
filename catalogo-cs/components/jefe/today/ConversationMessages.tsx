import { Bot, CircleUserRound, ShieldCheck } from "lucide-react";
import { APP_LOCALE, APP_TIME_ZONE } from "@/lib/locale";
import type { ConversationMessage } from "@/lib/types";

const PRESENTATION = {
  cliente: {
    label: "Cliente",
    icon: CircleUserRound,
    wrapper: "justify-start",
    bubble: "rounded-tl-sm border border-zinc-800 bg-zinc-900 text-zinc-100",
  },
  ia: {
    label: "Asistente IA",
    icon: Bot,
    wrapper: "justify-end",
    bubble: "rounded-tr-sm border border-[#C5A55A]/25 bg-[#C5A55A]/10 text-[#F5F5F5]",
  },
  jefe: {
    label: "Jefe",
    icon: ShieldCheck,
    wrapper: "justify-end",
    bubble: "rounded-tr-sm bg-[#C5A55A] text-black",
  },
  sistema: {
    label: "Sistema",
    icon: ShieldCheck,
    wrapper: "justify-center",
    bubble: "border border-zinc-800 bg-black text-zinc-500",
  },
} as const;

export default function ConversationMessages({
  messages,
  endRef,
}: {
  messages: ConversationMessage[];
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-zinc-600">
        Todavia no hay mensajes en esta conversacion.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(197,165,90,0.04),_transparent_42%)] px-3 py-4 sm:px-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {messages.map((message) => {
          const style = PRESENTATION[message.emisor];
          const Icon = style.icon;
          return (
            <div key={message.id} className={`flex ${style.wrapper}`}>
              <div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 sm:max-w-[72%] ${style.bubble}`}>
                <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] opacity-60">
                  <Icon size={10} />
                  <span>{style.label}</span>
                  <time className="ml-auto pl-2 tabular-nums">
                    {new Date(message.enviadoAt).toLocaleTimeString(APP_LOCALE, {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: APP_TIME_ZONE,
                    })}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.mensaje}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
