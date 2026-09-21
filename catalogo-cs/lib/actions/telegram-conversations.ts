'use server';

import { apiFetch } from '@/lib/api-server';

export interface UnlinkedSession {
  bookingSessionId: string;
  clienteId: string;
  clienteNombre: string | null;
  clienteTelegramId: string;
  startedAt: string;
  lastAt: string;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  clienteId: string;
  servicioId: string | null;
  bookingSessionId: string | null;
  emisor: 'ia' | 'jefe' | 'cliente' | 'sistema';
  mensaje: string;
  iaActiva: boolean;
  enviadoAt: string;
}

export async function getUnlinkedSessions(limit = 100): Promise<UnlinkedSession[]> {
  try {
    const data = await apiFetch(`/telegram-conversations/unlinked-sessions?limit=${limit}`);
    return data as UnlinkedSession[];
  } catch (error) {
    console.error('Error fetching unlinked sessions:', error);
    return [];
  }
}

export async function getBookingSessionChat(bookingSessionId: string): Promise<ChatMessage[]> {
  try {
    const data = await apiFetch(`/telegram-conversations/session/${bookingSessionId}`);
    return data as ChatMessage[];
  } catch (error) {
    console.error('Error fetching booking session chat:', error);
    return [];
  }
}

export async function getServiceChat(serviceId: string, limit = 50): Promise<{ messages: ChatMessage[], nextCursor: string | null }> {
  try {
    const data = await apiFetch(`/telegram-conversations/service/${serviceId}?limit=${limit}`);
    return data as { messages: ChatMessage[], nextCursor: string | null };
  } catch (error) {
    console.error('Error fetching service chat:', error);
    return { messages: [], nextCursor: null };
  }
}

export async function sendAdminMessageToService(serviceId: string, message: string) {
  return await apiFetch(`/telegram-conversations/service/${serviceId}/admin-message`, {
    method: 'POST',
    body: JSON.stringify({ message, asIdentity: 'jefe' }),
  });
}

export async function sendAdminMessageToSession(bookingSessionId: string, message: string) {
  return await apiFetch(`/telegram-conversations/session/${bookingSessionId}/admin-message`, {
    method: 'POST',
    body: JSON.stringify({ message, asIdentity: 'jefe' }),
  });
}

export async function pauseAiForService(serviceId: string) {
  return await apiFetch(`/telegram-conversations/service/${serviceId}/pause-ai`, {
    method: 'POST',
  });
}

export async function resumeAiForService(serviceId: string) {
  return await apiFetch(`/telegram-conversations/service/${serviceId}/resume-ai`, {
    method: 'POST',
  });
}
