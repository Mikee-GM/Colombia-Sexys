import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pases de un solo uso para saltar del bot al panel web.
 *
 * Operar un servicio manual o corregir un dato desde Telegram es lento; el
 * panel lo hace en dos clics. Lo que frenaba el salto era volver a teclear
 * usuario y contrasena cada vez, en un telefono, para una sesion que ya estaba
 * probada por la vinculacion del chat.
 *
 * La tabla guarda solo la huella del pase, su caducidad y el momento en que se
 * consumio. No se reutiliza `usuarios.telegram_verification_code` porque ese
 * codigo es para vincular la cuenta y es de seis digitos: un pase que abre
 * sesion necesita mas entropia y poder convivir con varios vigentes a la vez.
 */
export class CreatePanelAccessTokens1792900000000 implements MigrationInterface {
  name = 'CreatePanelAccessTokens1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS public.panel_access_tokens (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "user_id" uuid NOT NULL,
         "token_hash" character(64) NOT NULL,
         "chat_id" character varying(64),
         "redirect_path" character varying(300),
         "expires_at" timestamp with time zone NOT NULL,
         "used_at" timestamp with time zone,
         "created_at" timestamp with time zone NOT NULL DEFAULT now(),
         CONSTRAINT "PK_panel_access_tokens" PRIMARY KEY ("id"),
         CONSTRAINT "FK_panel_access_tokens_user"
           FOREIGN KEY ("user_id") REFERENCES public.usuarios("id") ON DELETE CASCADE
       )`,
    );

    // La busqueda al canjear es por huella, y el unico impide colisiones.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_panel_access_tokens_token_hash"
         ON public.panel_access_tokens ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_panel_access_tokens_user_id"
         ON public.panel_access_tokens ("user_id")`,
    );
    // Para la limpieza periodica de pases caducados o ya usados.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_panel_access_tokens_expires_at"
         ON public.panel_access_tokens ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.panel_access_tokens`);
  }
}
