import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motivo del rechazo de una foto semanal.
 *
 * Hasta ahora rechazar era un boton mudo: la modelo veia "No aprobada" en su
 * portal sin saber si el problema era el encuadre, la luz o que salia otra
 * persona en la foto, asi que volvia a mandar la misma clase de foto y la
 * revision se repetia.
 *
 * Se guarda en la propia submission --y no en una tabla de notas-- porque el
 * motivo pertenece a la decision de revision: nace con ella, se muestra con
 * ella y se borra con ella.
 *
 * Nullable porque las revisiones ya registradas no tienen motivo, y porque
 * seguira siendo opcional: una aprobacion no lo lleva.
 */
export class AddWeeklyPhotoRejectionReason1793800000000 implements MigrationInterface {
  name = 'AddWeeklyPhotoRejectionReason1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "weekly_photo_submissions"
        ADD COLUMN IF NOT EXISTS "motivo_rechazo" text;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "weekly_photo_submissions"
        DROP COLUMN IF EXISTS "motivo_rechazo";
    `);
  }
}
