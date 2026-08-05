import { TelegramBookingUpdate } from './telegram-booking.update';

describe('TelegramBookingUpdate receipt evidence', () => {
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn((value) =>
      Promise.resolve({
        id: value.id ?? 'validation',
        ...value,
      }),
    ),
  };
  const uploadService = {
    uploadEvidenceFromUrl: jest.fn(),
  };
  const update = Object.create(TelegramBookingUpdate.prototype);
  update.paymentReceiptValidationsRepository = repository;
  update.uploadService = uploadService;

  const ctx = {
    from: { id: 123 },
    telegram: {
      getFileLink: jest
        .fn()
        .mockResolvedValue(new URL('https://telegram.test/file.jpg')),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    uploadService.uploadEvidenceFromUrl.mockResolvedValue({
      url: 'https://media.example.com/evidencias/transferencias/image.jpg',
    });
  });

  it('crea el registro PROCESANDO después de almacenar la imagen', async () => {
    const result = await update.createReceiptEvidence(
      ctx,
      'telegram-file',
      'Cliente',
      'service-id',
    );

    expect(uploadService.uploadEvidenceFromUrl).toHaveBeenCalledWith({
      sourceUrl: 'https://telegram.test/file.jpg',
      folder: 'transferencias',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'PROCESANDO',
        imageUrl:
          'https://media.example.com/evidencias/transferencias/image.jpg',
        telegramFileId: 'telegram-file',
        servicioId: 'service-id',
      }),
    );
    expect(result.validation.estado).toBe('PROCESANDO');
  });

  it('conserva la URL y marca como rechazado un intento inválido', async () => {
    const validation = {
      id: 'validation',
      estado: 'PROCESANDO',
      imageUrl: 'https://media.example.com/image.jpg',
    };
    const result = await update.finishReceiptValidation(
      validation,
      { valid: false, monto: '100.00' },
      { valid: false, amount: 100, reason: 'Cuenta no autorizada' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        estado: 'RECHAZADO',
        imageUrl: 'https://media.example.com/image.jpg',
        observaciones: 'Cuenta no autorizada',
      }),
    );
  });
});
