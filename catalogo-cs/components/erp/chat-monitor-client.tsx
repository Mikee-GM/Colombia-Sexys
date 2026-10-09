"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Bot,
  User,
  Send,
  PauseCircle,
  PlayCircle,
  Loader2,
  Search,
} from "lucide-react";
import {
  getRecentChats,
  getClientChatHistory,
  sendAdminMessageToClient,
  toggleAiForClient,
  type RecentChat,
  type ChatMessage,
} from "@/lib/actions/telegram-conversations";
import ChatMonitorServicePanel from "./chat-monitor-service-panel";

export default function ChatMonitorClient() {
  const [chats, setChats] = useState<RecentChat[]>([]);
  const [activeChat, setActiveChat] = useState<RecentChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchChats = useCallback(async () => {
    try {
      const data = await getRecentChats(100, search);
      setChats(data);
      // Actualizamos activeChat si los datos cambiaron y ya teníamos uno seleccionado
      setActiveChat((current) =>
        current
          ? (data.find((chat) => chat.clienteId === current.clienteId) ??
            current)
          : null,
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchChats();
    const interval = setInterval(fetchChats, 10000); // Polling cada 10s
    return () => clearInterval(interval);
  }, [fetchChats]);

  const loadChatHistory = useCallback(async (clientId: string) => {
    const msgs = await getClientChatHistory(clientId);
    setMessages(msgs);
  }, []);

  const selectChat = async (chat: RecentChat) => {
    setActiveChat(chat);
    setMessages([]); // clean
    await loadChatHistory(chat.clienteId);
  };

  // Recarga periódica del chat activo
  useEffect(() => {
    if (!activeChat?.clienteId) return;
    const interval = setInterval(() => {
      loadChatHistory(activeChat.clienteId);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeChat?.clienteId, loadChatHistory]);

  useEffect(() => {
    const source = new EventSource("/api/realtime/sse", {
      withCredentials: true,
    });
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (
          payload.type !== "chat_message" &&
          payload.type !== "conversation_mode_changed"
        ) {
          return;
        }
        void fetchChats();
        if (activeChat?.clienteId) {
          void loadChatHistory(activeChat.clienteId);
        }
      } catch {
        // El polling periódico reconcilia si llega un evento incompleto.
      }
    };
    return () => source.close();
  }, [activeChat?.clienteId, fetchChats, loadChatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !activeChat) return;

    setIsSending(true);
    try {
      await sendAdminMessageToClient(activeChat.clienteId, inputText);
      setInputText("");
      await loadChatHistory(activeChat.clienteId);
      await fetchChats();
    } catch (err) {
      console.error("Error al enviar:", err);
      alert("Error al enviar mensaje");
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleAi = async (currentIaActiva: boolean) => {
    if (!activeChat) return;
    setIsTogglingAi(true);
    try {
      const newIaActiva = !currentIaActiva;
      await toggleAiForClient(activeChat.clienteId, newIaActiva);
      await loadChatHistory(activeChat.clienteId);
      await fetchChats();
    } catch (err) {
      console.error("Error al cambiar IA:", err);
      alert("Error al cambiar estado de IA");
    } finally {
      setIsTogglingAi(false);
    }
  };

  // Determinamos si la IA está activa leyendo el último mensaje
  const isIaActiva =
    messages.length > 0
      ? messages[messages.length - 1].iaActiva
      : activeChat?.mode !== "HUMAN_ACTIVE";

  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-[24rem] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50">
      {/* Sidebar: Lista de Sesiones */}
      <div
        className={`${activeChat ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-r border-zinc-800 bg-zinc-900/50 md:w-[320px] md:min-w-[280px]`}
      >
        <div className="p-4 border-b border-zinc-800 bg-zinc-900">
          <h2 className="font-medium text-zinc-200">Chats Recientes</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Todos los clientes que interactúan con el bot
          </p>
          <label className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-700 bg-black/40 px-3 py-2">
            <Search size={14} className="text-zinc-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente o Telegram"
              className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && chats.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-sm">
              Cargando chats...
            </div>
          ) : chats.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-sm">
              No hay chats recientes
            </div>
          ) : (
            chats.map((c) => (
              <button
                key={c.clienteId}
                onClick={() => selectChat(c)}
                className={`w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between ${
                  activeChat?.clienteId === c.clienteId
                    ? "bg-zinc-800 border-l-2 border-indigo-500"
                    : "hover:bg-zinc-800/50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-zinc-200">
                    {c.clienteNombre || "Cliente Anónimo"}
                  </div>
                  <div className="mt-1 truncate text-xs text-zinc-500">
                    {c.lastMessage}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
                    <span>{new Date(c.lastAt).toLocaleTimeString()}</span>
                    <span
                      className={
                        c.mode === "AI_ACTIVE"
                          ? "text-indigo-400"
                          : "text-emerald-400"
                      }
                    >
                      {c.mode === "AI_ACTIVE" ? "IA" : "HUMANO"}
                    </span>
                  </div>
                </div>
                <div className="bg-zinc-800 text-xs px-2 py-1 rounded-full text-zinc-400">
                  {c.messageCount} msgs
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div
        className={`${activeChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-black/40`}
      >
        {activeChat ? (
          <>
            {/* Header del Chat */}
            <div className="h-16 px-6 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveChat(null)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 md:hidden"
                  aria-label="Volver a conversaciones"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="h-10 w-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                  <User size={18} />
                </div>
                <div>
                  <div className="font-medium text-zinc-200">
                    {activeChat.clienteNombre || "Cliente Anónimo"}
                  </div>
                  <div className="text-xs text-zinc-400">
                    ID Telegram: {activeChat.clienteTelegramId}
                  </div>
                  {activeChat.employeeName && (
                    <div className="text-[10px] text-zinc-500">
                      {activeChat.employeeName} ·{" "}
                      {activeChat.serviceState?.replaceAll("_", " ")}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isIaActiva ? (
                  <button
                    onClick={() => handleToggleAi(true)}
                    disabled={isTogglingAi}
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                  >
                    {isTogglingAi ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <PauseCircle size={14} />
                    )}{" "}
                    Pausar Bot
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggleAi(false)}
                    disabled={isTogglingAi}
                    className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                  >
                    {isTogglingAi ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <PlayCircle size={14} />
                    )}{" "}
                    Reanudar IA
                  </button>
                )}
              </div>
            </div>

            {/* Area de Mensajes */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-zinc-500 text-sm">
                  Cargando mensajes...
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine =
                    msg.emisor === "jefe" ||
                    msg.emisor === "sistema" ||
                    msg.emisor === "ia";
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                          msg.emisor === "cliente"
                            ? "bg-zinc-800 text-zinc-200 rounded-tl-none"
                            : msg.emisor === "ia"
                              ? "bg-indigo-600 text-white rounded-tr-none"
                              : "bg-emerald-600 text-white rounded-tr-none"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] opacity-70">
                          {msg.emisor === "ia" && <Bot size={10} />}
                          {msg.emisor === "jefe" && <User size={10} />}
                          <span className="uppercase font-semibold tracking-wider">
                            {msg.emisor}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(msg.enviadoAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {msg.mensaje}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input de Mensaje */}
            <div className="p-4 bg-zinc-900 border-t border-zinc-800">
              <div className="flex gap-2 max-w-4xl mx-auto relative">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    !isIaActiva
                      ? "Escribe un mensaje como Administrador..."
                      : "Pausa la IA para hablar con el cliente..."
                  }
                  className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
                  disabled={isSending || isIaActiva}
                />
                <button
                  onClick={handleSend}
                  disabled={isSending || !inputText.trim() || isIaActiva}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
              {isIaActiva && (
                <p className="text-xs text-amber-500/80 mt-2 text-center">
                  Debes pausar la IA antes de poder enviar mensajes al cliente.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center flex-col text-zinc-500">
            <div className="h-16 w-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4 border border-zinc-800">
              <Bot size={24} className="text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-400">
              Selecciona un chat
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              Para ver el historial y responder
            </p>
          </div>
        )}
      </div>

      {/* Right Sidebar: Service Context */}
      <div className="hidden w-[320px] border-l border-zinc-800 bg-zinc-900/50 xl:block">
        <ChatMonitorServicePanel activeChat={activeChat} />
      </div>
    </div>
  );
}
