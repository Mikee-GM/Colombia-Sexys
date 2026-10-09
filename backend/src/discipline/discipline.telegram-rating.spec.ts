import { DisciplineService } from './discipline.service';

describe('DisciplineService Telegram ratings', () => {
  const interaction = {
    serviceId: '11111111-1111-4111-8111-111111111111',
    tripId: null,
    clientId: '22222222-2222-4222-8222-222222222222',
    employeeId: '33333333-3333-4333-8333-333333333333',
    driverId: null,
    reporterType: 'client',
    reporterId: '22222222-2222-4222-8222-222222222222',
    subjectType: 'employee',
    subjectId: '33333333-3333-4333-8333-333333333333',
    bossId: '44444444-4444-4444-8444-444444444444',
    finishedAt: new Date(),
  };

  it('tolera el callback duplicado y conserva una sola calificación', async () => {
    const existing = { id: 'rating-1', stars: 2 };
    const ratings = {
      findOne: jest.fn().mockResolvedValue(existing),
    };
    const subject = Object.create(
      DisciplineService.prototype,
    ) as DisciplineService;
    Object.assign(subject as any, {
      ratings,
      resolveInteractionForPerson: jest.fn().mockResolvedValue(interaction),
      persistRating: jest.fn(),
    });

    await expect(
      subject.createClientRatingIdempotent(interaction.clientId, {
        direction: 'client_to_employee',
        interactionId: interaction.serviceId,
        stars: 2,
      }),
    ).resolves.toEqual({ rating: existing, created: false });

    expect((subject as any).persistRating).not.toHaveBeenCalled();
  });

  it('permite guardar de inmediato una nota baja sin comentario', async () => {
    const saved = { id: 'rating-2', stars: 1 };
    const ratings = { findOne: jest.fn().mockResolvedValue(null) };
    const subject = Object.create(
      DisciplineService.prototype,
    ) as DisciplineService;
    const persistRating = jest.fn().mockResolvedValue(saved);
    Object.assign(subject as any, {
      ratings,
      resolveInteractionForPerson: jest.fn().mockResolvedValue(interaction),
      persistRating,
    });

    await expect(
      subject.createClientRatingIdempotent(interaction.clientId, {
        direction: 'client_to_employee',
        interactionId: interaction.serviceId,
        stars: 1,
      }),
    ).resolves.toEqual({ rating: saved, created: true });
    expect(persistRating).toHaveBeenCalledWith(
      expect.objectContaining({ stars: 1 }),
      interaction,
      { allowMissingLowScoreComment: true },
    );
  });

  it('agrega como máximo un motivo opcional a la nota existente', async () => {
    const rating = {
      id: 'rating-3',
      stars: 3,
      comment: null,
    };
    const ratings = {
      findOne: jest.fn().mockResolvedValue(rating),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const subject = Object.create(
      DisciplineService.prototype,
    ) as DisciplineService;
    Object.assign(subject as any, { ratings });

    await subject.addClientRatingReason(
      interaction.clientId,
      interaction.serviceId,
      'puntualidad',
    );
    await subject.addClientRatingReason(
      interaction.clientId,
      interaction.serviceId,
      'otro',
    );

    expect(ratings.save).toHaveBeenCalledTimes(1);
    expect(rating.comment).toBe('Puntualidad');
  });
});
