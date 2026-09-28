import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';
import { EmployeeRegulation } from '../employee-onboarding/entities/employee-regulation.entity';
import { RegulationQuestion } from '../employee-onboarding/entities/regulation-question.entity';
import { RegulationOption } from '../employee-onboarding/entities/regulation-option.entity';
import { EmployeeOnboarding } from '../employee-onboarding/entities/employee-onboarding.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { In } from 'typeorm';

export class UpdateRegulationAndQuestions1806000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const manager = queryRunner.manager;
    const targetRole = 'empleada';

    // The new content
    const title = 'Reglamento General para Empleadas';
    const content = `1. Presentación Personal
Estar siempre preparada para un servicio y llevar todo lo necesario: blazer, tacones, lencería, traje de baño, condones y lencería extra. Mantener una excelente imagen personal en todo momento: vestimenta, cabello, uñas, higiene y presentación. Durante el horario laboral debes estar completamente disponible, con tu imagen al 100% y tu equipo de trabajo listo.

2. Herramientas de Trabajo
Mantener el celular con datos móviles y suficiente batería. Cuidar y mantener en perfecto estado todas tus herramientas de trabajo. Eres responsable de tener listas todas tus herramientas antes de cada servicio. Cuando se te solicite un Uber para transportarte, deberás llevar efectivo y cambio suficiente.

3. Puntualidad y Reportes
Avisar en tiempo real al llegar al servicio, al finalizar el servicio, cuando estés con el chofer y cuando llegues a casa. Los domingos debes estar lista sin excepción a las 6:00 p.m. Administra correctamente tus tiempos para comidas, descanso e imagen personal. No está permitido dormirse durante el horario de trabajo.

4. Servicios
Al llegar a un servicio, siempre deberás cobrar por adelantado. Cumplir con la duración completa del servicio contratado. Ofrecer siempre el mejor servicio posible. Recuerda que representas tanto tu imagen como la de la agencia. Al finalizar cada servicio, subir correctamente la información al sistema junto con su comprobante de pago. Si consigues un servicio por tu cuenta, deberás proporcionar la información correspondiente y compartir el número del cliente, así mismo, el cliente deberá comunicarse directamente con la empresa. Ningún cliente está autorizado para llevarte a tu domicilio. Muchas veces se toman servicios por $2,300 MXN y, en algunos casos de varias horas, por $2,000 MXN; cualquier situación relacionada deberá consultarse con la oficina. En caso de que te llegue a pagar con terminal, siempre cobrar el porcentaje de comisión establecido por tu telefonista, así mismo, compartir siempre el comprobante original al número establecido en el turno. En el caso de las transferencias, en concepto siempre poner tus iniciales del nombre artístico y así mismo, compartir el comprobante original, donde se pueda apreciar la clave de rastreo y la hora en que fue realizada dicho pago. Además, pondrán sus iniciales de su nombre artístico en "agregar descripción" así tal cual se aprecia en el video, después de realizar el pago aparece una opción de enviar el comprobante de pago, salen dos opciones, por sms y por correo, únicamente será por sms y agregaran el número que les dé su telefonista. Quien no cumpla con este requisito, no será válido su pago, se agregará en efectivo. Recuerden que deben cobrar al inicio del servicio, en la parte de atrás los point están marcados: point 1, point 2, point 3 y así sucesivamente, cuando a ustedes les entreguen la terminal, tendrán que checar qué número de point es y avisarle a su telefonista.

5. Respeto y Conducta
Dar el mismo respeto que recibes. Respetar jerarquías y rangos dentro de la empresa. Respetar a telefonistas, compañeras y choferes. Cualquier problema con la oficina debe resolverse de manera inmediata y por los canales correspondientes. No tomar ninguna decisión relacionada con el trabajo sin consultarlo previamente con la oficina. No está permitido hablar sobre la logística, procesos internos, códigos o información confidencial de la empresa. No mostrar ni compartir información relacionada con el trabajo.

6. Permisos y Salidas
Los permisos se solicitan únicamente de lunes a miércoles dentro del horario establecido. No salir de las instalaciones o domicilio asignado sin autorización previa de tu telefonista.

7. Transporte
Es importante pagar a los choferes de la agencia inmediatamente la cantidad correspondiente al traslado realizado. Ningún cliente podrá transportarte a tu domicilio bajo ninguna circunstancia. Cuando un chofer llegue por ti, deberás estar completamente lista para salir. Una vez que el chofer informe su llegada, tendrás un máximo de 10 minutos para abordar la unidad. Los retrasos injustificados que afecten la operación o generen tiempos de espera excesivos podrán considerarse una falta administrativa.

8. Salud y Bienestar
Si en cualquier momento te sientes indispuesta o presentas algún problema de salud, deberás informarlo inmediatamente a la oficina. No esperes a que se te asigne un servicio para comunicar tu situación. La oficina debe estar informada en tiempo real para tomar las medidas correspondientes.

9. Normas de la Casa
Respetar las reglas de la casa. Mantener las áreas limpias. Limpiar cualquier espacio o material que utilices. No está permitido permanecer en una casa que no sea la asignada. Procurar no entrar con tacones a las casas para respetar a vecinos y personas con quienes compartes el hogar. No ingerir ninguna sustancia nociva dentro de las instalaciones.

10. Uso de Grupos de Comunicación
El grupo de tu casa tiene como finalidad avisar entradas y salidas, reportar la llegada de Uber o transporte, e informar cualquier daño o incidente. Utilizar los grupos únicamente para los fines establecidos.

11. Contenido y Promoción
Enviar contenido todos los lunes. Mínimo 7 fotografías por semana.

12. Sustancias y Comportamiento con Clientes
Está estrictamente prohibido solicitar sustancias a los clientes si ellos no las han pedido, ofrecido o mencionado previamente. Mantener siempre una conducta profesional y respetuosa.

13. Responsabilidad General
No realizar paradas innecesarias durante el trayecto hacia un servicio. Ser responsable en todo momento de tu puntualidad, presentación y desempeño laboral. Cumplir con todas las normas y procedimientos establecidos por la empresa.

Sanciones
El incumplimiento de cualquiera de las reglas establecidas en este reglamento podrá generar una sanción económica. Las multas podrán ir desde $1,000 MXN hasta $10,000 MXN, dependiendo de la gravedad de la falta, las circunstancias del caso y la decisión de la oficina. Cada situación será evaluada individualmente y la administración determinará la sanción correspondiente.`;

    const rawQuestions = [
      // Slot 1
      {
        groupKey: 'presentacion',
        text: '¿Qué elementos son indispensables llevar siempre para estar preparada para un servicio?',
        options: [
          {
            text: 'Blazer, tacones, lencería, traje de baño, condones y lencería extra.',
            isCorrect: true,
          },
          {
            text: 'Solo un cambio de ropa y maquillaje básico.',
            isCorrect: false,
          },
          {
            text: 'Únicamente el uniforme de la agencia y zapatos cómodos.',
            isCorrect: false,
          },
        ],
      },
      {
        groupKey: 'presentacion',
        text: 'Durante tu horario laboral, ¿cómo debe ser tu disponibilidad e imagen?',
        options: [
          {
            text: 'Estar completamente disponible, con imagen al 100% y equipo listo.',
            isCorrect: true,
          },
          {
            text: 'Puedo descansar y arreglarme cuando me avisen de un servicio.',
            isCorrect: false,
          },
          {
            text: 'Puedo dormir si no hay servicios asignados.',
            isCorrect: false,
          },
        ],
      },
      // Slot 2
      {
        groupKey: 'puntualidad',
        text: '¿En qué momentos específicos debes reportarte con la oficina?',
        options: [
          {
            text: 'Al llegar/finalizar el servicio, al estar con el chofer y al llegar a casa.',
            isCorrect: true,
          },
          {
            text: 'Solo al finalizar el servicio para informar que todo salió bien.',
            isCorrect: false,
          },
          { text: 'Una vez al día al iniciar mi turno.', isCorrect: false },
        ],
      },
      {
        groupKey: 'puntualidad',
        text: '¿A qué hora debes estar lista, sin excepción, los días domingo?',
        options: [
          { text: 'A las 6:00 p.m.', isCorrect: true },
          { text: 'A las 8:00 p.m.', isCorrect: false },
          { text: 'A la hora que tenga mi primer servicio.', isCorrect: false },
        ],
      },
      // Slot 3
      {
        groupKey: 'cobro',
        text: '¿En qué momento se debe cobrar el servicio al cliente?',
        options: [
          { text: 'Al llegar, siempre por adelantado.', isCorrect: true },
          { text: 'A la mitad del tiempo.', isCorrect: false },
          { text: 'Al finalizar el servicio.', isCorrect: false },
        ],
      },
      {
        groupKey: 'cobro',
        text: '¿Qué debes hacer si consigues un servicio por tu cuenta?',
        options: [
          {
            text: 'Dar información, compartir el número y el cliente debe comunicarse con la empresa.',
            isCorrect: true,
          },
          {
            text: 'Atenderlo de manera independiente sin avisar a la oficina.',
            isCorrect: false,
          },
          {
            text: 'Cobrar el 100% para mí y reportarlo al final del día.',
            isCorrect: false,
          },
        ],
      },
      // Slot 4
      {
        groupKey: 'transferencias',
        text: 'En caso de pago por transferencia, ¿qué debes poner en "concepto" o "agregar descripción"?',
        options: [
          { text: 'Iniciales de mi nombre artístico.', isCorrect: true },
          { text: 'Pago de servicio.', isCorrect: false },
          { text: 'Cualquier palabra, no importa.', isCorrect: false },
        ],
      },
      {
        groupKey: 'transferencias',
        text: '¿Por qué medio se debe enviar el comprobante de pago desde la app (opción enviar)?',
        options: [
          {
            text: 'Únicamente por SMS al número que dé la telefonista.',
            isCorrect: true,
          },
          { text: 'Por correo electrónico.', isCorrect: false },
          { text: 'Por WhatsApp directamente al cliente.', isCorrect: false },
        ],
      },
      // Slot 5
      {
        groupKey: 'terminales',
        text: 'Si cobras con terminal (point), ¿qué información debes revisar y avisar a tu telefonista?',
        options: [
          {
            text: 'Checar qué número de point es (ej. point 1) en la parte de atrás.',
            isCorrect: true,
          },
          {
            text: 'Avisar solo cuánto porcentaje de batería le queda.',
            isCorrect: false,
          },
          {
            text: 'No es necesario avisar, solo pasar la tarjeta.',
            isCorrect: false,
          },
        ],
      },
      {
        groupKey: 'terminales',
        text: 'Cuando un cliente paga con terminal, ¿qué porcentaje de comisión debes cobrarle?',
        options: [
          {
            text: 'El porcentaje establecido por tu telefonista.',
            isCorrect: true,
          },
          { text: 'Siempre el 5% extra.', isCorrect: false },
          { text: 'No se cobra ninguna comisión.', isCorrect: false },
        ],
      },
      // Slot 6
      {
        groupKey: 'permisos',
        text: '¿Qué días se pueden solicitar permisos para salir?',
        options: [
          {
            text: 'Únicamente de lunes a miércoles dentro del horario establecido.',
            isCorrect: true,
          },
          {
            text: 'Cualquier día de la semana si no hay servicios.',
            isCorrect: false,
          },
          { text: 'Solo los fines de semana.', isCorrect: false },
        ],
      },
      {
        groupKey: 'permisos',
        text: '¿Qué debes hacer si tienes algún problema relacionado con la oficina?',
        options: [
          {
            text: 'Resolverlo de manera inmediata y por los canales correspondientes.',
            isCorrect: true,
          },
          { text: 'Tomar la decisión por mi cuenta.', isCorrect: false },
          {
            text: 'Hablarlo con mis compañeras y llegar a un acuerdo entre nosotras.',
            isCorrect: false,
          },
        ],
      },
      // Slot 7
      {
        groupKey: 'transporte',
        text: '¿Cuánto tiempo tienes máximo para abordar la unidad una vez que el chofer informa su llegada?',
        options: [
          { text: '10 minutos.', isCorrect: true },
          { text: '5 minutos.', isCorrect: false },
          { text: '15 minutos.', isCorrect: false },
        ],
      },
      {
        groupKey: 'transporte',
        text: 'Al terminar un servicio, ¿puede el cliente transportarte a tu domicilio?',
        options: [
          {
            text: 'Ningún cliente podrá transportarme a mi domicilio bajo ninguna circunstancia.',
            isCorrect: true,
          },
          {
            text: 'Sí, siempre y cuando pague un costo extra.',
            isCorrect: false,
          },
          { text: 'Sí, si es de confianza y lo aviso.', isCorrect: false },
        ],
      },
      // Slot 8
      {
        groupKey: 'salud',
        text: 'Si te sientes indispuesta de salud, ¿cuándo debes informarlo a la oficina?',
        options: [
          {
            text: 'Inmediatamente, no esperar a que se me asigne un servicio.',
            isCorrect: true,
          },
          {
            text: 'Cuando me pregunten si estoy disponible.',
            isCorrect: false,
          },
          {
            text: 'Solo si la enfermedad dura más de un día.',
            isCorrect: false,
          },
        ],
      },
      {
        groupKey: 'salud',
        text: '¿Cuál es el procedimiento correcto si tienes un problema de salud durante el turno?',
        options: [
          {
            text: 'Informar en tiempo real a la oficina para que tomen medidas.',
            isCorrect: true,
          },
          {
            text: 'Tomar medicación y seguir trabajando sin decir nada.',
            isCorrect: false,
          },
          {
            text: 'Irme a descansar a mi cuarto sin avisar.',
            isCorrect: false,
          },
        ],
      },
      // Slot 9
      {
        groupKey: 'casa',
        text: '¿Por qué se recomienda procurar no entrar con tacones a las casas?',
        options: [
          {
            text: 'Para respetar a vecinos y a las personas con quienes se comparte el hogar.',
            isCorrect: true,
          },
          { text: 'Porque el piso puede estar resbaladizo.', isCorrect: false },
          { text: 'Para evitar desgastar los tacones.', isCorrect: false },
        ],
      },
      {
        groupKey: 'casa',
        text: 'Si ensucias o utilizas algún espacio o material de la casa, ¿qué debes hacer?',
        options: [
          {
            text: 'Limpiar cualquier espacio o material utilizado.',
            isCorrect: true,
          },
          {
            text: 'Dejarlo para que lo limpie el personal de limpieza.',
            isCorrect: false,
          },
          {
            text: 'Avisar para que otra compañera lo limpie.',
            isCorrect: false,
          },
        ],
      },
      // Slot 10
      {
        groupKey: 'sustancias',
        text: '¿Cuándo se debe enviar contenido promocional (fotografías) a la agencia?',
        options: [
          {
            text: 'Todos los lunes, mínimo 7 fotografías por semana.',
            isCorrect: true,
          },
          { text: 'Todos los días, 1 fotografía diaria.', isCorrect: false },
          { text: 'Los viernes antes del fin de semana.', isCorrect: false },
        ],
      },
      {
        groupKey: 'sustancias',
        text: '¿Está permitido solicitar sustancias a los clientes?',
        options: [
          {
            text: 'Estrictamente prohibido si ellos no las han pedido, ofrecido o mencionado previamente.',
            isCorrect: true,
          },
          {
            text: 'Sí, siempre que se compartan con las demás compañeras.',
            isCorrect: false,
          },
          {
            text: 'Sí, pero solo fuera del horario laboral.',
            isCorrect: false,
          },
        ],
      },
    ];

    const publicationKey = randomUUID();
    const publishedAt = new Date();
    const passingScore = 90;

    let regulation = await manager.findOne(EmployeeRegulation, {
      where: { targetRole },
      order: { updatedAt: 'DESC' },
    });

    if (regulation) {
      regulation.title = title;
      regulation.content = content;
      regulation.passingScore = passingScore;
      regulation.publicationKey = publicationKey;
      regulation.publishedAt = publishedAt;
      regulation.updatedAt = publishedAt;
    } else {
      regulation = manager.create(EmployeeRegulation, {
        title,
        content,
        passingScore,
        publicationKey,
        publishedAt,
        updatedAt: publishedAt,
        targetRole,
      });
    }
    regulation = await manager.save(EmployeeRegulation, regulation);

    let nextSlot = 1;
    const slotByGroupKey = new Map<string, number>();
    for (const questionDto of rawQuestions) {
      const groupKey = questionDto.groupKey?.trim() || null;
      let slot: number;
      if (groupKey) {
        slot = slotByGroupKey.get(groupKey) ?? nextSlot;
        if (!slotByGroupKey.has(groupKey)) {
          slotByGroupKey.set(groupKey, slot);
          nextSlot += 1;
        }
      } else {
        slot = nextSlot;
        nextSlot += 1;
      }
      const question = await manager.save(
        RegulationQuestion,
        manager.create(RegulationQuestion, {
          regulationId: regulation.id,
          publicationKey,
          text: questionDto.text,
          order: slot,
          groupKey,
        }),
      );
      await manager.save(
        RegulationOption,
        questionDto.options.map((option, optionIndex) =>
          manager.create(RegulationOption, {
            questionId: question.id,
            text: option.text,
            isCorrect: option.isCorrect,
            order: optionIndex + 1,
          }),
        ),
      );
    }

    const staff = await manager.find(Usuarios, {
      where: { rol: targetRole },
    });

    let employeeProfiles: Empleadas[] = [];
    if (staff.length > 0) {
      // Avoid passing empty array to In()
      employeeProfiles = await manager.find(Empleadas, {
        where: { usuarioId: In(staff.map((user) => user.id)) },
      });
    }

    const employeeByUser = new Map(
      employeeProfiles.map((employee) => [employee.usuarioId, employee]),
    );

    let previousAssignments: EmployeeOnboarding[] = [];
    if (staff.length > 0) {
      previousAssignments = await manager.find(EmployeeOnboarding, {
        where: { active: true, userId: In(staff.map((u) => u.id)) },
      });
    }

    const previousByUser = new Map(
      previousAssignments.map((assignment) => [assignment.userId, assignment]),
    );

    const toDeactivateIds: string[] = [];
    const toCreate: EmployeeOnboarding[] = [];

    for (const user of staff) {
      const previous = previousByUser.get(user.id);
      const employee = employeeByUser.get(user.id);

      if (previous) toDeactivateIds.push(previous.id);

      toCreate.push(
        manager.create(EmployeeOnboarding, {
          userId: user.id,
          employeeId: employee?.id ?? null,
          publicationKey,
          assignedAt: publishedAt,
          status: 'pending',
          active: true,
          isRenewal: Boolean(previous),
          attemptCount: 0,
          bestScore: 0,
          trustScore: 1,
          welcomeSentAt: previous?.welcomeSentAt ? publishedAt : null,
        }),
      );
    }

    if (toDeactivateIds.length > 0) {
      await manager.update(
        EmployeeOnboarding,
        { id: In(toDeactivateIds) },
        { active: false },
      );
    }

    if (toCreate.length > 0) {
      await manager.save(EmployeeOnboarding, toCreate);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migration rollback logic not fully required for this data patch.
  }
}
