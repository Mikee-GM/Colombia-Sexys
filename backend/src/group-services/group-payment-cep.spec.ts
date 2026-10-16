import { GroupServicesService } from './group-services.service';
import { PaymentReceiptValidations } from '../services/entities/payment-receipt-validation.entity';

describe('GroupServicesService.registerPayment con transferencia', () => {
  let service: any;
  let manager: any;
  let receipt: any;

  beforeEach(() => {
    receipt = {
      id: 'receipt-1',
      servicioId: 'service-1',
      monto: 1200,
      pagoConfirmadoAt: null,
      pagoConfirmacionFuente: null,
    };
    manager = {
      findOneBy: jest
        .fn()
        .mockImplementation((entity: unknown) =>
          Promise.resolve(
            entity === PaymentReceiptValidations ? receipt : null,
          ),
        ),
    };
    service = Object.create(GroupServicesService.prototype);
    service.dataSource = {
      transaction: (run: (value: typeof manager) => Promise<unknown>) =>
        run(manager),
    };
    service.lockGroupService = jest.fn().mockResolvedValue({
      id: 'service-1',
      metodoPago: 'transferencia',
    });
  });

  it('rechaza registrar dinero sin comprobante', async () => {
    await expect(
      service.registerPayment('service-1', { amount: 1200 }, { id: 'boss-1' }),
    ).rejects.toThrow('CEP confirmado');
    expect(manager.findOneBy).not.toHaveBeenCalled();
  });

  it('rechaza una foto analizada sin confirmación del CEP', async () => {
    await expect(
      service.registerPayment(
        'service-1',
        { amount: 1200, receiptValidationId: 'receipt-1' },
        { id: 'boss-1' },
      ),
    ).rejects.toThrow('confirmación con CEP');
  });

  it('rechaza reutilizar el CEP de otro servicio', async () => {
    receipt.servicioId = 'service-2';
    receipt.pagoConfirmadoAt = new Date();
    receipt.pagoConfirmacionFuente = 'cep';
    await expect(
      service.registerPayment(
        'service-1',
        { amount: 1200, receiptValidationId: 'receipt-1' },
        { id: 'boss-1' },
      ),
    ).rejects.toThrow('otro servicio');
  });
});
