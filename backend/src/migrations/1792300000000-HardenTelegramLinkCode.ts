import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Endurece la vinculacion de cuentas por Telegram.
 *
 * El comando `/vincular` localizaba la cuenta unicamente por un codigo de seis
 * digitos generado con `Math.random()`, sin limite de intentos: recorrer el
 * espacio entero era cuestion de tiempo, y como la busqueda no ataba el codigo
 * a nadie, servia cualquiera que estuviera vivo.
 *
 * Esta migracion aporta las dos piezas que necesitan estar en la base:
 *
 *  - `telegram_link_attempts`, el contador de fallos por chat.
 *  - Un indice unico parcial sobre el codigo vivo, para que dos usuarios no
 *    puedan compartirlo y la busqueda no devuelva uno arbitrario.
 *
 * Los codigos que hubiera pendientes se invalidan: estan guardados en claro y
 * con el formato anterior, asi que ya no casarian con la huella que se compara
 * ahora. Quien tuviera uno a medias pide otro en el panel.
 */
export class HardenTelegramLinkCode1792300000000 implements MigrationInterface {
  name = 'HardenTelegramLinkCode1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS public.telegram_link_attempts (
         telegram_chat_id varchar(64) PRIMARY KEY,
         attempts integer NOT NULL DEFAULT 0,
         blocked_until timestamp with time zone,
         updated_at timestamp with time zone NOT NULL DEFAULT now()
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_telegram_link_attempts_updated_at
         ON public.telegram_link_attempts (updated_at)`,
    );

    await queryRunner.query(
      `UPDATE public.usuarios
          SET telegram_verification_code = NULL,
              telegram_verification_expires_at = NULL
        WHERE telegram_verification_code IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_telegram_verification_code
         ON public.usuarios (telegram_verification_code)
       WHERE telegram_verification_code IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.uq_usuarios_telegram_verification_code`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.idx_telegram_link_attempts_updated_at`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS public.telegram_link_attempts`,
    );
  }
}
