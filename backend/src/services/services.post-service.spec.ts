import { Servicios } from './entities/service.entity';
import { ServicesService } from './services.service';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';

describe('ServicesService post-service privacy', () => {
  it('envía una sola encuesta silenciosa sin datos operativos y agenda sus mensajes', async () => {
    const serviceRow: any = {
      id: 'service-1',
      estado: 'finalizado',
      horaFinServicio: new Date('2026-10-09T10:00:00.000Z'),
      bookingSessionId: 'booking-1',
      clienteId: 'client-1',
      empleadaId: 'employee-1',
      telegramResumenDefinitivoId: null,
      cliente: { telegramChatId: '2001' },
    };
    const services = {
      findOne: jest.fn(() => Promise.resolve(serviceRow)),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const execute = jest.fn().mockResolvedValue({ affected: 4 });
    const builder: any = {
      update: jest.fn(() => builder),
      set: jest.fn(() => builder),
      where: jest.fn(() => builder),
      andWhere: jest.fn(() => builder),
      execute,
    };
    const conversations = {
      createQueryBuilder: jest.fn(() => builder),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === Servicios ? services : conversations,
      ),
    };
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 901 });
    const subject = Object.create(ServicesService.prototype) as ServicesService;
    Object.assign(subject as any, {
      serviciosRepository: {
        manager: {
          transaction: (work: (value: any) => unknown) =>
            Promise.resolve(work(manager)),
        },
      },
      bot: { telegram: { sendMessage } },
    });

    await (subject as any).sendPostServiceSurvey('service-1');
    await (subject as any).sendPostServiceSurvey('service-1');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [, text, options] = sendMessage.mock.calls[0];
    expect(text).toBe(
      'Gracias por tu confianza 💕\n¿Cómo estuvo tu experiencia?',
    );
    expect(text).not.toMatch(
      /ubicaci[oó]n|habitaci[oó]n|duraci[oó]n|total|\$/i,
    );
    expect(options).toEqual(
      expect.objectContaining({ disable_notification: true }),
    );
    expect(options).not.toHaveProperty('parse_mode');
    expect(conversations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingSessionId: 'booking-1',
        servicioId: 'service-1',
        telegramMessageId: '901',
        telegramChatId: '2001',
        deleteStatus: 'PENDING',
      }),
    );
    expect(manager.getRepository).toHaveBeenCalledWith(ConversacionesTelegram);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('recupera la misma encuesta al finalizar el regreso sin enviar un recibo al cliente', async () => {
    const serviceRow: any = {
      id: 'service-1',
      estado: 'finalizado',
      clienteId: 'client-1',
      cliente: { telegramChatId: '2001' },
      empleada: null,
    };
    const sendMessage = jest.fn();
    const subject = Object.create(ServicesService.prototype) as ServicesService;
    const sendPostServiceSurvey = jest.fn().mockResolvedValue(undefined);
    Object.assign(subject as any, {
      serviciosRepository: {
        findOne: jest.fn().mockResolvedValue(serviceRow),
      },
      sendPostServiceSurvey,
      bot: { telegram: { sendMessage } },
      realtimeEventsService: { emitToClient: jest.fn() },
      logger: { warn: jest.fn() },
    });

    await subject.sendFinalReceiptAndAward('service-1');

    expect(sendPostServiceSurvey).toHaveBeenCalledTimes(1);
    expect(sendPostServiceSurvey).toHaveBeenCalledWith('service-1');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
