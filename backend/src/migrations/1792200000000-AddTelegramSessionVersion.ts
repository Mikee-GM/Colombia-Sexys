import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contador de version para las sesiones de Telegram.
 *
 * Telegram entrega los updates en paralelo, asi que dos mensajes del mismo
 * cliente pueden estar dentro del bot a la vez. El almacen de sesiones escribia
 * el objeto entero al terminar cada update, de modo que el segundo en acabar
 * borraba lo que habia guardado el primero. Con esta columna la escritura es
 * condicional y el conflicto se detecta en vez de pasar desapercibido.
 */
export class AddTelegramSessionVersion1792200000000 implements MigrationInterface {
  name = 'AddTelegramSessionVersion1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.telegram_sessions
         ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.telegram_sessions DROP COLUMN IF EXISTS version`,
    );
  }
}
