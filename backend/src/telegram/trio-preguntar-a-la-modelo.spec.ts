import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * El camino de una peticion de trio, de punta a punta.
 *
 * El jefe solo podia confirmar por su cuenta: o se comprometia a una modelo sin
 * preguntarle, o dejaba la peticion parada y el cliente se quedaba esperando un
 * aviso que no iba a llegar. Ahora puede preguntarle, ella contesta desde su
 * chat, y esa respuesta vuelve al cliente y a la IA.
 */
describe('TelegramBookingUpdate: preguntarle a la compañera por el trio', () => {
  let update: any;
  let sessionEntity: any;
  let bot: any;

  const principal = {
    id: 'emp-principal',
    nombreArtistico: 'Isabella',
    precioBaseHora: 3000,
    jefeId: 'jefe-1',
    jefe: { id: 'jefe-1', telegramChatId: '111', grupoTelegramId: null },
    usuario: { telegramChatId: '900' },
  };

  const companera = {
    id: 'emp-companera',
    nombreArtistico: 'Camila',
    precioBaseHora: 2500,
    usuario: { telegramChatId: '555' },
  };

  beforeEach(() => {
    bot = {
      telegram: {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      },
    };
    sessionEntity = {
      key: '777:777',
      data: {
        empleadaId: 'emp-principal',
        bookingSessionId: 'draft-1',
        trioStatus: 'pending_boss',
        chatHistory: [],
      },
    };

    update = Object.create(TelegramBookingUpdate.prototype);
    update.bot = bot;
    update.logger = { error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    update.telegramSessionRepository = {
      findOne: jest.fn().mockResolvedValue(sessionEntity),
      save: jest.fn().mockResolvedValue(sessionEntity),
    };
    update.clientesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'cli-1' }),
    };
    update.conversationsRepository = {
      create: jest.fn((v: unknown) => v),
      save: jest.fn().mockResolvedValue(undefined),
    };
    update.empleadasRepository = { findOne: jest.fn() };
    update.usuariosRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ ...principal.jefe, enJornada: true }]),
      findOne: jest.fn(),
    };
    update.callbackGuard = { esRepetido: jest.fn().mockResolvedValue(false) };
  });

  describe('la pregunta que se le manda', () => {
    it('le llega con los dos botones y la tarifa de las dos', async () => {
      const entregada = await update.preguntarleALaModeloPorElTrio(
        '777:777',
        principal,
        companera,
      );

      expect(entregada).toBe(true);
      const [chatId, texto, opciones] = bot.telegram.sendMessage.mock.calls[0];
      expect(chatId).toBe('555');
      expect(texto).toContain('Isabella');
      expect(texto).toContain('5500');
      const botones = opciones.reply_markup.inline_keyboard[0];
      expect(botones[0].callback_data).toBe(
        'trio_emp:yes:777:777:emp-companera',
      );
      expect(botones[1].callback_data).toBe(
        'trio_emp:no:777:777:emp-companera',
      );
    });

    /*
     * Sin chat vinculado no hay a quien preguntar. Se devuelve false para que
     * quien pregunto lo sepa y decida: si se diera por preguntada, nadie
     * contestaria nunca y el cliente esperaria para siempre.
     */
    it('avisa de que no se pudo entregar si no tiene chat', async () => {
      const entregada = await update.preguntarleALaModeloPorElTrio(
        '777:777',
        principal,
        { ...companera, usuario: { telegramChatId: null } },
      );

      expect(entregada).toBe(false);
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('cuando ella contesta', () => {
    const contexto = (accion: 'yes' | 'no') => ({
      match: ['', accion, '777:777', 'emp-companera'],
      from: { id: 555 },
      answerCbQuery: jest.fn(),
      editMessageText: jest.fn(),
    });

    beforeEach(() => {
      sessionEntity.data.trioStatus = 'pending_employee';
      update.empleadasRepository.findOne = jest.fn((opciones: any) =>
        Promise.resolve(
          opciones.where.id === 'emp-companera' ? companera : principal,
        ),
      );
    });

    it('un sí deja el trío confirmado y se lo dice al cliente', async () => {
      const ctx = contexto('yes');

      await update.onTrioEmployeeAnswer(ctx);

      expect(sessionEntity.data.trioStatus).toBe('confirmed');
      expect(sessionEntity.data.trioCombinedRatePerHour).toBe(5500);
      const alCliente = bot.telegram.sendMessage.mock.calls.find(
        (llamada: any[]) => llamada[0] === '777',
      );
      expect(alCliente[1]).toContain('Camila');
      // Lo que se le dijo al cliente entra en el historial: si no, la IA
      // volveria a ofrecerle el trio como si no hubiera pasado nada.
      expect(sessionEntity.data.chatHistory.at(-1).role).toBe('model');
    });

    it('un no lo deja rechazado y no deja media contratación colgando', async () => {
      const ctx = contexto('no');

      await update.onTrioEmployeeAnswer(ctx);

      expect(sessionEntity.data.trioStatus).toBe('rejected');
      expect(sessionEntity.data.trioSelectedEmployeeId).toBeUndefined();
      expect(sessionEntity.data.trioCombinedRatePerHour).toBeUndefined();
    });

    it('le devuelve la respuesta a quien preguntó', async () => {
      await update.onTrioEmployeeAnswer(contexto('yes'));

      const alJefe = bot.telegram.sendMessage.mock.calls.find(
        (llamada: any[]) => llamada[0] === '111',
      );
      expect(alJefe[1]).toContain('Camila');
    });

    /* El boton reenviado a otra persona no vale. */
    it('solo contesta la modelo por la que se preguntó', async () => {
      update.empleadasRepository.findOne = jest.fn().mockResolvedValue(null);
      const ctx = contexto('yes');

      await update.onTrioEmployeeAnswer(ctx);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        expect.stringContaining('no es para ti'),
        expect.anything(),
      );
      expect(sessionEntity.data.trioStatus).toBe('pending_employee');
    });

    /* El jefe se adelantó, o ella tocó dos veces: no se mueve nada. */
    it('no rehace nada si la petición ya se resolvió', async () => {
      sessionEntity.data.trioStatus = 'confirmed';
      const ctx = contexto('no');

      await update.onTrioEmployeeAnswer(ctx);

      expect(sessionEntity.data.trioStatus).toBe('confirmed');
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });
});
