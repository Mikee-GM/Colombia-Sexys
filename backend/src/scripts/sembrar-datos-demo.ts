/**
 * Siembra una operación completa de demostración para revisar el panel.
 *
 * PARA QUÉ SIRVE
 * En un panel, un campo que la interfaz nunca dibuja y un campo que está en
 * NULL se ven exactamente igual: vacío. Con la base a medio llenar no hay forma
 * de distinguirlos, así que este script mete una operación entera con TODOS los
 * campos opcionales rellenos. Lo que después salga vacío en una pantalla es la
 * pantalla, no el dato.
 *
 * Al terminar imprime, tabla por tabla, qué columnas quedaron en NULL en las
 * filas sembradas: ese listado es contra lo que hay que comparar mientras se
 * recorre el panel.
 *
 * QUÉ SIEMBRA
 * Una operación coherente, no relleno suelto: un admin, dos jefes, tres
 * modelos con sus fotos y extras, dos choferes con vehículo, tres clientes con
 * membresía, y servicios en todos sus estados —pendiente, agendado, en curso,
 * finalizado, cancelado, manual, de duración indefinida y en grupo— con sus
 * viajes, extras, prórrogas, extensiones, comprobantes, calificaciones,
 * reportes, sanciones, turnos, efectivo, liquidaciones, retos, contenido
 * semanal, onboarding y candidatas colgando de ellos.
 *
 * Los importes NO se inventan: los triggers de la base (`calcular_total_servicio`,
 * `actualizar_total_extras_servicio`, `actualizar_total_transporte_servicio`,
 * `actualizar_metricas_empleada_*`) recalculan totales, transporte y promedios
 * a partir de lo que se inserta. Por eso las cifras que se ven en el panel son
 * las que el sistema calcularía de verdad, y sirven para juzgar si una suma
 * está bien.
 *
 * CÓMO SE RECONOCE Y SE BORRA
 * Todo lo sembrado lleva un id que empieza por `deadbeef-`, así que se puede
 * localizar y eliminar con exactitud. `--limpiar` borra solo eso y no toca nada
 * más; sembrar de nuevo limpia primero, de modo que el script es idempotente.
 *
 * USO desde `backend/`:
 *   corepack pnpm build
 *   node dist/scripts/sembrar-datos-demo.js               # Ensayo: dice qué haría
 *   node dist/scripts/sembrar-datos-demo.js --confirmar   # Siembra de verdad
 *   node dist/scripts/sembrar-datos-demo.js --limpiar --confirmar   # Borra lo sembrado
 *
 * EN PRODUCCIÓN HACE FALTA UNA BANDERA MÁS. Con `NODE_ENV=production` no basta
 * con `--confirmar`: hay que añadir `--en-produccion`. Son dos banderas que
 * nadie teclea por inercia, y ninguna viene puesta en los scripts de desarrollo.
 *
 *   node dist/scripts/sembrar-datos-demo.js --confirmar --en-produccion
 *
 * El ensayo sí corre en producción sin banderas, porque no se conecta ni
 * escribe nada. Antes de tocar la base, el script imprime a qué servidor y a
 * qué base va a escribir: esa línea es la que hay que leer antes de seguir.
 *
 * El día que la operación sea real y haya datos de clientes de verdad, esto
 * deja de tener sentido: lo que hay que hacer entonces es volver a abortar en
 * cuanto `NODE_ENV` sea `production`, en `main()`.
 */

import { AppDataSource } from '../data-source';
import type { QueryRunner } from 'typeorm';

/** Prefijo de todos los ids sembrados. Es lo que hace exacta la limpieza. */
const PREFIJO = 'deadbeef';

/** Genera un uuid estable y reconocible a partir de un número. */
const id = (n: number): string =>
  `${PREFIJO}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ahora = new Date();
const dias = (n: number): Date =>
  new Date(ahora.getTime() + n * 24 * 60 * 60 * 1000);
const horas = (n: number): Date =>
  new Date(ahora.getTime() + n * 60 * 60 * 1000);
/** Lunes de la semana en curso, que es como se cortan las liquidaciones. */
const lunesDeEstaSemana = (): Date => {
  const d = new Date(ahora);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// ---------------------------------------------------------------------------
// Identificadores. Se nombran para que las consultas de abajo se lean solas.
// ---------------------------------------------------------------------------
const U = {
  admin: id(1),
  jefe1: id(2),
  jefe2: id(3),
  empleada1: id(4),
  empleada2: id(5),
  empleada3: id(6),
  chofer1: id(7),
  chofer2: id(8),
};
const APTO = { norte: id(10), centro: id(11) };
const EMP = { uno: id(20), dos: id(21), tres: id(22) };
const CHO = { uno: id(30), dos: id(31) };
const CLI = { uno: id(40), dos: id(41), tres: id(42) };
const LUG = { majestic: id(50), montecarlo: id(51) };
const TIER = { plata: id(60), oro: id(61), platino: id(62) };
const SRV = {
  finalizado: id(70),
  enCurso: id(71),
  agendado: id(72),
  pendiente: id(73),
  cancelado: id(74),
  manual: id(75),
  indefinido: id(76),
  grupal: id(77),
};

/**
 * Orden inverso de dependencias para el borrado. Cada tabla va antes que
 * aquellas de las que depende, de modo que ninguna llave foránea se queda
 * apuntando al vacío.
 */
export const TABLAS_EN_ORDEN_DE_BORRADO = [
  'candidate_screening_answers',
  'candidate_screenings',
  'screening_questions',
  'questionnaire_answers',
  'questionnaire_attempts',
  'employee_onboardings',
  'regulation_options',
  'regulation_questions',
  'employee_regulations',
  'weekly_photo_submissions',
  'weekly_content_schedules',
  'challenge_participants',
  'challenges',
  'employee_report_history',
  'employee_reports',
  'disciplinary_sanctions',
  'conduct_reports',
  'interaction_ratings',
  'liquidation_audit_log',
  'liquidation_payments',
  'liquidation_debts',
  'liquidation_records',
  'employee_weekly_settlements',
  'employee_cash_payment_allocations',
  'employee_cash_payments',
  'employee_cash_obligations',
  'driver_settlements',
  'driver_shift_assignments',
  'driver_shifts',
  'trip_passengers',
  'viajes',
  'service_payments',
  'service_participants',
  'service_group_audit',
  'group_service_request_selections',
  'group_service_requests',
  'payment_receipt_validations',
  'extensiones_servicio',
  'prorrogas',
  'extras_servicio',
  'solicitudes_servicio_manual',
  'conversaciones_telegram',
  'alertas_clientes',
  'servicios',
  'loyalty_transactions',
  'client_memberships',
  'loyalty_tiers',
  'clientes',
  'push_subscriptions',
  'extras_catalogo',
  'empleada_fotos_exclusivas',
  'empleada_fotos',
  'empleadas',
  'choferes',
  'preset_service_locations',
  'authorized_bank_accounts',
  'apartments',
  'usuarios',
];

type Registro = Record<string, unknown>;

/** Inserta una fila con columnas explícitas. Nada de spreads mágicos: si una
 * columna cambia de nombre, esto tiene que romperse y no callarse. */
/**
 * Un valor para una columna `jsonb`.
 *
 * El controlador de Postgres convierte un array de JavaScript en un array de
 * Postgres --`{a,b}`-- que `jsonb` rechaza con "invalid input syntax for type
 * json". Serializarlo aqui es lo que distingue una columna `jsonb` de una
 * columna de tipo array de verdad, como `driver_shifts.days_of_week`, que si
 * tiene que viajar como array.
 */
const json = (valor: unknown): string => JSON.stringify(valor);

async function insertar(
  qr: QueryRunner,
  tabla: string,
  fila: Registro,
): Promise<void> {
  const columnas = Object.keys(fila);
  const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ');
  await qr.query(
    `INSERT INTO "${tabla}" (${columnas.map((c) => `"${c}"`).join(', ')}) VALUES (${marcadores})`,
    Object.values(fila),
  );
}

async function insertarVarias(
  qr: QueryRunner,
  tabla: string,
  filas: Registro[],
): Promise<void> {
  for (const fila of filas) await insertar(qr, tabla, fila);
}

async function tablaExiste(qr: QueryRunner, tabla: string): Promise<boolean> {
  const filas: Array<{ existe: boolean }> = await qr.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
     ) AS existe`,
    [tabla],
  );
  return Boolean(filas[0]?.existe);
}

/**
 * Borra lo sembrado y solo lo sembrado.
 *
 * Se apoya en que todo id generado empieza por el prefijo. Las tablas cuya
 * clave primaria no es un uuid propio (las de unión) se limpian por su columna
 * de referencia, que también apunta a un id sembrado.
 */
export async function limpiar(qr: QueryRunner): Promise<number> {
  let borradas = 0;
  for (const tabla of TABLAS_EN_ORDEN_DE_BORRADO) {
    if (!(await tablaExiste(qr, tabla))) continue;
    const columnas: Array<{ column_name: string }> = await qr.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND data_type = 'uuid'`,
      [tabla],
    );
    if (columnas.length === 0) continue;
    const condicion = columnas
      .map((c) => `"${c.column_name}"::text LIKE '${PREFIJO}-%'`)
      .join(' OR ');
    const resultado = await qr.query(
      `DELETE FROM "${tabla}" WHERE ${condicion}`,
    );
    borradas += Array.isArray(resultado) ? 0 : Number(resultado ?? 0);
  }
  return borradas;
}

export async function sembrar(qr: QueryRunner): Promise<void> {
  // -------------------------------------------------------------------------
  // Personas. Todas con teléfono, Telegram y grupo: son campos opcionales que
  // el panel enseña y que en una base a medias nunca se ven.
  // -------------------------------------------------------------------------
  const usuarioBase = (
    uuid: string,
    email: string,
    rol: string,
    nombre: string,
    apellido: string,
    telegram: string,
    grupo: string | null,
  ): Registro => ({
    id: uuid,
    email,
    password_hash: '$2b$10$demodemodemodemodemodemodemodemodemodemodemodemodem',
    rol,
    nombre,
    apellido,
    activo: true,
    disponible: true,
    en_jornada: rol === 'empleada' || rol === 'chofer',
    jornada_actualizada_at: horas(-3),
    telegram_chat_id: telegram,
    grupo_telegram_id: grupo,
    /*
     * Un codigo distinto por persona.
     *
     * `telegram_verification_code` lleva un indice unico parcial desde la
     * migracion `HardenTelegramLinkCode`, y aqui habia un literal fijo para
     * todos: el primer usuario entraba y el segundo reventaba la transaccion
     * entera con un 23505, asi que la siembra no habia vuelto a funcionar
     * desde entonces. Se deriva del id de Telegram, que ya es unico por
     * persona, para que siga siendo estable entre ejecuciones.
     */
    telegram_verification_code: String(
      482900 + Number(telegram.slice(-3) || 0),
    ),
    telegram_verification_expires_at: horas(2),
    telefono: '4421234567',
    created_at: dias(-120),
    last_login_at: horas(-2),
  });

  await insertarVarias(qr, 'usuarios', [
    usuarioBase(
      U.admin,
      'demo.admin@ejemplo.local',
      'admin',
      'Ana',
      'Demo Admin',
      '900000001',
      '-1009000001',
    ),
    usuarioBase(
      U.jefe1,
      'demo.jefe1@ejemplo.local',
      'jefe',
      'Beto',
      'Demo Jefe',
      '900000002',
      '-1009000002',
    ),
    usuarioBase(
      U.jefe2,
      'demo.jefe2@ejemplo.local',
      'jefe',
      'Carla',
      'Demo Jefa',
      '900000003',
      '-1009000003',
    ),
    usuarioBase(
      U.empleada1,
      'demo.modelo1@ejemplo.local',
      'empleada',
      'Daniela',
      'Demo',
      '900000004',
      null,
    ),
    usuarioBase(
      U.empleada2,
      'demo.modelo2@ejemplo.local',
      'empleada',
      'Elena',
      'Demo',
      '900000005',
      null,
    ),
    usuarioBase(
      U.empleada3,
      'demo.modelo3@ejemplo.local',
      'empleada',
      'Fabiana',
      'Demo',
      '900000006',
      null,
    ),
    usuarioBase(
      U.chofer1,
      'demo.chofer1@ejemplo.local',
      'chofer',
      'Gerardo',
      'Demo',
      '900000007',
      null,
    ),
    usuarioBase(
      U.chofer2,
      'demo.chofer2@ejemplo.local',
      'chofer',
      'Hugo',
      'Demo',
      '900000008',
      null,
    ),
  ]);

  await insertarVarias(qr, 'apartments', [
    {
      id: APTO.norte,
      nombre: 'Departamento Norte (demo)',
      direccion: 'Av. Juriquilla 1200, Querétaro',
      descripcion: 'Dos recámaras, portón eléctrico y estacionamiento techado.',
      ubicacion_lat: 20.7003,
      ubicacion_lng: -100.4472,
      created_at: dias(-90),
    },
    {
      id: APTO.centro,
      nombre: 'Departamento Centro (demo)',
      direccion: 'Av. Zaragoza 45, Centro, Querétaro',
      descripcion: 'Loft de una recámara a dos cuadras del Andador.',
      ubicacion_lat: 20.5931,
      ubicacion_lng: -100.3925,
      created_at: dias(-60),
    },
  ]);

  await insertarVarias(qr, 'authorized_bank_accounts', [
    {
      id: id(15),
      banco: 'BBVA',
      titular: 'Beto Demo Jefe',
      cuenta: '012680012345678901',
      ultimos4: '8901',
      clabe: '012680012345678901',
      alias: 'BBVA principal (demo)',
      activa: true,
      created_at: dias(-80),
      updated_at: dias(-10),
    },
    {
      id: id(16),
      banco: 'Banco Azteca',
      titular: 'Carla Demo Jefa',
      cuenta: '127180098765432109',
      ultimos4: '2109',
      clabe: '127180098765432109',
      alias: 'Azteca respaldo (demo)',
      activa: false,
      created_at: dias(-70),
      updated_at: dias(-20),
    },
  ]);

  await insertarVarias(qr, 'preset_service_locations', [
    {
      id: LUG.majestic,
      name: 'Motel Majestic (demo)',
      address: 'Prolongación Corregidora Norte 900, Querétaro',
      latitude: 20.6215,
      longitude: -100.4001,
      active: true,
      sort_order: 0,
      created_at: dias(-88),
      updated_at: dias(-12),
    },
    {
      id: LUG.montecarlo,
      name: 'Motel Montecarlo (demo)',
      address: 'Av. 5 de Febrero 210, Querétaro',
      latitude: 20.5744,
      longitude: -100.4128,
      active: true,
      sort_order: 1,
      created_at: dias(-88),
      updated_at: dias(-12),
    },
  ]);

  const empleada = (
    uuid: string,
    usuarioId: string,
    real: string,
    artistico: string,
    slug: string,
    jefeId: string,
    jefeSecundarioId: string | null,
    aptoId: string,
    precio: number,
    /*
     * `null` es un valor legitimo: la restriccion de la tabla solo admite
     * 'no_besa', 'besos' y 'besos_bien_dados', y la ausencia del dato se
     * escribe como NULL. Una de las tres modelos va sin el a proposito, para
     * poder ver como dibuja el panel ese caso.
     */
    politica: string | null,
    disponible: boolean,
    catalogo: boolean,
  ): Registro => ({
    id: uuid,
    usuario_id: usuarioId,
    nombre_real: real,
    nombre_artistico: artistico,
    slug_catalogo: slug,
    foto_perfil_url: `https://ejemplo.local/demo/${slug}/perfil.jpg`,
    descripcion:
      'Colombiana, 1.68 m, 58 kg, medidas 90-60-95. Cariñosa, conversadora y muy consentidora.',
    estilo_habla:
      'Habla pausado, usa mucho "parce" y se ríe de sus propios chistes.',
    politica_besos: politica,
    link_x: `https://x.com/demo_${slug}`,
    contact_label: 'Escríbeme por aquí',
    precio_base_hora: precio,
    disponible,
    catalogo_activo: catalogo,
    total_servicios_valorados: 0,
    promedio_calificacion: null,
    ubicacion_lat: 20.5888,
    ubicacion_lng: -100.3899,
    ultima_ubicacion_at: horas(-1),
    created_at: dias(-100),
    apartment_id: aptoId,
    jefe_id: jefeId,
    jefe_secundario_id: jefeSecundarioId,
  });

  await insertarVarias(qr, 'empleadas', [
    empleada(
      EMP.uno,
      U.empleada1,
      'Daniela Restrepo',
      'Valentina',
      'valentina-demo',
      U.jefe1,
      U.jefe2,
      APTO.norte,
      2500,
      'besos_bien_dados',
      true,
      true,
    ),
    empleada(
      EMP.dos,
      U.empleada2,
      'Elena Gómez',
      'Camila',
      'camila-demo',
      U.jefe1,
      null,
      APTO.centro,
      3000,
      'no_besa',
      true,
      true,
    ),
    empleada(
      EMP.tres,
      U.empleada3,
      'Fabiana Ortiz',
      'Salomé',
      'salome-demo',
      U.jefe2,
      U.jefe1,
      APTO.norte,
      2200,
      null,
      false,
      false,
    ),
  ]);

  const fotos: Registro[] = [];
  const exclusivas: Registro[] = [];
  [EMP.uno, EMP.dos, EMP.tres].forEach((empId, i) => {
    for (let orden = 0; orden < 3; orden += 1) {
      fotos.push({
        id: id(100 + i * 10 + orden),
        empleada_id: empId,
        url: `https://ejemplo.local/demo/${i}/publica-${orden}.jpg`,
        orden,
        created_at: dias(-95 + orden),
      });
    }
    for (let orden = 0; orden < 2; orden += 1) {
      exclusivas.push({
        id: id(140 + i * 10 + orden),
        empleada_id: empId,
        url: `https://ejemplo.local/demo/${i}/exclusiva-${orden}.jpg`,
        orden,
        created_at: dias(-94 + orden),
      });
    }
  });
  await insertarVarias(qr, 'empleada_fotos', fotos);
  await insertarVarias(qr, 'empleada_fotos_exclusivas', exclusivas);

  await insertarVarias(qr, 'extras_catalogo', [
    {
      id: id(180),
      empleada_id: EMP.uno,
      nombre: 'Oral con terminación en boca',
      precio: 1500,
      activo: true,
      es_generico: false,
      modelos_vinculadas_ids: null,
      speech_personalizado: null,
      created_at: dias(-90),
    },
    {
      id: id(181),
      empleada_id: EMP.uno,
      nombre: 'Atención a parejas',
      precio: 900,
      activo: true,
      es_generico: true,
      modelos_vinculadas_ids: null,
      speech_personalizado:
        'Los atiendo a los dos con muchísimo gusto, sin prisas y con toda la discreción.',
      created_at: dias(-90),
    },
    {
      id: id(182),
      empleada_id: EMP.uno,
      nombre: 'Trío',
      precio: 2000,
      activo: true,
      es_generico: false,
      modelos_vinculadas_ids: json([EMP.dos]),
      speech_personalizado: null,
      created_at: dias(-90),
    },
    {
      id: id(183),
      empleada_id: EMP.dos,
      nombre: 'Masaje con final feliz',
      precio: 800,
      activo: true,
      es_generico: true,
      modelos_vinculadas_ids: null,
      speech_personalizado: null,
      created_at: dias(-85),
    },
    {
      id: id(184),
      empleada_id: EMP.dos,
      nombre: 'Lencería a elegir',
      precio: 500,
      activo: false,
      es_generico: false,
      modelos_vinculadas_ids: null,
      speech_personalizado: 'Escoges tú el conjunto y te lo estreno esa noche.',
      created_at: dias(-85),
    },
    {
      id: id(185),
      empleada_id: EMP.tres,
      nombre: 'Cena previa',
      precio: 1200,
      activo: true,
      es_generico: true,
      modelos_vinculadas_ids: null,
      speech_personalizado: null,
      created_at: dias(-80),
    },
  ]);

  await insertarVarias(qr, 'choferes', [
    {
      id: CHO.uno,
      usuario_id: U.chofer1,
      nombre: 'Gerardo Demo',
      telefono: '4427654321',
      disponible: true,
      rechazos_consecutivos: 0,
      ultimo_rechazo_at: null,
      ubicacion_lat: 20.5901,
      ubicacion_lng: -100.3877,
      ultima_ubicacion_at: horas(-0.2),
      created_at: dias(-70),
      vehiculo_marca: 'Nissan',
      vehiculo_modelo: 'Versa 2021',
      vehiculo_color: 'Gris Oxford',
      vehiculo_placa: 'UAB-234-C',
    },
    {
      id: CHO.dos,
      usuario_id: U.chofer2,
      nombre: 'Hugo Demo',
      telefono: '4429876543',
      disponible: false,
      rechazos_consecutivos: 2,
      ultimo_rechazo_at: horas(-5),
      ubicacion_lat: 20.6102,
      ubicacion_lng: -100.4203,
      ultima_ubicacion_at: horas(-4),
      created_at: dias(-65),
      vehiculo_marca: 'Chevrolet',
      vehiculo_modelo: 'Aveo 2019',
      vehiculo_color: 'Blanco',
      vehiculo_placa: 'UBC-887-D',
    },
  ]);

  await insertarVarias(qr, 'clientes', [
    {
      id: CLI.uno,
      telegram_chat_id: '800000001',
      ai_calls_today: 6,
      last_ai_call_at: horas(-1),
      nombre_telegram: 'Roberto M',
      created_at: dias(-45),
      primer_contacto_at: dias(-45),
    },
    {
      id: CLI.dos,
      telegram_chat_id: '800000002',
      ai_calls_today: 0,
      last_ai_call_at: dias(-4),
      nombre_telegram: 'Luis',
      created_at: dias(-30),
      primer_contacto_at: dias(-30),
    },
    {
      id: CLI.tres,
      telegram_chat_id: '800000003',
      ai_calls_today: 14,
      last_ai_call_at: horas(-0.5),
      nombre_telegram: 'Cliente sin nombre',
      created_at: dias(-2),
      primer_contacto_at: dias(-2),
    },
  ]);

  await insertarVarias(qr, 'loyalty_tiers', [
    {
      id: TIER.plata,
      code: 'DEMO_PLATA',
      name: 'Plata (demo)',
      min_spend: 0,
      earn_rate: 1,
      active: true,
      sort_order: 90,
      created_at: dias(-100),
      updated_at: dias(-100),
    },
    {
      id: TIER.oro,
      code: 'DEMO_ORO',
      name: 'Oro (demo)',
      min_spend: 20000,
      earn_rate: 1.25,
      active: true,
      sort_order: 91,
      created_at: dias(-100),
      updated_at: dias(-100),
    },
    {
      id: TIER.platino,
      code: 'DEMO_PLATINO',
      name: 'Platino (demo)',
      min_spend: 60000,
      earn_rate: 1.5,
      active: true,
      sort_order: 92,
      created_at: dias(-100),
      updated_at: dias(-100),
    },
  ]);

  await insertarVarias(qr, 'client_memberships', [
    {
      id: id(200),
      cliente_id: CLI.uno,
      tier_id: TIER.oro,
      status: 'active',
      assignment_type: 'automatic',
      points_balance: 3250,
      lifetime_points: 9800,
      lifetime_spend: 42500,
      assigned_by_user_id: null,
      assignment_notes: null,
      joined_at: dias(-45),
      assigned_at: dias(-20),
      updated_at: dias(-1),
    },
    {
      id: id(201),
      cliente_id: CLI.dos,
      tier_id: TIER.platino,
      status: 'active',
      assignment_type: 'manual',
      points_balance: 12100,
      lifetime_points: 30400,
      lifetime_spend: 118000,
      assigned_by_user_id: U.admin,
      assignment_notes: 'Cliente de toda la vida, se le sube de nivel a mano.',
      joined_at: dias(-30),
      assigned_at: dias(-15),
      updated_at: dias(-3),
    },
    {
      id: id(202),
      cliente_id: CLI.tres,
      tier_id: TIER.plata,
      status: 'active',
      assignment_type: 'automatic',
      points_balance: 0,
      lifetime_points: 0,
      lifetime_spend: 0,
      assigned_by_user_id: null,
      assignment_notes: null,
      joined_at: dias(-2),
      assigned_at: dias(-2),
      updated_at: dias(-2),
    },
  ]);

  await insertarVarias(qr, 'loyalty_transactions', [
    {
      id: id(210),
      cliente_id: CLI.uno,
      servicio_id: null,
      created_by_user_id: null,
      type: 'earned',
      points: 3000,
      amount_basis: 3000,
      description: 'Puntos por servicio finalizado',
      created_at: dias(-10),
    },
    {
      id: id(211),
      cliente_id: CLI.uno,
      servicio_id: null,
      created_by_user_id: U.admin,
      type: 'manual_adjustment',
      points: 250,
      amount_basis: null,
      description: 'Ajuste manual por una espera larga',
      created_at: dias(-5),
    },
    {
      id: id(212),
      cliente_id: CLI.dos,
      servicio_id: null,
      created_by_user_id: U.admin,
      type: 'manual_adjustment',
      points: -1500,
      amount_basis: null,
      description: 'Canje por una hora de cortesía',
      created_at: dias(-6),
    },
  ]);

  // -------------------------------------------------------------------------
  // Servicios. Cada uno en un estado distinto: es lo que hace que las tarjetas,
  // los filtros y los colores del panel se vean todos.
  //
  // Los totales van en cero a proposito: `calcular_total_servicio` corre BEFORE
  // INSERT y los rellena. Escribirlos a mano seria inventar cifras que no
  // corresponden a las reglas de la casa.
  // -------------------------------------------------------------------------
  const servicioBase = (extra: Registro): Registro => ({
    service_type: 'individual',
    registro_manual: false,
    metodo_pago: 'efectivo',
    duracion_pactada_horas: 2,
    ubicacion_cliente_lat: 20.5931,
    ubicacion_cliente_lng: -100.3925,
    precio_base_hora_pactado: 2500,
    total_base: 0,
    total_extras: 0,
    total_final: 0,
    total_paid: 0,
    pending_balance: 0,
    transport_fee_snapshot: 500,
    manual_transport_adjustment: 0,
    total_transporte: 0,
    actual_transport_cost: 0,
    estado_liquidacion: 'cerrada',
    recordatorios_regreso: 0,
    prorrogas_usadas: 0,
    tipo_agenda: 'inmediato',
    duracion_indefinida: false,
    cobro_final_pendiente: false,
    comprobante_pendiente: false,
    notificacion_previa_enviada: false,
    ia_activa: false,
    notificacion_extension_enviada: false,
    created_at: dias(-1),
    updated_at: dias(-1),
    ...extra,
  });

  await insertarVarias(qr, 'servicios', [
    servicioBase({
      id: SRV.finalizado,
      empleada_id: EMP.uno,
      cliente_id: CLI.uno,
      jefe_id: U.jefe1,
      metodo_pago: 'transferencia',
      duracion_pactada_horas: 2,
      duracion_final_horas: 3,
      preset_location_id: LUG.majestic,
      location_name_snapshot: 'Motel Majestic (demo)',
      location_address_snapshot:
        'Prolongación Corregidora Norte 900, Querétaro',
      habitacion: 'Suite 14',
      customer_transport_charge: 0,
      actual_transport_cost: 180,
      hora_inicio_servicio: dias(-3),
      hora_fin_servicio: horas(-69),
      hora_llegada_casa: horas(-68),
      prorrogas_usadas: 1,
      estado: 'finalizado',
      calificacion: 5,
      comentarios_calificacion: 'Todo excelente, muy puntual y atenta.',
      notas: 'El cliente pidió llegar quince minutos antes.',
      notas_jefe: 'Cliente recurrente, tratar bien.',
      telegram_cliente_mensaje_id: 4411,
      telegram_empleada_mensaje_id: 4412,
      telegram_resumen_definitivo_id: 4413,
      cliente_telegram_id: '800000001',
      telegram_thread_id: 77,
      created_at: dias(-3),
      updated_at: horas(-68),
    }),
    servicioBase({
      id: SRV.enCurso,
      empleada_id: EMP.dos,
      cliente_id: CLI.dos,
      jefe_id: U.jefe1,
      metodo_pago: 'mixto',
      precio_base_hora_pactado: 3000,
      duracion_pactada_horas: 1,
      customer_transport_charge: 500,
      hora_inicio_servicio: horas(-0.6),
      hora_fin_servicio: null,
      estado: 'en_curso',
      estado_liquidacion: 'transporte_pendiente',
      habitacion: '203',
      notas: 'Domicilio particular, portón negro.',
      cliente_telegram_id: '800000002',
      ia_activa: true,
      proximo_recordatorio_regreso_at: horas(0.4),
      created_at: horas(-2),
      updated_at: horas(-0.6),
    }),
    servicioBase({
      id: SRV.agendado,
      empleada_id: EMP.uno,
      cliente_id: CLI.tres,
      jefe_id: U.jefe2,
      metodo_pago: 'tarjeta',
      duracion_pactada_horas: 4,
      estado: 'agendado',
      tipo_agenda: 'programado',
      fecha_programada: dias(2),
      hora_inicio_estimada: dias(2),
      hora_disponibilidad_estimada: dias(2),
      preset_location_id: LUG.montecarlo,
      location_name_snapshot: 'Motel Montecarlo (demo)',
      location_address_snapshot: 'Av. 5 de Febrero 210, Querétaro',
      customer_transport_charge: 0,
      notas_jefe: 'Confirmar el día anterior.',
      // No es una fecha: guarda con que se traslada, 'chofer' o 'uber'.
      transporte_agendado: 'chofer',
      created_at: horas(-20),
      updated_at: horas(-20),
    }),
    servicioBase({
      id: SRV.pendiente,
      empleada_id: EMP.dos,
      cliente_id: CLI.tres,
      jefe_id: U.jefe1,
      estado: 'pendiente',
      comprobante_pendiente: true,
      metodo_pago: 'transferencia',
      customer_transport_charge: 500,
      espera_expira_at: horas(0.5),
      cliente_telegram_id: '800000003',
      ia_activa: true,
      created_at: horas(-1),
      updated_at: horas(-1),
    }),
    servicioBase({
      id: SRV.cancelado,
      empleada_id: EMP.tres,
      cliente_id: CLI.dos,
      jefe_id: U.jefe2,
      precio_base_hora_pactado: 2200,
      estado: 'cancelado',
      motivo_cancelacion: 'cliente_no_responde',
      nota_cancelacion:
        'Se le marcó tres veces y nunca contestó; el Uber ya iba en camino.',
      cancelado_por_user_id: U.jefe2,
      cancelado_at: dias(-2),
      customer_transport_charge: 500,
      actual_transport_cost: 145,
      created_at: dias(-2),
      updated_at: dias(-2),
    }),
    servicioBase({
      id: SRV.manual,
      empleada_id: EMP.uno,
      cliente_id: null,
      cliente_nombre_libre: 'Cliente de mostrador (demo)',
      registro_manual: true,
      jefe_id: U.jefe1,
      estado: 'finalizado',
      duracion_final_horas: 1,
      duracion_pactada_horas: 1,
      metodo_pago: 'efectivo',
      hora_inicio_servicio: dias(-6),
      hora_fin_servicio: horas(-143),
      cerrado_por_oficina_user_id: U.admin,
      cerrado_por_oficina_at: horas(-142),
      motivo_cierre_oficina: 'La modelo no cerró el servicio desde su portal.',
      calificacion: 4,
      comentarios_calificacion: 'Bien, aunque llegó algo tarde.',
      created_at: dias(-6),
      updated_at: horas(-142),
    }),
    servicioBase({
      id: SRV.indefinido,
      empleada_id: EMP.dos,
      cliente_id: CLI.uno,
      jefe_id: U.jefe1,
      precio_base_hora_pactado: 3000,
      duracion_indefinida: true,
      duracion_pactada_horas: 1,
      estado: 'en_curso',
      cobro_final_pendiente: true,
      metodo_pago: 'transferencia',
      hora_inicio_servicio: horas(-2.5),
      customer_transport_charge: 500,
      cliente_telegram_id: '800000001',
      created_at: horas(-3),
      updated_at: horas(-2.5),
    }),
    servicioBase({
      id: SRV.grupal,
      service_type: 'grupal',
      empleada_id: EMP.uno,
      cliente_id: CLI.dos,
      jefe_id: U.jefe1,
      duracion_pactada_horas: 3,
      estado: 'agendado',
      tipo_agenda: 'programado',
      fecha_programada: dias(1),
      customer_transport_charge: 500,
      notas: 'Dos modelos, cumpleaños.',
      created_at: horas(-30),
      updated_at: horas(-30),
    }),
  ]);

  // Reasignación: campos que solo se llenan cuando una modelo entra por otra.
  await qr.query(
    `UPDATE "servicios"
        SET "empleada_anterior_id" = $1, "reasignado_por_user_id" = $2,
            "reasignado_at" = $3, "motivo_reasignacion" = $4
      WHERE "id" = $5`,
    [
      EMP.tres,
      U.jefe1,
      dias(-1),
      'La modelo original se enfermó.',
      SRV.agendado,
    ],
  );
  // Cadena de citas: un servicio que nace enganchado al anterior.
  await qr.query(
    `UPDATE "servicios" SET "servicio_previo_id" = $1 WHERE "id" = $2`,
    [SRV.finalizado, SRV.agendado],
  );

  await insertarVarias(qr, 'extras_servicio', [
    {
      id: id(220),
      servicio_id: SRV.finalizado,
      extra_catalogo_id: id(180),
      participant_id: null,
      precio_cobrado: 1500,
      metodo_pago: 'efectivo',
      registrado_at: horas(-70),
    },
    {
      id: id(221),
      servicio_id: SRV.finalizado,
      extra_catalogo_id: id(181),
      participant_id: null,
      precio_cobrado: 900,
      metodo_pago: 'tarjeta',
      registrado_at: horas(-70),
    },
    {
      id: id(222),
      servicio_id: SRV.manual,
      extra_catalogo_id: id(180),
      participant_id: null,
      precio_cobrado: 1500,
      metodo_pago: 'efectivo',
      registrado_at: horas(-143),
    },
  ]);

  await insertarVarias(qr, 'prorrogas', [
    {
      id: id(230),
      servicio_id: SRV.finalizado,
      numero_prorroga: 1,
      minutos_solicitados: 30,
      solicitada_at: horas(-70),
      aprobada: true,
    },
    {
      id: id(231),
      servicio_id: SRV.enCurso,
      numero_prorroga: 1,
      minutos_solicitados: 20,
      solicitada_at: horas(-0.3),
      aprobada: false,
    },
  ]);

  await insertarVarias(qr, 'extensiones_servicio', [
    {
      id: id(240),
      servicio_id: SRV.finalizado,
      horas_agregadas: 1,
      monto_agregado: 2500,
      aceptada_por: 'cliente',
      registrada_at: horas(-70),
    },
  ]);

  await insertarVarias(qr, 'payment_receipt_validations', [
    {
      id: id(250),
      fecha_recepcion: dias(-3),
      hora_recepcion: '22:14:00',
      cliente_telegram: 'Roberto M',
      chat_id: '800000001',
      image_url: 'https://ejemplo.local/demo/comprobante-1.jpg',
      telegram_file_id: 'AgACAgEAAxkBAAIDEMO1',
      es_comprobante: true,
      banco_origen: 'BBVA',
      banco_destino: 'BBVA',
      titular_destino: 'Beto Demo Jefe',
      cuenta_destino: '8901',
      clabe: '012680012345678901',
      monto: 7400,
      fecha_transferencia: '06/09/2026',
      hora_transferencia: '22:11:00',
      referencia: '0012345',
      folio: 'FOL-99213',
      id_spei: '2024090612345678',
      concepto: 'Pago servicio',
      confianza: 97,
      estado: 'aprobado',
      observaciones: 'Coincide con el total esperado.',
      json_ia: json({ modelo: 'demo', campos_detectados: 12 }),
      servicio_id: SRV.finalizado,
      jefe_id: U.jefe1,
      revisado_por_user_id: U.jefe1,
      revisado_at: dias(-3),
      draft_payload: null,
      created_at: dias(-3),
      updated_at: dias(-3),
    },
    {
      id: id(251),
      fecha_recepcion: horas(-1),
      hora_recepcion: '23:40:00',
      cliente_telegram: 'Cliente sin nombre',
      chat_id: '800000003',
      image_url: 'https://ejemplo.local/demo/comprobante-2.jpg',
      telegram_file_id: 'AgACAgEAAxkBAAIDEMO2',
      es_comprobante: false,
      banco_origen: null,
      banco_destino: null,
      titular_destino: null,
      cuenta_destino: null,
      clabe: null,
      monto: null,
      fecha_transferencia: null,
      hora_transferencia: null,
      referencia: null,
      folio: null,
      id_spei: null,
      concepto: null,
      confianza: 21,
      estado: 'rechazado',
      observaciones:
        'La imagen es una captura de la pantalla de inicio, no un comprobante.',
      json_ia: json({ modelo: 'demo', campos_detectados: 0 }),
      servicio_id: SRV.pendiente,
      jefe_id: U.jefe1,
      revisado_por_user_id: null,
      revisado_at: null,
      draft_payload: json({ duracion: 2, pago: 'transferencia' }),
      created_at: horas(-1),
      updated_at: horas(-1),
    },
  ]);

  // -------------------------------------------------------------------------
  // Transporte. Un servicio con ida y regreso cerrados, uno con la ida en curso
  // y uno cancelado con costo, que es el caso que alimenta la pantalla de ubers
  // pendientes.
  // -------------------------------------------------------------------------
  await insertarVarias(qr, 'viajes', [
    {
      id: id(260),
      servicio_id: SRV.finalizado,
      chofer_id: CHO.uno,
      oferta_expira_en: horas(-72),
      tipo: 'ida',
      unit_number: 1,
      zona: 'montecarlo',
      tarifa: 180,
      estado: 'finalizado',
      proveedor_transporte: 'chofer',
      driver_payout: 120,
      fare_confirmed_at: horas(-68),
      fare_confirmed_by_user_id: U.jefe1,
      fare_confirmation_override: false,
      cancelado_con_costo: false,
      costo_cobrado_al_cliente: false,
      hora_notificacion: dias(-3),
      hora_aceptacion: dias(-3),
      hora_inicio_viaje: dias(-3),
      hora_fin_viaje: horas(-71),
      choferes_notificados: json([CHO.uno, CHO.dos]),
      telegram_chofer_msg_oferta_id: 5001,
      telegram_empleada_msg_chofer_camino_id: 5002,
      telegram_empleada_msg_chofer_llegado_id: 5003,
    },
    {
      id: id(261),
      servicio_id: SRV.finalizado,
      chofer_id: CHO.dos,
      tipo: 'regreso',
      unit_number: 1,
      zona: 'domicilio',
      tarifa: 160,
      estado: 'finalizado',
      proveedor_transporte: 'uber',
      telegram_uber_file_id: 'AgACAgEAAxkBAAIDEMO3',
      uber_screenshot_url: 'https://ejemplo.local/demo/uber-1.jpg',
      uber_screenshot_uploaded_at: horas(-67),
      driver_payout: 0,
      fare_confirmed_at: horas(-67),
      fare_confirmed_by_user_id: U.admin,
      fare_confirmation_override: true,
      cancelado_con_costo: false,
      costo_cobrado_al_cliente: false,
      hora_notificacion: horas(-69),
      hora_aceptacion: horas(-69),
      hora_inicio_viaje: horas(-68.5),
      hora_fin_viaje: horas(-68),
      choferes_notificados: json([CHO.dos]),
    },
    {
      id: id(262),
      servicio_id: SRV.enCurso,
      chofer_id: CHO.uno,
      tipo: 'ida',
      unit_number: 1,
      zona: 'majestic',
      tarifa: 150,
      estado: 'en_curso',
      proveedor_transporte: 'chofer',
      driver_payout: 100,
      fare_confirmation_override: false,
      cancelado_con_costo: false,
      costo_cobrado_al_cliente: false,
      hora_notificacion: horas(-1.2),
      hora_aceptacion: horas(-1.1),
      hora_inicio_viaje: horas(-1),
      choferes_notificados: json([CHO.uno]),
    },
    {
      id: id(263),
      servicio_id: SRV.cancelado,
      chofer_id: CHO.dos,
      tipo: 'ida',
      unit_number: 1,
      zona: 'montecarlo',
      tarifa: 145,
      estado: 'cancelado',
      proveedor_transporte: 'uber',
      telegram_uber_file_id: 'AgACAgEAAxkBAAIDEMO4',
      uber_screenshot_url: 'https://ejemplo.local/demo/uber-2.jpg',
      uber_screenshot_uploaded_at: dias(-2),
      driver_payout: 0,
      fare_confirmation_override: false,
      cancelado_con_costo: true,
      costo_cobrado_al_cliente: false,
      corregido_por_user_id: U.admin,
      corregido_at: dias(-2),
      motivo_correccion: 'La tarifa capturada no coincidía con la del recibo.',
      chofer_anterior_id: CHO.uno,
      hora_notificacion: dias(-2),
      hora_aceptacion: dias(-2),
      choferes_notificados: json([CHO.uno, CHO.dos]),
    },
  ]);

  await insertarVarias(qr, 'trip_passengers', [
    { id: id(270), trip_id: id(260), employee_id: EMP.uno },
    { id: id(271), trip_id: id(261), employee_id: EMP.uno },
  ]);

  await insertarVarias(qr, 'driver_shifts', [
    {
      id: id(280),
      title: 'Turno nocturno (demo)',
      starts_at: '20:00',
      ends_at: '04:00',
      days_of_week: [1, 2, 3, 4, 5],
      capacity: 2,
      active: true,
      created_by_user_id: U.admin,
      created_at: dias(-40),
    },
    {
      id: id(281),
      title: 'Fin de semana (demo)',
      starts_at: '12:00',
      ends_at: '23:59',
      days_of_week: [6, 0],
      capacity: 1,
      active: false,
      created_by_user_id: U.admin,
      created_at: dias(-40),
    },
  ]);
  await insertarVarias(qr, 'driver_shift_assignments', [
    {
      id: id(285),
      shift_id: id(280),
      driver_id: CHO.uno,
      created_at: dias(-40),
    },
    {
      id: id(286),
      shift_id: id(280),
      driver_id: CHO.dos,
      created_at: dias(-40),
    },
    {
      id: id(287),
      shift_id: id(281),
      driver_id: CHO.uno,
      created_at: dias(-40),
    },
  ]);

  const lunes = lunesDeEstaSemana();
  const domingo = new Date(lunes.getTime() + 6 * 24 * 60 * 60 * 1000);
  await insertarVarias(qr, 'driver_settlements', [
    {
      id: id(290),
      driver_id: CHO.uno,
      week_start: lunes,
      week_end: domingo,
      total: 120,
      status: 'pending',
      paid_at: null,
      paid_by_user_id: null,
      created_at: dias(-1),
      updated_at: dias(-1),
    },
    {
      id: id(291),
      driver_id: CHO.dos,
      week_start: new Date(lunes.getTime() - 7 * 24 * 60 * 60 * 1000),
      week_end: new Date(domingo.getTime() - 7 * 24 * 60 * 60 * 1000),
      total: 640,
      status: 'paid',
      paid_at: dias(-3),
      paid_by_user_id: U.admin,
      created_at: dias(-8),
      updated_at: dias(-3),
    },
  ]);

  // -------------------------------------------------------------------------
  // Dinero: lo que la modelo debe entregar y lo que ya abonó.
  // -------------------------------------------------------------------------
  await insertarVarias(qr, 'employee_cash_obligations', [
    {
      id: id(300),
      service_id: SRV.finalizado,
      employee_id: EMP.uno,
      amount: 4200,
      paid_amount: 2000,
      status: 'pending',
      calculation_status: 'ready',
      pending_reason: null,
      customer_total: 8900,
      uber_deduction: 180,
      service_date: dias(-3),
      created_at: dias(-3),
      updated_at: dias(-1),
    },
    {
      id: id(301),
      service_id: SRV.manual,
      employee_id: EMP.uno,
      amount: 2600,
      paid_amount: 2600,
      status: 'paid',
      calculation_status: 'paid',
      pending_reason: null,
      customer_total: 4000,
      uber_deduction: 0,
      service_date: dias(-6),
      created_at: dias(-6),
      updated_at: dias(-5),
    },
    {
      id: id(302),
      service_id: SRV.enCurso,
      employee_id: EMP.dos,
      amount: 0,
      paid_amount: 0,
      status: 'pending',
      calculation_status: 'provisional',
      pending_reason:
        'El servicio sigue en curso y el transporte de regreso no está cerrado.',
      customer_total: 3500,
      uber_deduction: 0,
      service_date: ahora,
      created_at: horas(-2),
      updated_at: horas(-2),
    },
  ]);
  await insertarVarias(qr, 'employee_cash_payments', [
    {
      id: id(310),
      employee_id: EMP.uno,
      amount: 2000,
      note: 'Abono parcial entregado en el departamento.',
      registered_by_user_id: U.jefe1,
      origin: 'manual',
      created_at: dias(-1),
      reverted_at: null,
      reverted_by_user_id: null,
      reverted_reason: null,
    },
    {
      id: id(311),
      employee_id: EMP.uno,
      amount: 2600,
      note: 'Entrega completa del servicio de mostrador.',
      registered_by_user_id: U.jefe1,
      origin: 'manual',
      created_at: dias(-5),
      reverted_at: null,
      reverted_by_user_id: null,
      reverted_reason: null,
    },
    {
      id: id(312),
      employee_id: EMP.dos,
      amount: 500,
      note: 'Abono capturado por error.',
      registered_by_user_id: U.jefe1,
      origin: 'manual',
      created_at: dias(-2),
      reverted_at: dias(-2),
      reverted_by_user_id: U.admin,
      reverted_reason: 'Se registró en la modelo equivocada.',
    },
  ]);

  await insertarVarias(qr, 'liquidation_records', [
    {
      id: id(320),
      service_id: SRV.finalizado,
      employee_id: EMP.uno,
      registered_by_user_id: U.jefe1,
      source_role: 'jefe',
      occurred_at: dias(-3),
      service_total: 8900,
      payment_method: 'transferencia',
      cash_amount: 0,
      card_amounts: json([900]),
      company_percentage: 50,
      extra_amount: 2400,
      promotion: 0,
      membership_amount: 0,
      company_transport_expense: 180,
      customer_transport_charge: 0,
      employee_uber_reimbursement: 0,
      employee_cash_due: 4200,
      electronic_extra_amount: 900,
      card_extra_amount: 900,
      transport_excess: 0,
      place: 'Motel Majestic (demo)',
      has_outbound_driver: true,
      has_return_driver: true,
      cancelled: false,
      is_fine: false,
      fine_amount: 0,
      created_at: dias(-3),
      updated_at: dias(-3),
    },
    {
      id: id(321),
      service_id: null,
      employee_id: EMP.tres,
      registered_by_user_id: U.admin,
      source_role: 'admin',
      occurred_at: dias(-4),
      service_total: 0,
      payment_method: 'efectivo',
      cash_amount: 0,
      card_amounts: json([]),
      company_percentage: 0,
      extra_amount: 0,
      promotion: 0,
      membership_amount: 0,
      company_transport_expense: 0,
      customer_transport_charge: 0,
      employee_uber_reimbursement: 0,
      employee_cash_due: 0,
      electronic_extra_amount: 0,
      card_extra_amount: 0,
      transport_excess: 0,
      place: null,
      has_outbound_driver: false,
      has_return_driver: false,
      cancelled: false,
      is_fine: true,
      fine_amount: 300,
      created_at: dias(-4),
      updated_at: dias(-4),
    },
  ]);
  await insertarVarias(qr, 'liquidation_debts', [
    {
      id: id(330),
      employee_id: EMP.uno,
      amount: 1800,
      description: 'Adelanto de quincena',
      status: 'pending',
      created_by_user_id: U.admin,
      created_at: dias(-14),
      updated_at: dias(-7),
      deleted_at: null,
    },
    {
      id: id(331),
      employee_id: EMP.dos,
      amount: 600,
      description: 'Lencería que pidió a cuenta',
      status: 'paid',
      created_by_user_id: U.jefe1,
      created_at: dias(-21),
      updated_at: dias(-9),
      deleted_at: null,
    },
  ]);
  await insertarVarias(qr, 'liquidation_payments', [
    {
      id: id(340),
      debt_id: id(330),
      amount: 900,
      note: 'Primer abono descontado de la semana.',
      created_by_user_id: U.admin,
      created_at: dias(-7),
      deleted_at: null,
    },
    {
      id: id(341),
      debt_id: id(331),
      amount: 600,
      note: 'Liquidada completa.',
      created_by_user_id: U.jefe1,
      created_at: dias(-9),
      deleted_at: null,
    },
  ]);
  await insertarVarias(qr, 'employee_weekly_settlements', [
    {
      id: id(350),
      employee_id: EMP.uno,
      week_start: lunes,
      week_end: domingo,
      gross_employee_pay: 6800,
      cash_offset: 4200,
      net_employee_pay: 2600,
      remaining_cash_debt: 2200,
      confirmed_by_user_id: U.admin,
      confirmed_at: dias(-1),
    },
  ]);
  await insertarVarias(qr, 'liquidation_audit_log', [
    {
      id: id(360),
      entity_type: 'liquidation_debt',
      entity_id: id(330),
      action: 'payment_registered',
      actor_user_id: U.admin,
      before_value: json({ amount: 1800, status: 'pending' }),
      after_value: json({ amount: 1800, status: 'pending', paid: 900 }),
      created_at: dias(-7),
    },
  ]);

  // -------------------------------------------------------------------------
  // Calidad del servicio: calificaciones, reportes, conducta y sanciones.
  // -------------------------------------------------------------------------
  await insertarVarias(qr, 'interaction_ratings', [
    {
      id: id(370),
      direction: 'client_to_employee',
      service_id: SRV.finalizado,
      trip_id: null,
      client_id: CLI.uno,
      employee_id: EMP.uno,
      driver_id: null,
      stars: 5,
      comment: 'Muy atenta y puntual.',
      created_at: horas(-67),
      appeal_status: 'none',
      appeal_reason: null,
      appeal_resolved_at: null,
      appeal_resolved_by_user_id: null,
    },
    {
      id: id(371),
      direction: 'employee_to_driver',
      service_id: SRV.finalizado,
      trip_id: id(260),
      client_id: null,
      employee_id: EMP.uno,
      driver_id: CHO.uno,
      stars: 4,
      comment: 'Buen trato, aunque tardó en llegar.',
      created_at: horas(-67),
      appeal_status: 'none',
      appeal_reason: null,
      appeal_resolved_at: null,
      appeal_resolved_by_user_id: null,
    },
    {
      id: id(372),
      direction: 'employee_to_client',
      service_id: SRV.manual,
      trip_id: null,
      client_id: CLI.dos,
      employee_id: EMP.uno,
      driver_id: null,
      stars: 2,
      comment: 'Insistió en pasarse del tiempo pactado.',
      created_at: horas(-142),
      appeal_status: 'resolved',
      appeal_reason: 'La modelo pidió revisar la calificación.',
      appeal_resolved_at: horas(-140),
      appeal_resolved_by_user_id: U.admin,
    },
  ]);

  await insertarVarias(qr, 'employee_reports', [
    {
      id: id(380),
      service_id: SRV.finalizado,
      employee_id: EMP.uno,
      boss_id: U.jefe1,
      origin: 'chofer',
      client_id: null,
      driver_id: CHO.uno,
      reporter_key: 'empleada',
      category: 'demora_impuntualidad',
      description: 'El chofer llegó veinte minutos tarde a la recogida.',
      priority: 'normal',
      status: 'resuelto',
      assigned_admin_id: U.admin,
      resolution: 'Se habló con el chofer y se le descontó la espera.',
      resolved_at: horas(-60),
      created_at: horas(-66),
      updated_at: horas(-60),
    },
    {
      id: id(381),
      service_id: SRV.enCurso,
      employee_id: EMP.dos,
      boss_id: U.jefe1,
      origin: 'cliente',
      client_id: CLI.dos,
      driver_id: null,
      reporter_key: 'empleada',
      category: 'trato_inadecuado',
      description: 'El cliente está tomando de más y se pone insistente.',
      priority: 'alta',
      status: 'nuevo',
      assigned_admin_id: null,
      resolution: null,
      resolved_at: null,
      created_at: horas(-0.4),
      updated_at: horas(-0.4),
    },
  ]);
  await insertarVarias(qr, 'employee_report_history', [
    {
      id: id(385),
      report_id: id(380),
      actor_user_id: U.admin,
      action: 'asignado',
      metadata: json({ admin: 'Ana Demo Admin' }),
      note: 'Lo tomo yo.',
      created_at: horas(-64),
    },
    {
      id: id(386),
      report_id: id(380),
      actor_user_id: U.admin,
      action: 'resuelto',
      metadata: null,
      note: 'Cerrado tras hablar con el chofer.',
      created_at: horas(-60),
    },
  ]);

  await insertarVarias(qr, 'conduct_reports', [
    {
      id: id(390),
      direction: 'employee_to_client',
      reporter_type: 'employee',
      reporter_id: EMP.uno,
      subject_type: 'client',
      subject_id: CLI.dos,
      service_id: SRV.manual,
      trip_id: null,
      category: 'trato_inadecuado',
      description: 'Se puso grosero cuando se le avisó que la hora terminaba.',
      priority: 'alta',
      status: 'cerrado',
      outcome: 'confirmado',
      assigned_admin_id: U.admin,
      resolution: 'Se le levantó una sanción de una semana.',
      history: json([
        { accion: 'creado', at: dias(-6) },
        { accion: 'resuelto', at: dias(-5) },
      ]),
      created_at: dias(-6),
      updated_at: dias(-5),
    },
  ]);
  await insertarVarias(qr, 'disciplinary_sanctions', [
    {
      id: id(395),
      subject_type: 'client',
      subject_id: CLI.dos,
      type: 'suspension',
      fine_amount: null,
      status: 'active',
      reason: 'Trato grosero hacia la modelo.',
      conduct_report_id: id(390),
      created_by_user_id: U.admin,
      starts_at: dias(-5),
      ends_at: dias(2),
      revoked_by_user_id: null,
      revoked_at: null,
      revocation_reason: null,
      created_at: dias(-5),
    },
    {
      id: id(396),
      subject_type: 'employee',
      subject_id: EMP.tres,
      type: 'fine',
      fine_amount: 300,
      status: 'revoked',
      reason: 'No entregó el contenido semanal.',
      conduct_report_id: null,
      created_by_user_id: U.admin,
      starts_at: dias(-4),
      ends_at: null,
      revoked_by_user_id: U.admin,
      revoked_at: dias(-3),
      revocation_reason: 'Presentó incapacidad médica.',
      created_at: dias(-4),
    },
  ]);

  await insertarVarias(qr, 'alertas_clientes', [
    {
      id: id(400),
      cliente_id: CLI.tres,
      servicio_id: SRV.pendiente,
      mensaje_original: 'Llevo media hora esperando y nadie me dice nada.',
      emocion_detectada: 'negativo',
      score_sentimiento: 2,
      atendida: false,
      atendida_at: null,
      created_at: horas(-0.7),
    },
    {
      id: id(401),
      cliente_id: CLI.uno,
      servicio_id: SRV.finalizado,
      mensaje_original: 'Todo salió excelente, muchas gracias.',
      emocion_detectada: 'positivo',
      score_sentimiento: 5,
      atendida: true,
      atendida_at: horas(-66),
      created_at: horas(-67),
    },
  ]);

  // Conversación completa, que es lo que alimenta la bitácora y el monitor.
  const guion: Array<[string, string]> = [
    ['ia', 'Hola amor, aquí ando disponible. Mi hora está en $2,500.'],
    ['cliente', 'Hola, qué incluye?'],
    [
      'ia',
      'La hora completa conmigo, con besos si vienes bien aseadito. Aparte manejo algunos extras.',
    ],
    ['cliente', 'Cuánto es en total con el transporte?'],
    [
      'ia',
      'Por una hora serían $2,500 más $500 del transporte hasta donde estés.',
    ],
    ['cliente', 'Va, mándame ubicación de tus moteles'],
    ['ia', 'Atiendo en Majestic y en Montecarlo, los dos aquí en Querétaro.'],
    ['cliente', 'Perfecto, el Majestic entonces'],
  ];
  await insertarVarias(
    qr,
    'conversaciones_telegram',
    guion.map((linea, i) => ({
      id: id(410 + i),
      cliente_id: CLI.uno,
      servicio_id: SRV.finalizado,
      booking_session_id: id(600),
      group_request_id: null,
      emisor: linea[0],
      mensaje: linea[1],
      ia_activa: true,
      enviado_at: new Date(dias(-3).getTime() + i * 90 * 1000),
    })),
  );

  await insertarVarias(qr, 'solicitudes_servicio_manual', [
    {
      id: id(430),
      tipo: 'alta',
      empleada_id: EMP.uno,
      jefe_id: U.jefe1,
      cliente_id: null,
      cliente_nombre_libre: 'Cliente de mostrador (demo)',
      fecha_servicio: dias(-6),
      duracion_horas: 1,
      metodo_pago: 'efectivo',
      monto_cobrado: 4000,
      ubicacion: 'Motel Majestic (demo)',
      motivo: 'El cliente llegó directo al motel sin pasar por el bot.',
      estado: 'aprobada',
      servicio_id: SRV.manual,
      nota_resolucion: 'Aprobada, coincide con lo que reportó la modelo.',
      resuelto_por_user_id: U.admin,
      resuelto_at: dias(-6),
      created_at: dias(-6),
    },
    {
      id: id(431),
      tipo: 'correccion',
      empleada_id: EMP.dos,
      jefe_id: U.jefe1,
      cliente_id: CLI.dos,
      cliente_nombre_libre: null,
      fecha_servicio: dias(-2),
      duracion_horas: 2,
      metodo_pago: 'tarjeta',
      monto_cobrado: 6000,
      ubicacion: 'Domicilio del cliente',
      motivo: 'Se capturó una hora de menos.',
      estado: 'pendiente',
      servicio_id: null,
      nota_resolucion: null,
      resuelto_por_user_id: null,
      resuelto_at: null,
      created_at: dias(-2),
    },
  ]);

  // -------------------------------------------------------------------------
  // Servicios grupales.
  // -------------------------------------------------------------------------
  await insertarVarias(qr, 'group_service_requests', [
    {
      id: id(440),
      client_id: CLI.dos,
      boss_id: U.jefe1,
      initial_employee_id: EMP.uno,
      service_id: SRV.grupal,
      booking_session_id: id(601),
      status: 'confirmada',
      duration_hours: 3,
      payment_method: 'efectivo',
      location_lat: 20.5931,
      location_lng: -100.3925,
      location_reference: 'Casa particular, portón negro',
      catalog_version: 1,
      hold_expires_at: horas(4),
      ai_active: false,
      telegram_thread_id: 88,
      created_at: horas(-30),
      updated_at: horas(-28),
    },
  ]);
  await insertarVarias(qr, 'group_service_request_selections', [
    {
      id: id(445),
      request_id: id(440),
      employee_id: EMP.uno,
      status: 'confirmada',
      selected_by: 'cliente',
      hourly_rate_snapshot: 2500,
      expires_at: horas(4),
      created_at: horas(-30),
      updated_at: horas(-29),
    },
    {
      id: id(446),
      request_id: id(440),
      employee_id: EMP.dos,
      status: 'confirmada',
      selected_by: 'jefe',
      hourly_rate_snapshot: 3000,
      expires_at: horas(4),
      created_at: horas(-30),
      updated_at: horas(-29),
    },
  ]);
  await insertarVarias(qr, 'service_participants', [
    {
      id: id(450),
      service_id: SRV.grupal,
      employee_id: EMP.uno,
      role: 'responsable',
      status: 'activa',
      hourly_rate_snapshot: 2500,
      billable_hours: 3,
      confirmed_subtotal: 7500,
      hold_expires_at: null,
      joined_at: horas(-29),
      removed_at: null,
      created_at: horas(-30),
      updated_at: horas(-29),
    },
    {
      id: id(451),
      service_id: SRV.grupal,
      employee_id: EMP.dos,
      role: 'participante',
      status: 'activa',
      hourly_rate_snapshot: 3000,
      billable_hours: 3,
      confirmed_subtotal: 9000,
      hold_expires_at: null,
      joined_at: horas(-29),
      removed_at: null,
      created_at: horas(-30),
      updated_at: horas(-29),
    },
  ]);
  await insertarVarias(qr, 'service_payments', [
    {
      id: id(455),
      service_id: SRV.grupal,
      receipt_validation_id: null,
      approved_by_user_id: U.jefe1,
      amount: 5000,
      status: 'aprobado',
      fingerprint: 'demo-fp-0001',
      notes: 'Anticipo en efectivo.',
      created_at: horas(-28),
    },
  ]);
  await insertarVarias(qr, 'service_group_audit', [
    {
      id: id(460),
      service_id: SRV.grupal,
      request_id: id(440),
      actor_user_id: U.jefe1,
      action: 'participante_agregado',
      before: null,
      after: json({ empleada: 'Camila' }),
      reason: 'El cliente pidió una segunda chica.',
      created_at: horas(-29),
    },
  ]);

  // -------------------------------------------------------------------------
  // Retos, contenido semanal, onboarding y candidatas.
  // -------------------------------------------------------------------------
  await insertarVarias(qr, 'challenges', [
    {
      id: id(470),
      title: 'Más servicios de la semana (demo)',
      participant_type: 'empleada',
      metric: 'servicios',
      status: 'activo',
      starts_at: lunes,
      ends_at: domingo,
      created_by_user_id: U.admin,
      winner_participant_id: null,
      winner_value: null,
      finished_at: null,
      cancelled_at: null,
      created_at: dias(-7),
    },
    {
      id: id(471),
      title: 'Mejor calificación del mes (demo)',
      participant_type: 'empleada',
      metric: 'calificacion',
      status: 'finalizado',
      starts_at: dias(-37),
      ends_at: dias(-7),
      created_by_user_id: U.admin,
      winner_participant_id: EMP.uno,
      winner_value: 4.9,
      finished_at: dias(-7),
      cancelled_at: null,
      created_at: dias(-37),
    },
  ]);
  await insertarVarias(qr, 'challenge_participants', [
    {
      id: id(475),
      challenge_id: id(470),
      participant_id: EMP.uno,
      created_at: dias(-7),
    },
    {
      id: id(476),
      challenge_id: id(470),
      participant_id: EMP.dos,
      created_at: dias(-7),
    },
    {
      id: id(477),
      challenge_id: id(471),
      participant_id: EMP.uno,
      created_at: dias(-37),
    },
  ]);

  await insertarVarias(qr, 'weekly_content_schedules', [
    {
      id: id(480),
      empleada_id: EMP.uno,
      semana_inicio: lunes,
      estado: 'entregado',
      solicitado_at: lunes,
      recordatorio_at: dias(-2),
      recordatorios_enviados: 1,
      falta_at: null,
      multa_aplicada_at: null,
      multa_liquidation_record_id: null,
      entregado_at: dias(-1),
    },
    {
      id: id(481),
      empleada_id: EMP.tres,
      semana_inicio: lunes,
      estado: 'falta',
      solicitado_at: lunes,
      recordatorio_at: dias(-2),
      recordatorios_enviados: 3,
      falta_at: dias(-1),
      multa_aplicada_at: dias(-1),
      multa_liquidation_record_id: id(321),
      entregado_at: null,
    },
  ]);
  await insertarVarias(qr, 'weekly_photo_submissions', [
    {
      id: id(485),
      empleada_id: EMP.uno,
      url: 'https://ejemplo.local/demo/semanal-1.jpg',
      estado: 'aprobada',
      semana_inicio: lunes,
      revisado_por_user_id: U.admin,
      motivo_rechazo: null,
      revisado_at: dias(-1),
      created_at: dias(-1),
    },
    {
      id: id(486),
      empleada_id: EMP.dos,
      url: 'https://ejemplo.local/demo/semanal-2.jpg',
      estado: 'rechazada',
      semana_inicio: lunes,
      revisado_por_user_id: U.admin,
      motivo_rechazo: 'Se ve el rostro; se pidió que la repitiera.',
      revisado_at: dias(-1),
      created_at: dias(-2),
    },
  ]);

  await insertarVarias(qr, 'employee_regulations', [
    {
      id: id(490),
      target_role: 'empleada',
      title: 'Reglamento de modelos (demo)',
      content:
        'Puntualidad, discreción y trato respetuoso. El servicio se cierra siempre desde el portal.',
      passing_score: 80,
      publication_key: id(602),
      published_at: dias(-50),
      updated_at: dias(-50),
    },
  ]);
  await insertarVarias(qr, 'regulation_questions', [
    {
      id: id(492),
      regulation_id: id(490),
      publication_key: id(602),
      text: '¿Desde dónde se cierra un servicio?',
      display_order: 0,
      group_key: 'operacion',
    },
  ]);
  await insertarVarias(qr, 'regulation_options', [
    {
      id: id(493),
      question_id: id(492),
      text: 'Desde el portal de la modelo',
      is_correct: true,
      display_order: 0,
    },
    {
      id: id(494),
      question_id: id(492),
      text: 'Por mensaje al jefe',
      is_correct: false,
      display_order: 1,
    },
  ]);
  await insertarVarias(qr, 'employee_onboardings', [
    {
      id: id(495),
      user_id: U.empleada1,
      employee_id: EMP.uno,
      publication_key: id(602),
      status: 'completed',
      active: true,
      is_renewal: false,
      attempt_count: 2,
      best_score: 100,
      trust_score: 5,
      assigned_at: dias(-50),
      welcome_sent_at: dias(-50),
      regulation_sent_at: dias(-50),
      read_at: dias(-49),
      reminder_sent_at: dias(-49),
      completed_at: dias(-48),
      last_delivery_error: null,
    },
    {
      id: id(496),
      user_id: U.empleada3,
      employee_id: EMP.tres,
      publication_key: id(602),
      status: 'pending',
      active: true,
      is_renewal: true,
      attempt_count: 1,
      best_score: 60,
      trust_score: 2,
      assigned_at: dias(-5),
      welcome_sent_at: dias(-5),
      regulation_sent_at: dias(-5),
      read_at: null,
      reminder_sent_at: dias(-2),
      completed_at: null,
      last_delivery_error: 'Telegram devolvió 403: el usuario bloqueó el bot.',
    },
  ]);
  await insertarVarias(qr, 'questionnaire_attempts', [
    {
      id: id(497),
      onboarding_id: id(495),
      attempt_number: 2,
      status: 'completed',
      correct_answers: 1,
      total_questions: 1,
      score: 100,
      started_at: dias(-48),
      completed_at: dias(-48),
    },
  ]);
  await insertarVarias(qr, 'questionnaire_answers', [
    {
      id: id(498),
      attempt_id: id(497),
      question_id: id(492),
      option_id: id(493),
      is_correct: true,
      answered_at: dias(-48),
    },
  ]);

  await insertarVarias(qr, 'screening_questions', [
    {
      id: id(500),
      text: '¿Has trabajado antes en algo parecido?',
      active: true,
      display_order: 0,
      options: json(['Sí', 'No']),
      created_at: dias(-60),
    },
    {
      id: id(501),
      text: '¿Con qué disponibilidad de horario cuentas?',
      active: true,
      display_order: 1,
      options: null,
      created_at: dias(-60),
    },
  ]);
  await insertarVarias(qr, 'candidate_screenings', [
    {
      id: id(505),
      candidate_name: 'Candidata Demo Uno',
      candidate_phone: '4423334444',
      token: 'demo-token-cand-1',
      telegram_chat_id: '800000009',
      status: 'completado',
      question_ids: json([id(500), id(501)]),
      created_by_user_id: U.jefe1,
      created_at: dias(-9),
      started_at: dias(-9),
      completed_at: dias(-8),
      promoted_employee_id: EMP.dos,
    },
    {
      id: id(506),
      candidate_name: 'Candidata Demo Dos',
      candidate_phone: null,
      token: 'demo-token-cand-2',
      telegram_chat_id: null,
      status: 'pendiente',
      question_ids: json([id(500)]),
      created_by_user_id: U.jefe2,
      created_at: dias(-1),
      started_at: null,
      completed_at: null,
      promoted_employee_id: null,
    },
  ]);
  await insertarVarias(qr, 'candidate_screening_answers', [
    {
      id: id(507),
      screening_id: id(505),
      question_id: id(500),
      question_text: '¿Has trabajado antes en algo parecido?',
      answer_text: 'Sí, dos años en Medellín.',
      answered_at: dias(-8),
    },
    {
      id: id(508),
      screening_id: id(505),
      question_id: id(501),
      question_text: '¿Con qué disponibilidad de horario cuentas?',
      answer_text: 'De lunes a sábado, a partir de las seis de la tarde.',
      answered_at: dias(-8),
    },
  ]);

  await insertarVarias(qr, 'push_subscriptions', [
    {
      id: id(510),
      usuario_id: U.admin,
      endpoint: 'https://ejemplo.local/demo/push/endpoint-1',
      p256dh: 'demo-p256dh-key-0001',
      auth: 'demo-auth-0001',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/demo',
      creada_en: dias(-20),
      ultimo_envio: horas(-3),
      fallos: 0,
    },
  ]);
}

/**
 * Qué columnas quedaron vacías en lo sembrado.
 *
 * Es la mitad útil del ejercicio: si una pantalla no enseña un dato, este
 * listado dice si es porque el dato no está o porque la pantalla no lo dibuja.
 */
async function informeDeColumnasVacias(qr: QueryRunner): Promise<void> {
  console.log('');
  console.log(
    '---------------------------------------------------------------',
  );
  console.log('COLUMNAS QUE QUEDARON EN NULL EN LAS FILAS SEMBRADAS');
  console.log(
    'Si el panel no enseña una de estas, no es la pantalla: es el dato.',
  );
  console.log(
    '---------------------------------------------------------------',
  );

  for (const tabla of [...TABLAS_EN_ORDEN_DE_BORRADO].reverse()) {
    if (!(await tablaExiste(qr, tabla))) continue;
    const columnas: Array<{ column_name: string; is_nullable: string }> =
      await qr.query(
        `SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [tabla],
      );
    const uuidCols: Array<{ column_name: string }> = await qr.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND data_type = 'uuid'`,
      [tabla],
    );
    if (uuidCols.length === 0) continue;
    const filtro = uuidCols
      .map((c) => `"${c.column_name}"::text LIKE '${PREFIJO}-%'`)
      .join(' OR ');

    const total: Array<{ n: number }> = await qr.query(
      `SELECT COUNT(*)::int AS n FROM "${tabla}" WHERE ${filtro}`,
    );
    if (!total[0]?.n) continue;

    const vacias: string[] = [];
    for (const col of columnas) {
      if (col.is_nullable !== 'YES') continue;
      const r: Array<{ n: number }> = await qr.query(
        `SELECT COUNT(*)::int AS n FROM "${tabla}"
          WHERE (${filtro}) AND "${col.column_name}" IS NULL`,
      );
      if (Number(r[0]?.n ?? 0) === Number(total[0].n)) {
        vacias.push(col.column_name);
      }
    }
    const marca = vacias.length === 0 ? 'completa' : vacias.join(', ');
    console.log(`  ${tabla} (${total[0].n} filas): ${marca}`);
  }
}

/**
 * A qué servidor y a qué base apunta la conexión, sin la contraseña.
 *
 * Se lee de la configuración, no de una conexión abierta, para poder imprimirlo
 * también en el ensayo, que no se conecta. Es la única protección real contra
 * sembrar en la base equivocada: las banderas dicen que quieres escribir, esta
 * línea dice dónde.
 */
function describirDestino(): string {
  const conexion = AppDataSource.options as {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
  };
  const entorno = process.env.NODE_ENV || 'sin NODE_ENV';
  return `${conexion.username ?? '?'}@${conexion.host ?? '?'}:${conexion.port ?? '?'}/${String(conexion.database ?? '?')} (${entorno})`;
}

async function main(): Promise<void> {
  const ejecutar = process.argv.includes('--confirmar');
  const soloLimpiar = process.argv.includes('--limpiar');
  const enProduccion = process.env.NODE_ENV === 'production';
  const produccionAsumida = process.argv.includes('--en-produccion');

  /*
   * La puerta de produccion.
   *
   * Antes esto abortaba en seco en cuanto NODE_ENV era 'production'. Mientras
   * el sistema no esta en manos de nadie, sembrar la operacion contra la base
   * desplegada es la unica forma de recorrer el panel de produccion con datos
   * dentro, asi que la puerta se abre; pero no de par en par. Hace falta
   * escribir `--en-produccion` ademas de `--confirmar`: dos banderas que no
   * salen por inercia ni por historial de la shell.
   *
   * El ensayo no pasa por aqui a proposito: no se conecta ni escribe, y poder
   * lanzarlo en produccion sin banderas es justamente lo que permite mirar
   * antes de tocar.
   */
  if (enProduccion && ejecutar && !produccionAsumida) {
    console.error(
      'ABORTADO: NODE_ENV=production y este script escribe datos de demostracion.',
    );
    console.error('');
    console.error(
      'Si de verdad quieres sembrarlos en la base de produccion, repite el comando',
    );
    console.error('anadiendo --en-produccion:');
    console.error('');
    console.error(
      `  node dist/scripts/sembrar-datos-demo.js${soloLimpiar ? ' --limpiar' : ''} --confirmar --en-produccion`,
    );
    process.exit(1);
  }

  console.log(
    '===============================================================',
  );
  console.log(
    '     DATOS DE DEMOSTRACION PARA EL PANEL - COLOMBIA SEXYS      ',
  );
  console.log(
    '===============================================================',
  );
  console.log(
    `Accion: ${soloLimpiar ? 'LIMPIAR lo sembrado' : 'SEMBRAR la operacion completa'}`,
  );
  console.log(
    `Modo:   ${ejecutar ? '>>> EJECUCION REAL <<<' : '*** ENSAYO / DRY RUN (sin cambios) ***'}`,
  );
  console.log(`Marca:  todos los ids empiezan por "${PREFIJO}-"`);
  console.log(`Base:   ${describirDestino()}`);
  console.log('');

  if (enProduccion && ejecutar) {
    console.log(
      '>>> Esto es la base de PRODUCCION. Lee la linea de arriba antes de seguir.',
    );
    console.log('');
  }

  if (!ejecutar) {
    console.log(
      'Ensayo: no se toca la base. Vuelve a lanzarlo con --confirmar.',
    );
    console.log('');
    console.log(
      soloLimpiar
        ? `Borraria toda fila cuyo uuid empiece por "${PREFIJO}-" en ${TABLAS_EN_ORDEN_DE_BORRADO.length} tablas.`
        : `Sembraria una operacion completa repartida en ${TABLAS_EN_ORDEN_DE_BORRADO.length} tablas y despues listaria las columnas que queden vacias.`,
    );
    return;
  }

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    console.log('Limpiando lo sembrado anteriormente...');
    await limpiar(qr);

    if (!soloLimpiar) {
      console.log('Sembrando la operacion...');
      await sembrar(qr);
    }

    await qr.commitTransaction();
    console.log(
      soloLimpiar
        ? 'Listo: lo sembrado se ha borrado.'
        : 'Listo: la operacion quedo sembrada.',
    );

    if (!soloLimpiar) await informeDeColumnasVacias(qr);
  } catch (error) {
    await qr.rollbackTransaction();
    console.error('');
    console.error(
      'FALLO: no se aplico ningun cambio (la transaccion se revirtio).',
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

/*
 * Solo arranca cuando se invoca como script. Sin esta guarda, importarlo desde
 * una prueba --que es como se comprueba que las columnas existen de verdad--
 * abriria una conexion y se pondria a escribir.
 */
if (require.main === module) void main();
