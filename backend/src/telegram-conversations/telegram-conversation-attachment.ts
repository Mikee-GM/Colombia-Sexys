import type { Message } from 'telegraf/types';

export type ConversationAttachment =
  | { type: 'photo'; url: string; width?: number; height?: number }
  | {
      type: 'location';
      latitude: number;
      longitude: number;
      title?: string;
      address?: string;
    };

export type CapturedAttachment = {
  attachment: ConversationAttachment;
  photoFileId: string | null;
  text: string;
};

export function conversationPhotoPath(messageId: string): string {
  return `/api/telegram-conversations/messages/${encodeURIComponent(messageId)}/photo`;
}

/** Only Telegram's typed photo/location payloads are accepted, never a URL. */
export function extractConversationAttachment(
  message: Message | undefined,
  messageId: string,
): CapturedAttachment | null {
  if (!message) return null;
  if ('photo' in message && message.photo.length) {
    const photo = message.photo[message.photo.length - 1];
    if (!photo.file_id || photo.file_id.length > 2048) return null;
    return {
      attachment: {
        type: 'photo',
        url: conversationPhotoPath(messageId),
        width: photo.width,
        height: photo.height,
      },
      photoFileId: photo.file_id,
      text: message.caption?.trim() || 'Foto compartida',
    };
  }
  const location =
    'venue' in message
      ? message.venue.location
      : 'location' in message
        ? message.location
        : null;
  if (
    !location ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180
  ) {
    return null;
  }
  const venue = 'venue' in message ? message.venue : null;
  return {
    attachment: {
      type: 'location',
      latitude: location.latitude,
      longitude: location.longitude,
      ...(venue ? { title: venue.title, address: venue.address } : {}),
    },
    photoFileId: null,
    text: venue?.title || 'Ubicación compartida',
  };
}
