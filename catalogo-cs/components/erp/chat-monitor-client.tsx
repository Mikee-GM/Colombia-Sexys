'use client';

import { useState, useEffect, useRef } from 'react';
import { Bot, User, Send, PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import { 
  getUnlinkedSessions, 
  getBookingSessionChat, 
  sendAdminMessageToSession,
  type UnlinkedSession,
  type ChatMessage
} from '@/lib/actions/telegram-conversations';

// NOTA: Para un prototipo rápido, sólo he incluido las sesiones huérfanas (unlinked).
// En una iteración posterior, agregaremos los chats de servicios concretados.

export default function ChatMonitorClient() {
  const [sessions, setSessions] = useState<UnlinkedSession[]>([]);
  const [activeSession, setActiveSession] = useState<UnlinkedSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchSessions = async () => {
    try {
      const data = await getUnlinkedSessions(50);
      setSessions(data);
      if (data.length > 0 && !activeSession) {
        // Podríamos auto-seleccionar el primero
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000); // Polling cada 10s
    return () => clearInterval(interval);
  }, []);

  const loadChat = async (session: UnlinkedSession) => {
    setActiveSession(session);
    setMessages([]); // clean
    const msgs = await getBookingSessionChat(session.bookingSessionId);
    setMessages(msgs);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !activeSession) return;
    
    setIsSending(true);
    try {
      await sendAdminMessageToSession(activeSession.bookingSessionId, inputText);
      setInputText('');
      // Recargar chat
      const msgs = await getBookingSessionChat(activeSession.bookingSessionId);
      setMessages(msgs);
    } catch (err) {
      console.error('Error al enviar:', err);
      alert('Error al enviar mensaje');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/50">
      {/* Sidebar: Lista de Sesiones */}
      <div className="w-1/3 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900">
          <h2 className="font-medium text-zinc-200">Chats sin concretar</h2>
          <p className="text-xs text-zinc-400 mt-1">Clientes interactuando con el bot</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && sessions.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-sm">Cargando chats...</div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-sm">No hay chats recientes</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.bookingSessionId}
                onClick={() => loadChat(s)}
                className={`w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between ${
                  activeSession?.bookingSessionId === s.bookingSessionId 
                    ? 'bg-zinc-800 border-l-2 border-indigo-500' 
                    : 'hover:bg-zinc-800/50'
                }`}
              >
                <div>
                  <div className="font-medium text-sm text-zinc-200">
                    {s.clienteNombre || 'Cliente Anónimo'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Último msg: {new Date(s.lastAt).toLocaleTimeString()}
                  </div>
                </div>
                <div className="bg-zinc-800 text-xs px-2 py-1 rounded-full text-zinc-400">
                  {s.messageCount} msgs
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative bg-black/40">
        {activeSession ? (
          <>
            {/* Header del Chat */}
            <div className="h-16 px-6 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                  <User size={18} />
                </div>
                <div>
                  <div className="font-medium text-zinc-200">
                    {activeSession.clienteNombre || 'Cliente Anónimo'}
                  </div>
                  <div className="text-xs text-zinc-400">
                    ID Telegram: {activeSession.clienteTelegramId}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {messages.length > 0 && messages[messages.length - 1].iaActiva ? (
                  <button className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 px-3 py-1.5 rounded-full transition-colors">
                    <PauseCircle size={14} /> Pausar Bot
                  </button>
                ) : (
                  <button className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 px-3 py-1.5 rounded-full transition-colors">
                    <PlayCircle size={14} /> IA Pausada
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
                  const isMine = msg.emisor === 'jefe' || msg.emisor === 'sistema' || msg.emisor === 'ia';
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        msg.emisor === 'cliente' 
                          ? 'bg-zinc-800 text-zinc-200 rounded-tl-none' 
                          : msg.emisor === 'ia'
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-emerald-600 text-white rounded-tr-none'
                      }`}>
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] opacity-70">
                          {msg.emisor === 'ia' && <Bot size={10} />}
                          {msg.emisor === 'jefe' && <User size={10} />}
                          <span className="uppercase font-semibold tracking-wider">
                            {msg.emisor}
                          </span>
                          <span>•</span>
                          <span>{new Date(msg.enviadoAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.mensaje}</p>
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
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Escribe un mensaje como Administrador..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  disabled={isSending}
                />
                <button
                  onClick={handleSend}
                  disabled={isSending || !inputText.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center flex-col text-zinc-500">
            <div className="h-16 w-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4 border border-zinc-800">
              <Bot size={24} className="text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-400">Selecciona un chat</p>
            <p className="text-xs text-zinc-600 mt-1">Para ver el historial y responder</p>
          </div>
        )}
      </div>
    </div>
  );
}
