import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegulationRoles1785000000000 implements MigrationInterface {
  name = 'AddRegulationRoles1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE public.employee_regulations_target_role_enum AS ENUM ('empleada', 'chofer', 'jefe')`,
    );

    await queryRunner.query(
      `ALTER TABLE public.employee_regulations ADD target_role public.employee_regulations_target_role_enum NOT NULL DEFAULT 'empleada'`,
    );

    const regulationId = '00000000-0000-4000-8000-000000003000';
    const publicationKey = '00000000-0000-4000-8000-000000004000';
    const content = `Reglamento y Responsabilidades

1. Presentación Personal
* Estar siempre preparada para un servicio y llevar todo lo necesario: Blazer, Tacones, Lencería, Echarpe (si aplica), Traje de baño, Condones, Lencería extra.
* Mantener una excelente imagen personal en todo momento: vestimenta, cabello, uñas, higiene y presentación.
* Durante el horario laboral debes estar completamente disponible, con tu imagen al 100% y tu equipo de trabajo listo.

2. Herramientas de Trabajo
* Mantener el celular con datos móviles y suficiente batería.
* Cuidar y mantener en perfecto estado todas tus herramientas de trabajo.
* Eres responsable de tener listas todas tus herramientas antes de cada servicio.
* Cuando se te solicite un Uber para transportarte, deberás llevar efectivo y cambio suficiente.

3. Puntualidad y Reportes
* Avisar en tiempo real: Al llegar al servicio, Al finalizar el servicio, Cuando estés con el chofer, Cuando llegues a casa.
* Los domingos debes estar lista sin excepción a las 6:00 p.m.
* Administra correctamente tus tiempos para comidas, descanso e imagen personal.
* No está permitido dormirse durante el horario de trabajo.

4. Servicios
* Al llegar a un servicio, siempre deberás cobrar por adelantado.
* Cumplir con la duración completa del servicio contratado.
* Ofrecer siempre el mejor servicio posible.
* Recuerda que representas tanto tu imagen como la de la agencia.
* Al finalizar cada servicio, subir correctamente la información al sistema junto con su comprobante de pago.
* Si consigues un servicio por tu cuenta, deberás proporcionar la información correspondiente y compartir el número del cliente.
* Ningún cliente está autorizado para llevarte a tu domicilio.
* Muchas veces se toman servicios por $2,300 MXN y, en algunos casos de varias horas, por $2,000 MXN; cualquier situación relacionada deberá consultarse con la oficina.

5. Respeto y Conducta
* Dar el mismo respeto que recibes.
* Respetar jerarquías y rangos dentro de la empresa.
* Respetar a telefonistas, compañeras y choferes.
* Cualquier problema con la oficina debe resolverse de manera inmediata y por los canales correspondientes.
* No tomar ninguna decisión relacionada con el trabajo sin consultarlo previamente con la oficina.
* No está permitido hablar sobre la logística, procesos internos, códigos o información confidencial de la empresa.
* No mostrar ni compartir información relacionada con el trabajo.

6. Permisos y Salidas
* Los permisos se solicitan únicamente de lunes a miércoles dentro del horario establecido.
* No salir de las instalaciones o domicilio asignado sin autorización previa de tu telefonista.

7. Transporte
* Es importante pagar a los choferes de la agencia inmediatamente la cantidad correspondiente al traslado realizado.
* Ningún cliente podrá transportarte a tu domicilio bajo ninguna circunstancia.
* Cuando un chofer llegue por ti, deberás estar completamente lista para salir.
* Una vez que el chofer informe su llegada, tendrás un máximo de 5 minutos para abordar la unidad.
* Los retrasos injustificados que afecten la operación o generen tiempos de espera excesivos podrán considerarse una falta administrativa.

8. Salud y Bienestar
* Si en cualquier momento te sientes indispuesta o presentas algún problema de salud, deberás informarlo inmediatamente a la oficina.
* No esperes a que se te asigne un servicio para comunicar tu situación.
* La oficina debe estar informada en tiempo real para tomar las medidas correspondientes.

9. Normas de la Casa
* Respetar las reglas de la casa.
* Mantener las áreas limpias.
* Limpiar cualquier espacio o material que utilices.
* No está permitido permanecer en una casa que no sea la asignada.
* Procurar no entrar con tacones a las casas para respetar a vecinos y personas con quienes compartes el hogar.

10. Uso de Grupos de Comunicación
* El grupo de tu casa tiene como finalidad: Avisar entradas y salidas, Reportar la llegada de Uber o transporte, Informar cualquier daño o incidente.
* Utilizar los grupos únicamente para los fines establecidos.

11. Contenido y Promoción
* Enviar contenido todos los lunes.
* Mínimo 7 fotografías por semana.

12. Sustancias y Comportamiento con Clientes
* Está estrictamente prohibido solicitar sustancias a los clientes si ellos no las han pedido, ofrecido o mencionado previamente.
* Mantener siempre una conducta profesional y respetuosa.

13. Responsabilidad General
* No realizar paradas innecesarias durante el trayecto hacia un servicio.
* Ser responsable en todo momento de tu puntualidad, presentación y desempeño laboral.
* Cumplir con todas las normas y procedimientos establecidos por la empresa.

Sanciones
El incumplimiento de cualquiera de las reglas establecidas en este reglamento podrá generar una sanción económica. Las multas podrán ir desde $1,000 MXN hasta $10,000 MXN, dependiendo de la gravedad de la falta, las circunstancias del caso y la decisión de la oficina. Cada situación será evaluada individualmente y la administración determinará la sanción correspondiente.`;

    await queryRunner.query(
      `INSERT INTO public.employee_regulations
        (id, title, content, passing_score, publication_key, target_role)
       VALUES ($1, $2, $3, 80, $4, 'empleada')`,
      [regulationId, 'Reglamento y Responsabilidades', content, publicationKey],
    );

    const questions = [
      [
        '00000000-0000-4000-8000-000000003001',
        '¿Qué debes hacer al llegar a un servicio con un cliente?',
        1,
      ],
      [
        '00000000-0000-4000-8000-000000003002',
        '¿Cuál es el tiempo máximo de espera para abordar la unidad una vez que el chofer informa su llegada?',
        2,
      ],
      [
        '00000000-0000-4000-8000-000000003003',
        '¿A qué hora debes estar lista los domingos sin excepción?',
        3,
      ],
      [
        '00000000-0000-4000-8000-000000003004',
        '¿Cuál es la regla respecto a solicitar sustancias a los clientes?',
        4,
      ],
      [
        '00000000-0000-4000-8000-000000003005',
        '¿Cuál de las siguientes acciones está permitida al finalizar un servicio?',
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
      // Pregunta 1
      [
        '00000000-0000-4000-8000-000000003101',
        questions[0][0] as string,
        'Cobrar el servicio por adelantado antes de iniciar.',
        true,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000003102',
        questions[0][0] as string,
        'Esperar a que el cliente pregunte cuánto es al final.',
        false,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000003103',
        questions[0][0] as string,
        'Cobrar la mitad al inicio y la mitad al finalizar.',
        false,
        3,
      ],
      // Pregunta 2
      [
        '00000000-0000-4000-8000-000000003104',
        questions[1][0] as string,
        'Un máximo de 5 minutos.',
        true,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000003105',
        questions[1][0] as string,
        '10 minutos.',
        false,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000003106',
        questions[1][0] as string,
        'El tiempo que sea necesario hasta estar completamente lista.',
        false,
        3,
      ],
      // Pregunta 3
      [
        '00000000-0000-4000-8000-000000003107',
        questions[2][0] as string,
        'A las 6:00 p.m.',
        true,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000003108',
        questions[2][0] as string,
        'A las 8:00 p.m.',
        false,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000003109',
        questions[2][0] as string,
        'Depende del horario de mi primer servicio.',
        false,
        3,
      ],
      // Pregunta 4
      [
        '00000000-0000-4000-8000-000000003110',
        questions[3][0] as string,
        'Puedes pedirlas siempre que haya confianza con el cliente.',
        false,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000003111',
        questions[3][0] as string,
        'Está estrictamente prohibido pedirlas si el cliente no las ha ofrecido o mencionado previamente.',
        true,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000003112',
        questions[3][0] as string,
        'Solo puedes pedir alcohol, pero nada más.',
        false,
        3,
      ],
      // Pregunta 5
      [
        '00000000-0000-4000-8000-000000003113',
        questions[4][0] as string,
        'Subir correctamente la información al sistema junto con su comprobante de pago.',
        true,
        1,
      ],
      [
        '00000000-0000-4000-8000-000000003114',
        questions[4][0] as string,
        'Pedirle al cliente que te lleve a tu domicilio.',
        false,
        2,
      ],
      [
        '00000000-0000-4000-8000-000000003115',
        questions[4][0] as string,
        'Hablar sobre la logística y procesos internos de la agencia con el cliente.',
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.employee_regulations DROP COLUMN target_role`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS public.employee_regulations_target_role_enum`,
    );
  }
}
