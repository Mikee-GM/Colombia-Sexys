import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeOnboarding1784300000000 implements MigrationInterface {
  name = 'CreateEmployeeOnboarding1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE public.employee_onboardings_status_enum AS ENUM ('pending', 'in_progress', 'completed')`,
    );
    await queryRunner.query(
      `CREATE TYPE public.questionnaire_attempts_status_enum AS ENUM ('in_progress', 'completed')`,
    );
    await queryRunner.query(`
      CREATE TABLE public.employee_regulations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title varchar(255) NOT NULL,
        content text NOT NULL,
        passing_score smallint NOT NULL DEFAULT 80 CHECK (passing_score BETWEEN 1 AND 100),
        publication_key uuid NOT NULL,
        published_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE public.regulation_questions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        regulation_id uuid NOT NULL,
        publication_key uuid NOT NULL,
        text text NOT NULL,
        display_order smallint NOT NULL,
        CONSTRAINT fk_regulation_questions_regulation
          FOREIGN KEY (regulation_id) REFERENCES public.employee_regulations(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE public.regulation_options (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id uuid NOT NULL,
        text text NOT NULL,
        is_correct boolean NOT NULL DEFAULT false,
        display_order smallint NOT NULL,
        CONSTRAINT fk_regulation_options_question
          FOREIGN KEY (question_id) REFERENCES public.regulation_questions(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE public.employee_onboardings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL,
        publication_key uuid NOT NULL,
        status public.employee_onboardings_status_enum NOT NULL DEFAULT 'pending',
        active boolean NOT NULL DEFAULT true,
        is_renewal boolean NOT NULL DEFAULT false,
        attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        best_score smallint NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100),
        trust_score smallint NOT NULL DEFAULT 1 CHECK (trust_score BETWEEN 1 AND 5),
        assigned_at timestamptz NOT NULL DEFAULT now(),
        welcome_sent_at timestamptz NULL,
        regulation_sent_at timestamptz NULL,
        read_at timestamptz NULL,
        reminder_sent_at timestamptz NULL,
        completed_at timestamptz NULL,
        last_delivery_error text NULL,
        CONSTRAINT fk_employee_onboardings_employee
          FOREIGN KEY (employee_id) REFERENCES public.empleadas(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE public.questionnaire_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        onboarding_id uuid NOT NULL,
        attempt_number smallint NOT NULL,
        status public.questionnaire_attempts_status_enum NOT NULL DEFAULT 'in_progress',
        correct_answers smallint NOT NULL DEFAULT 0,
        total_questions smallint NOT NULL DEFAULT 0,
        score smallint NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL,
        CONSTRAINT fk_questionnaire_attempts_onboarding
          FOREIGN KEY (onboarding_id) REFERENCES public.employee_onboardings(id) ON DELETE CASCADE,
        CONSTRAINT questionnaire_attempts_onboarding_number_key
          UNIQUE (onboarding_id, attempt_number)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE public.questionnaire_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        attempt_id uuid NOT NULL,
        question_id uuid NOT NULL,
        option_id uuid NOT NULL,
        is_correct boolean NOT NULL,
        answered_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_questionnaire_answers_attempt
          FOREIGN KEY (attempt_id) REFERENCES public.questionnaire_attempts(id) ON DELETE CASCADE,
        CONSTRAINT fk_questionnaire_answers_question
          FOREIGN KEY (question_id) REFERENCES public.regulation_questions(id) ON DELETE RESTRICT,
        CONSTRAINT fk_questionnaire_answers_option
          FOREIGN KEY (option_id) REFERENCES public.regulation_options(id) ON DELETE RESTRICT,
        CONSTRAINT questionnaire_answers_attempt_question_key UNIQUE (attempt_id, question_id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_regulation_questions_publication ON public.regulation_questions (regulation_id, publication_key, display_order)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_regulation_options_question ON public.regulation_options (question_id, display_order)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_employee_onboardings_employee ON public.employee_onboardings (employee_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_employee_onboardings_pending ON public.employee_onboardings (active, status, assigned_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX employee_onboardings_one_active_per_employee ON public.employee_onboardings (employee_id) WHERE active = true`,
    );

    const regulationId = '00000000-0000-4000-8000-000000001000';
    const publicationKey = '00000000-0000-4000-8000-000000002000';
    await queryRunner.query(
      `INSERT INTO public.employee_regulations
        (id, title, content, passing_score, publication_key)
       VALUES ($1, $2, $3, 80, $4)`,
      [
        regulationId,
        'Reglamento básico de trabajo',
        '1. Mantén una higiene adecuada: lávate las manos, usa uniforme limpio y lleva el cabello recogido antes de manipular alimentos.\n\n2. Evita la contaminación cruzada: separa ingredientes crudos, productos terminados, utensilios y superficies de trabajo.\n\n3. Respeta las recetas y medidas establecidas. No cambies ingredientes, cantidades, temperaturas o tiempos sin autorización.\n\n4. Usa correctamente el equipo de trabajo. Reporta inmediatamente cualquier accidente, desperfecto o situación insegura.\n\n5. Sé puntual, mantén limpia y ordenada tu área y trata con respeto a clientes y compañeros.',
        publicationKey,
      ],
    );

    const questions = [
      [
        '00000000-0000-4000-8000-000000001001',
        '¿Qué debes hacer antes de manipular alimentos?',
        1,
      ],
      [
        '00000000-0000-4000-8000-000000001002',
        '¿Cómo se evita la contaminación cruzada?',
        2,
      ],
      [
        '00000000-0000-4000-8000-000000001003',
        '¿Puedes cambiar una receta sin autorización?',
        3,
      ],
      [
        '00000000-0000-4000-8000-000000001004',
        '¿Qué debes hacer si detectas un equipo dañado?',
        4,
      ],
      [
        '00000000-0000-4000-8000-000000001005',
        '¿Cómo debe mantenerse el área de trabajo?',
        5,
      ],
    ];
    for (const [id, text, order] of questions) {
      await queryRunner.query(
        `INSERT INTO public.regulation_questions
          (id, regulation_id, publication_key, text, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, regulationId, publicationKey, text, order],
      );
    }

    const options: Array<[string, string, string, boolean, number]> = [
      [
        '00000000-0000-4000-8000-000000001101',
        questions[0][0] as string,
        'Lavarte las manos y usar uniforme limpio.',
        true,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000001102',
        questions[0][0] as string,
        'Revisar tu teléfono.',
        false,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000001103',
        questions[0][0] as string,
        'Probar todos los ingredientes.',
        false,
        3,
      ],
      [
        '00000000-0000-4000-8000-000000001104',
        questions[1][0] as string,
        'Utilizando los mismos utensilios para todo.',
        false,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000001105',
        questions[1][0] as string,
        'Separando ingredientes, productos y utensilios.',
        true,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000001106',
        questions[1][0] as string,
        'Guardando todos los alimentos juntos.',
        false,
        3,
      ],
      [
        '00000000-0000-4000-8000-000000001107',
        questions[2][0] as string,
        'Sí, siempre que el cambio sea pequeño.',
        false,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000001108',
        questions[2][0] as string,
        'Sí, cuando tengas prisa.',
        false,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000001109',
        questions[2][0] as string,
        'No, deben respetarse las recetas y medidas establecidas.',
        true,
        3,
      ],
      [
        '00000000-0000-4000-8000-000000001110',
        questions[3][0] as string,
        'Continuar usándolo.',
        false,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000001111',
        questions[3][0] as string,
        'Reportarlo inmediatamente.',
        true,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000001112',
        questions[3][0] as string,
        'Guardarlo sin avisar.',
        false,
        3,
      ],
      [
        '00000000-0000-4000-8000-000000001113',
        questions[4][0] as string,
        'Limpia y ordenada.',
        true,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000001114',
        questions[4][0] as string,
        'Solamente limpia al terminar la semana.',
        false,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000001115',
        questions[4][0] as string,
        'Con todos los utensilios sobre la mesa.',
        false,
        3,
      ],
    ];
    for (const [id, questionId, text, isCorrect, order] of options) {
      await queryRunner.query(
        `INSERT INTO public.regulation_options
          (id, question_id, text, is_correct, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, questionId, text, isCorrect, order],
      );
    }

    await queryRunner.query(
      `INSERT INTO public.employee_onboardings (employee_id, publication_key)
       SELECT id, $1 FROM public.empleadas
       ON CONFLICT DO NOTHING`,
      [publicationKey],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS public.questionnaire_answers`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS public.questionnaire_attempts`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS public.employee_onboardings`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.regulation_options`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.regulation_questions`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.employee_regulations`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS public.questionnaire_attempts_status_enum`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS public.employee_onboardings_status_enum`,
    );
  }
}
