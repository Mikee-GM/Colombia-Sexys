import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import ConversationComposer from "./ConversationComposer";
import ConversationHeader from "./ConversationHeader";
import ConversationMessages from "./ConversationMessages";
import type { JefeConversation } from "./today-model";

export default function ConversationWorkspace({
  conversation,
  text,
  sending,
  changingMode,
  onTextChange,
  onSend,
  onToggleMode,
  onBack,
  onOpenService,
}: {
  conversation: JefeConversation | null;
  text: string;
  sending: boolean;
  changingMode: boolean;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onToggleMode: () => void;
  onBack: () => void;
  onOpenService: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation?.id, conversation?.messages.length]);

  if (!conversation) {
    return (
      <section className="hidden h-full min-h-0 flex-col items-center justify-center border-x border-zinc-800 bg-[#050505] px-8 text-center md:flex">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-800 bg-black text-zinc-600">
          <MessageCircle size={22} />
        </span>
        <h2 className="mt-4 font-heading text-2xl text-zinc-300">
          Selecciona una conversacion
        </h2>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-zinc-600">
          Veras el historial, el control IA o humano y el servicio relacionado.
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col border-zinc-800 bg-[#050505] md:border-x">
      <ConversationHeader
        conversation={conversation}
        changingMode={changingMode}
        onBack={onBack}
        onOpenService={onOpenService}
        onToggleMode={onToggleMode}
      />
      <ConversationMessages messages={conversation.messages} endRef={endRef} />
      <ConversationComposer
        value={text}
        humanControl={conversation.mode === "HUMAN_ACTIVE"}
        sending={sending}
        changingMode={changingMode}
        onChange={onTextChange}
        onSend={onSend}
        onTakeover={onToggleMode}
      />
    </section>
  );
}
