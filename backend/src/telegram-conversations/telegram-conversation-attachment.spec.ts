import { extractConversationAttachment } from './telegram-conversation-attachment';

describe('extractConversationAttachment', () => {
  it('keeps only Telegram photo metadata and builds the authenticated local URL', () => {
    const result = extractConversationAttachment(
      {
        message_id: 7,
        date: 1,
        chat: { id: 1, type: 'private', first_name: 'QA' },
        photo: [
          { file_id: 'small', file_unique_id: 'a', width: 20, height: 20 },
          { file_id: 'large', file_unique_id: 'b', width: 640, height: 480 },
        ],
        caption: 'Referencia',
      },
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result).toEqual({
      attachment: {
        type: 'photo',
        url: '/api/telegram-conversations/messages/11111111-1111-4111-8111-111111111111/photo',
        width: 640,
        height: 480,
      },
      photoFileId: 'large',
      text: 'Referencia',
    });
  });

  it('captures zero coordinates and optional venue labels', () => {
    expect(
      extractConversationAttachment(
        {
          message_id: 8,
          date: 1,
          chat: { id: 1, type: 'private', first_name: 'QA' },
          location: { latitude: 0, longitude: 0 },
          venue: {
            location: { latitude: 0, longitude: 0 },
            title: 'Punto QA',
            address: 'Dirección QA',
          },
        },
        'message',
      ),
    ).toEqual({
      attachment: {
        type: 'location',
        latitude: 0,
        longitude: 0,
        title: 'Punto QA',
        address: 'Dirección QA',
      },
      photoFileId: null,
      text: 'Punto QA',
    });
  });

  it('rejects invalid coordinates and ordinary text', () => {
    expect(
      extractConversationAttachment(
        {
          message_id: 9,
          date: 1,
          chat: { id: 1, type: 'private', first_name: 'QA' },
          location: { latitude: 91, longitude: 0 },
        },
        'message',
      ),
    ).toBeNull();
    expect(
      extractConversationAttachment(
        {
          message_id: 10,
          date: 1,
          chat: { id: 1, type: 'private', first_name: 'QA' },
          text: 'hola',
        },
        'message',
      ),
    ).toBeNull();
  });
});
