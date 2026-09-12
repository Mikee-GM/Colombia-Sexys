import { ForbiddenException } from '@nestjs/common';
import { TeamChannelService } from './team-channel.service';

/**
 * El canal es anonimo de un solo lado, y eso es lo que hay que sostener: el
 * jefe ve con quien habla, la modelo nunca ve quien le escribe. Si alguna vez
 * un nombre, un id o un chat se cuela hacia su lado, el canal deja de ser lo
 * que se prometio.
 */
describe('TeamChannelService', () => {
  const mensajes = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) =>
      Promise.resolve({
        id: 'msg-1',
        leidoAt: null,
        createdAt: new Date(),
        ...value,
      }),
    ),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const empleadas = { findOne: jest.fn(), find: jest.fn() };
  const usuarios = { find: jest.fn(), findOne: jest.fn(), update: jest.fn() };
  const telegram = { sendMessage: jest.fn() };
  const realtime = { emitToBoss: jest.fn(), emitToEmployee: jest.fn() };
  const notifications = { notificar: jest.fn().mockResolvedValue(1) };

  const service = Object.create(
    TeamChannelService.prototype,
  ) as TeamChannelService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    mensajes,
    empleadas,
    usuarios,
    telegram,
    realtime,
    notifications,
  });

  const empleada = {
    id: 'emp-1',
    usuarioId: 'user-emp',
    nombreArtistico: 'Ana',
    jefeId: 'jefe-1',
    jefeSecundarioId: null,
    usuario: { telegramChatId: '555', enJornada: true, jornadaMotivo: null },
  };

  const jefe = {
    id: 'jefe-1',
    rol: 'jefe',
    nombre: 'Carlos',
    apellido: 'Ruiz',
    telegramChatId: '111',
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    empleadas.findOne.mockResolvedValue(empleada);
    usuarios.find.mockResolvedValue([jefe]);
  });

  it('no le dice a la modelo quien le escribio', async () => {
    mensajes.find.mockResolvedValue([
      {
        id: 'msg-1',
        emisor: 'jefe',
        autorUserId: 'jefe-1',
        autor: jefe,
        cuerpo: '¿Puedes hoy a las ocho?',
        tipo: 'duda',
        leidoAt: null,
        createdAt: new Date(),
      },
    ]);

    const hilo = await service.listarParaEmpleada('user-emp');

    expect(hilo[0].emisor).toBe('coordinacion');
    expect(JSON.stringify(hilo)).not.toContain('jefe-1');
    expect(JSON.stringify(hilo)).not.toContain('Carlos');
  });

  it('el mensaje que le llega por el chat tampoco lleva nombre', async () => {
    await service.enviarDesdeJefe(jefe, 'emp-1', 'Avísame cuando salgas');

    const [chatId, texto] = telegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('555');
    expect(texto).toContain('Coordinación');
    expect(texto).not.toContain('Carlos');
  });

  it('al jefe si le dice con quien habla', async () => {
    const enviado = await service.enviarDesdeJefe(jefe, 'emp-1', 'Hola');
    expect(enviado.autor).toBe('Carlos Ruiz');
  });

  it('un jefe no puede abrir la conversacion de una modelo ajena', async () => {
    empleadas.findOne.mockResolvedValue({
      ...empleada,
      jefeId: 'otro-jefe',
      jefeSecundarioId: null,
    });

    await expect(
      service.enviarDesdeJefe(jefe, 'emp-1', 'Hola'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mensajes.save).not.toHaveBeenCalled();
  });

  /*
   * Lo que escribe la modelo tiene que llegar a alguien. Sin jefe asignado se
   * reparte entre los jefes activos: un mensaje que no llega a nadie la deja
   * esperando una respuesta que nunca iba a existir.
   */
  it('si no tiene jefe asignado, avisa a quien haya activo', async () => {
    empleadas.findOne.mockResolvedValue({
      ...empleada,
      jefeId: null,
      jefeSecundarioId: null,
    });
    usuarios.find.mockResolvedValue([{ id: 'admin-1', telegramChatId: '999' }]);
    mensajes.findOne.mockResolvedValue(null);

    await service.enviarDesdeEmpleada('user-emp', 'Tengo una duda');

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '999',
      expect.stringContaining('Ana'),
      expect.anything(),
    );
  });

  /*
   * La respuesta a "por que cerraste tu jornada" acaba en la ficha de la
   * persona, que es donde el panel la busca: el hilo guarda la conversacion,
   * pero nadie abre un chat para saber por que alguien no esta hoy.
   */
  it('guarda como motivo de jornada lo que contesta a esa pregunta', async () => {
    empleadas.findOne.mockResolvedValue({
      ...empleada,
      usuario: {
        ...empleada.usuario,
        id: 'user-emp',
        enJornada: false,
        jornadaMotivo: null,
      },
    });
    mensajes.findOne.mockResolvedValue({ tipo: 'jornada' });

    await service.enviarDesdeEmpleada('user-emp', 'Estoy enferma');

    expect(usuarios.update).toHaveBeenCalledWith(
      'user-emp',
      expect.objectContaining({ jornadaMotivo: 'Estoy enferma' }),
    );
  });

  it('una duda normal no toca el motivo de jornada', async () => {
    mensajes.findOne.mockResolvedValue(null);

    await service.enviarDesdeEmpleada('user-emp', '¿A qué hora es?');

    expect(usuarios.update).not.toHaveBeenCalled();
  });
});
