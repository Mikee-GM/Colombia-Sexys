import { ServicesService } from './services.service';
import { PaymentReceiptValidations } from './entities/payment-receipt-validation.entity';
import { Servicios } from './entities/service.entity';
import { AuthorizedBankAccounts } from './entities/authorized-bank-account.entity';

describe('ServicesService.confirmReceiptWithCep', () => {
  const actor = { id: 'boss-1', rol: 'admin' } as any;
  const input = {
    claveRastreo: 'TEST123456',
    fechaTransferencia: '2026-10-16',
    bancoOrigen: 'Banco de prueba',
    cuentaDestinoId: 'account-1',
    monto: 1200,
  };
  let service: any;
  let receipt: any;
  let booking: any;
  let saveReceipt: jest.Mock;
  let saveService: jest.Mock;

  beforeEach(() => {
    receipt = {
      id: 'receipt-1',
      servicioId: 'service-1',
      estado: 'APROBADO',
      montoEsperado: 1200,
      tipoCobro: 'reserva',
    };
    booking = {
      id: 'service-1',
      estado: 'pendiente',
      serviceType: 'individual',
      metodoPago: 'transferencia',
      comprobantePendiente: true,
      cobroFinalPendiente: false,
    };
    saveReceipt = jest
      .fn()
      .mockImplementation((value) => Promise.resolve(value));
    saveService = jest
      .fn()
      .mockImplementation((value) => Promise.resolve(value));
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === PaymentReceiptValidations)
          return {
            findOne: jest.fn().mockResolvedValue(receipt),
            save: saveReceipt,
          };
        if (entity === Servicios)
          return {
            findOne: jest.fn().mockResolvedValue(booking),
            save: saveService,
          };
        if (entity === AuthorizedBankAccounts)
          return {
            findOneBy: jest.fn().mockResolvedValue({
              id: 'account-1',
              activa: true,
              banco: 'Banco destino',
              clabe: '000000000000000000',
            }),
          };
        throw new Error('Repositorio inesperado');
      },
    };
    service = Object.create(ServicesService.prototype);
    service.paymentReceiptValidationsRepository = {
      manager: {
        transaction: (run: (value: typeof manager) => unknown) =>
          Promise.resolve(run(manager)),
      },
    };
  });

  it('confirma con CEP, audita al jefe y levanta el pago pendiente', async () => {
    await service.confirmReceiptWithCep('receipt-1', input, actor);
    expect(receipt.pagoConfirmadoPorUserId).toBe(actor.id);
    expect(receipt.pagoConfirmacionFuente).toBe('cep');
    expect(receipt.pagoConfirmadoAt).toBeInstanceOf(Date);
    expect(booking.comprobantePendiente).toBe(false);
    expect(saveReceipt).toHaveBeenCalled();
    expect(saveService).toHaveBeenCalled();
  });

  it('no confirma un CEP por debajo del monto esperado', async () => {
    await expect(
      service.confirmReceiptWithCep(
        'receipt-1',
        { ...input, monto: 1000 },
        actor,
      ),
    ).rejects.toThrow('debe coincidir');
    expect(saveReceipt).not.toHaveBeenCalled();
    expect(booking.comprobantePendiente).toBe(true);
  });

  it('no permite confirmar si falta el monto esperado', async () => {
    receipt.montoEsperado = null;
    await expect(
      service.confirmReceiptWithCep('receipt-1', input, actor),
    ).rejects.toThrow('no tiene un monto esperado');
    expect(saveReceipt).not.toHaveBeenCalled();
    expect(booking.comprobantePendiente).toBe(true);
  });

  it('cierra la revisión de imagen al confirmar el CEP', async () => {
    receipt.estado = 'PENDIENTE_REVISION';
    await service.confirmReceiptWithCep('receipt-1', input, actor);
    expect(receipt.estado).toBe('APROBADO');
  });

  it('en el cobro final sólo quita la marca del cobro final', async () => {
    receipt.tipoCobro = 'final';
    booking.cobroFinalPendiente = true;
    await service.confirmReceiptWithCep('receipt-1', input, actor);
    expect(booking.cobroFinalPendiente).toBe(false);
    expect(booking.comprobantePendiente).toBe(true);
  });

  it('rechaza a un jefe ajeno al servicio', async () => {
    booking.jefeId = 'boss-2';
    await expect(
      service.confirmReceiptWithCep('receipt-1', input, {
        id: 'boss-1',
        rol: 'jefe',
      }),
    ).rejects.toThrow('No puedes gestionar este servicio');
    expect(saveReceipt).not.toHaveBeenCalled();
  });

  it('en grupo no inventa un pago; éste se registra después de comprobar el CEP', async () => {
    booking.serviceType = 'grupal';
    await service.confirmReceiptWithCep('receipt-1', input, actor);
    expect(saveService).not.toHaveBeenCalled();
    expect(booking.comprobantePendiente).toBe(true);
  });
});
