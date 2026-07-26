import { CreateGroupServices1785500000000 } from './1785500000000-CreateGroupServices';

describe('CreateGroupServices migration', () => {
  it('crea reservas, participantes, pagos y transporte múltiple con backfill', async () => {
    const statements: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
      }),
    };

    await new CreateGroupServices1785500000000().up(queryRunner as any);

    const sql = statements.join('\n');
    expect(sql).toContain('CREATE TABLE "group_service_requests"');
    expect(sql).toContain('CREATE TABLE "service_participants"');
    expect(sql).toContain('CREATE TABLE "service_payments"');
    expect(sql).toContain('CREATE TABLE "trip_passengers"');
    expect(sql).toContain('DROP INDEX IF EXISTS "viajes_servicio_id_tipo_key"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_liquidation_records_service_employee"',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "UQ_interaction_rating_service_direction_employee"',
    );
    expect(sql).toContain('INSERT INTO "service_participants"');
    expect(sql).toContain('trigger_actualizar_total_participantes');
    expect(sql).toContain('trigger_actualizar_total_pagos');
  });
});
