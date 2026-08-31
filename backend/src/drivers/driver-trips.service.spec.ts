import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DriverTripsService } from './driver-trips.service';
import { Viajes } from '../trips/entities/trip.entity';
import { Choferes } from './entities/driver.entity';
import { ServicesService } from '../services/services.service';
import { TelegramService } from '../telegram/telegram.service';

const CHOFER = 'chofer-1';
const AJENO = 'chofer-2';

function viaje(overrides: Partial<Viajes> = {}): Viajes {
  return {
    id: 'viaje-1',
    choferId: CHOFER,
    estado: 'aceptado',
    tipo: 'ida',
    servicio: {
      id: 'servicio-1',
      telegramThreadId: null,
      jefe: { grupoTelegramId: '-100', telegramChatId: '55' },
      empleada: {
        nombreArtistico: 'Valentina',
        usuario: { telegramChatId: '77' },
        jefe: null,
      },
      cliente: { nombreTelegram: 'Andrés' },
    },
    ...overrides,
  } as unknown as Viajes;
}

function montar(trip: Viajes | null) {
  const update = jest.fn(() => Promise.resolve({ affected: 1 }));
  const enviados: Array<{ chatId: string; texto: string }> = [];
  const sendMessage = jest.fn((chatId: string, texto: string) => {
    enviados.push({ chatId, texto });
    return Promise.resolve({ message_id: 4321 });
  });
  const startWaitTimeout = jest.fn();

  const service = new DriverTripsService(
    {
      findOne: jest.fn(() => Promise.resolve(trip)),
      update,
    } as unknown as Repository<Viajes>,
    {
      findOne: jest.fn(() =>
        Promise.resolve({
          id: CHOFER,
          nombre: 'Luis',
          telefono: '555',
          vehiculoPlaca: 'ABC-123',
        }),
      ),
    } as unknown as Repository<Choferes>,
    { sendMessage } as unknown as TelegramService,
    { startWaitTimeout } as unknown as ServicesService,
  );

  return { service, update, enviados, startWaitTimeout, sendMessage };
}

describe('DriverTripsService.marcarLlegada', () => {
  it('deja el viaje en llegado y avisa a la modelo y al jefe', async () => {
    const { service, update, enviados, startWaitTimeout } = montar(viaje());

    const resultado = await service.marcarLlegada('viaje-1', CHOFER);

    expect(resultado.estado).toBe('llegado');
    expect(update).toHaveBeenCalledWith('viaje-1', { estado: 'llegado' });
    // Uno al grupo del jefe y otro al chat de la modelo.
    expect(enviados.map((e) => e.chatId).sort()).toEqual(['-100', '77']);
    // El margen de espera de la modelo arranca con la llegada, no antes.
    expect(startWaitTimeout).toHaveBeenCalledWith('servicio-1', 600_000);
  });

  it('le manda a la modelo con que identificar el coche', async () => {
    const { service, enviados } = montar(viaje());

    await service.marcarLlegada('viaje-1', CHOFER);

    const paraLaModelo = enviados.find((e) => e.chatId === '77');
    expect(paraLaModelo?.texto).toContain('Luis');
    expect(paraLaModelo?.texto).toContain('ABC-123');
  });

  it('no deja que un chofer toque el viaje de otro', async () => {
    const { service, update } = montar(viaje());

    await expect(service.marcarLlegada('viaje-1', AJENO)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza la llegada si el viaje no venia aceptado', async () => {
    // Sin esto, tocar dos veces el boton --o tocarlo desde el chat y desde el
    // portal a la vez-- volveria a avisar a la modelo de una llegada ya dada.
    const { service, update } = montar(viaje({ estado: 'en_curso' }));

    await expect(service.marcarLlegada('viaje-1', CHOFER)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('un fallo de Telegram no deshace la llegada', async () => {
    const { service, update } = montar(viaje());
    // El chofer ya esta fisicamente alli: el viaje avanza igual.
    (service as unknown as { telegram: { sendMessage: jest.Mock } }).telegram.sendMessage.mockRejectedValue(
      new Error('Telegram caido'),
    );

    const resultado = await service.marcarLlegada('viaje-1', CHOFER);

    expect(resultado.estado).toBe('llegado');
    expect(update).toHaveBeenCalledWith('viaje-1', { estado: 'llegado' });
  });
});
