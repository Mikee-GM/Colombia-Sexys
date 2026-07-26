import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendOnboardingToStaff1784300100000 implements MigrationInterface {
  name = 'ExtendOnboardingToStaff1784300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings ADD COLUMN user_id uuid`,
    );
    await queryRunner.query(`
      UPDATE public.employee_onboardings onboarding
      SET user_id = employee.usuario_id
      FROM public.empleadas employee
      WHERE employee.id = onboarding.employee_id
    `);
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings ALTER COLUMN user_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings ALTER COLUMN employee_id DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings DROP CONSTRAINT fk_employee_onboardings_employee`,
    );
    await queryRunner.query(`
      ALTER TABLE public.employee_onboardings
      ADD CONSTRAINT fk_employee_onboardings_employee
      FOREIGN KEY (employee_id) REFERENCES public.empleadas(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE public.employee_onboardings
      ADD CONSTRAINT fk_employee_onboardings_user
      FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON DELETE CASCADE
    `);
    await queryRunner.query(
      `CREATE INDEX idx_employee_onboardings_user ON public.employee_onboardings (user_id)`,
    );
    await queryRunner.query(
      `DROP INDEX public.employee_onboardings_one_active_per_employee`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX employee_onboardings_one_active_per_user ON public.employee_onboardings (user_id) WHERE active = true`,
    );
    await queryRunner.query(`
      INSERT INTO public.employee_onboardings
        (user_id, employee_id, publication_key)
      SELECT
        staff.id,
        employee.id,
        regulation.publication_key
      FROM public.usuarios staff
      CROSS JOIN LATERAL (
        SELECT publication_key
        FROM public.employee_regulations
        ORDER BY updated_at DESC
        LIMIT 1
      ) regulation
      LEFT JOIN public.empleadas employee ON employee.usuario_id = staff.id
      WHERE staff.rol IN ('empleada', 'chofer', 'jefe')
        AND NOT EXISTS (
          SELECT 1
          FROM public.employee_onboardings existing
          WHERE existing.user_id = staff.id AND existing.active = true
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM public.employee_onboardings WHERE employee_id IS NULL`,
    );
    await queryRunner.query(
      `DROP INDEX public.employee_onboardings_one_active_per_user`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX employee_onboardings_one_active_per_employee ON public.employee_onboardings (employee_id) WHERE active = true`,
    );
    await queryRunner.query(`DROP INDEX public.idx_employee_onboardings_user`);
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings DROP CONSTRAINT fk_employee_onboardings_user`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings DROP CONSTRAINT fk_employee_onboardings_employee`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings ALTER COLUMN employee_id SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE public.employee_onboardings
      ADD CONSTRAINT fk_employee_onboardings_employee
      FOREIGN KEY (employee_id) REFERENCES public.empleadas(id) ON DELETE CASCADE
    `);
    await queryRunner.query(
      `ALTER TABLE public.employee_onboardings DROP COLUMN user_id`,
    );
  }
}
