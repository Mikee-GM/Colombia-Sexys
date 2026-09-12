import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La version de quien fue reportado.
 *
 * Un reporte de conducta se resolvia con un solo relato delante: el de quien lo
 * levanto. La persona señalada se enteraba --si acaso-- cuando ya habia una
 * sancion encima, y lo unico que podia apelar era una calificacion, nunca el
 * reporte. Aqui se guarda su descargo, para que quien decide lea las dos
 * versiones antes de cerrar.
 *
 * Vale para las dos partes que pueden ser señaladas, modelo y chofer: el
 * reporte no distingue, y la columna tampoco.
 */
export class AddReportSubjectStatement1793400000000 implements MigrationInterface {
  name = 'AddReportSubjectStatement1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.conduct_reports
         ADD COLUMN IF NOT EXISTS "subject_statement" text,
         ADD COLUMN IF NOT EXISTS "subject_statement_at" timestamp with time zone`,
    );

    /*
     * La bandeja de administracion busca los reportes que ya tienen descargo
     * sin leer, que son los que hay que mirar antes de decidir.
     */
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_conduct_reports_con_descargo"
         ON public.conduct_reports ("subject_statement_at" DESC)
         WHERE "subject_statement" IS NOT NULL AND "status" <> 'cerrado'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public."idx_conduct_reports_con_descargo"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.conduct_reports
         DROP COLUMN IF EXISTS "subject_statement_at",
         DROP COLUMN IF EXISTS "subject_statement"`,
    );
  }
}
