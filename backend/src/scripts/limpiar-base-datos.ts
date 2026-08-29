/**
 * Script de mantenimiento para vaciar datos operativos y de clientes de la base de datos,
 * conservando la configuración del negocio y las entidades registradas:
 *
 * PRESERVA:
 * - Modelos registradas (empleadas, fotos públicas, fotos exclusivas, extras de catálogo)
 * - Lugares registrados (preset_service_locations)
 * - Departamentos (apartments)
 * - Jefes, Admins y Choferes (usuarios, choferes)
 * - Cuentas de Telegram y grupos vinculados (telegram_chat_id, grupo_telegram_id en usuarios y sesiones asociadas)
 * - Configuraciones del sistema (tarifas de transporte, cuentas bancarias, liquidaciones, loyalty tiers, reglamentos, preguntas de screening, preferencias)
 *
 * VACÍA:
 * - Clientes, membresías, alertas y chats de clientes
 * - Servicios, solicitudes manuales, prórrogas, extensiones y extras de servicio
 * - Servicios grupales, participantes, pagos y auditoría
 * - Viajes, liquidaciones de choferes, turnos y asignaciones
 * - Obligaciones y pagos en efectivo, liquidaciones semanales y auditorías
 * - Reportes de jornada, reportes de conducta, sanciones y calificaciones
 * - Envíos de fotos semanales, programaciones y retos
 * - Postulaciones de candidatas y respuestas de onboarding
 * - Outbox de tiempo real y tokens de acceso temporal
 *
 * USO desde `backend/`:
 *   corepack pnpm build
 *   node dist/scripts/limpiar-base-datos.js               # Modo ensayo (Dry run, no modifica nada)
 *   node dist/scripts/limpiar-base-datos.js --confirmar  # Modo ejecución real
 */

import { AppDataSource } from '../data-source';

/** Tablas base y de catálogo que NUNCA deben ser vaciadas. */
const TABLAS_PRESERVADAS = new Set([
  'usuarios',
  'empleadas',
  'empleada_fotos',
  'empleada_fotos_exclusivas',
  'extras_catalogo',
  'apartments',
  'choferes',
  'preset_service_locations',
  'transport_settings',
  'authorized_bank_accounts',
  'liquidation_settings',
  'loyalty_tiers',
  'employee_regulations',
  'regulation_questions',
  'regulation_options',
  'screening_questions',
  'user_preferences',
]);

/** Tablas operacionales y transaccionales a vaciar completamente. */
const TABLAS_A_VACIAR = [
  // Clientes y fidelidad
  'alertas_clientes',
  'conversaciones_telegram',
  'loyalty_transactions',
  'client_memberships',
  'clientes',

  // Servicios, extras y solicitudes
  'extensiones_servicio',
  'prorrogas',
  'extras_servicio',
  'payment_receipt_validations',
  'solicitudes_servicio_manual',
  'servicios',

  // Servicios grupales
  'group_service_request_selections',
  'service_participants',
  'service_payments',
  'service_group_audit',
  'trip_passengers',
  'group_service_requests',

  // Transporte, viajes y turnos
  'viajes',
  'driver_settlements',
  'driver_shift_assignments',
  'driver_shifts',

  // Efectivo y liquidaciones
  'employee_cash_payment_allocations',
  'employee_cash_payments',
  'employee_cash_obligations',
  'employee_weekly_settlements',
  'liquidation_audit_log',
  'liquidation_payments',
  'liquidation_debts',
  'liquidation_records',

  // Reportes, disciplina y calificaciones
  'employee_report_history',
  'employee_reports',
  'disciplinary_sanctions',
  'conduct_reports',
  'interaction_ratings',
  'employee_rating_snapshots',

  // Contenido semanal y retos
  'weekly_photo_submissions',
  'weekly_content_schedules',
  'challenge_participants',
  'challenges',

  // Onboarding y selección de candidatas
  'candidate_screening_answers',
  'candidate_screenings',
  'questionnaire_answers',
  'questionnaire_attempts',
  'employee_onboardings',

  // Tokens temporales y colas
  'realtime_outbox',
  'panel_access_tokens',
  'auth_sessions',
  'telegram_link_attempts',
  'employee_telegram_bots',
];

interface ConteoFila {
  tabla: string;
  total: number;
}

async function obtenerTablasExistentes(): Promise<Set<string>> {
  const filas: Array<{ table_name: string }> = await AppDataSource.query(
    `SELECT table_name 
       FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'`,
  );
  return new Set(filas.map((f) => f.table_name));
}

async function contarFilas(tabla: string): Promise<number> {
  try {
    const resultado: Array<{ count: string | number }> =
      await AppDataSource.query(`SELECT COUNT(*)::int as count FROM "${tabla}"`);
    return Number(resultado[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function obtenerTelegramIdsDelPersonal(): Promise<Set<string>> {
  const usuarios: Array<{
    telegram_chat_id: string | null;
    grupo_telegram_id: string | null;
  }> = await AppDataSource.query(
    `SELECT telegram_chat_id::text, grupo_telegram_id::text FROM usuarios`,
  );

  const ids = new Set<string>();
  for (const u of usuarios) {
    if (u.telegram_chat_id) ids.add(u.telegram_chat_id);
    if (u.grupo_telegram_id) ids.add(u.grupo_telegram_id);
  }
  return ids;
}

async function main(): Promise<void> {
  const ejecutar =
    process.argv.includes('--confirmar') || process.argv.includes('--ejecutar');

  console.log('===============================================================');
  console.log('       LIMPIEZA DE BASE DE DATOS - COLOMBIA SEXYS               ');
  console.log('===============================================================');
  console.log(
    `Modo: ${ejecutar ? '>>> EJECUCION REAL <<<' : '*** ENSAYO / DRY RUN (Sin cambios) ***'}`,
  );
  console.log('');

  await AppDataSource.initialize();

  try {
    const tablasEnDb = await obtenerTablasExistentes();

    // 1. Diagnóstico de tablas a preservar
    console.log('---------------------------------------------------------------');
    console.log('1. TABLAS Y ENTIDADES QUE SE PRESERVAN (NO SE TOCAN)');
    console.log('---------------------------------------------------------------');
    const preservadasConteos: ConteoFila[] = [];
    for (const tabla of TABLAS_PRESERVADAS) {
      if (tablasEnDb.has(tabla)) {
        const total = await contarFilas(tabla);
        preservadasConteos.push({ tabla, total });
        console.log(`  [PRESERVADA] ${tabla.padEnd(35)} : ${total} registros`);
      }
    }

    // 2. Diagnóstico de tablas a vaciar
    console.log('\n---------------------------------------------------------------');
    console.log('2. TABLAS OPERATIVAS Y DE CLIENTES A VACIAR');
    console.log('---------------------------------------------------------------');
    const aVaciarExistentes: string[] = [];
    let totalRegistrosABorrar = 0;

    for (const tabla of TABLAS_A_VACIAR) {
      if (tablasEnDb.has(tabla)) {
        aVaciarExistentes.push(tabla);
        const total = await contarFilas(tabla);
        totalRegistrosABorrar += total;
        console.log(`  [A VACIAR]   ${tabla.padEnd(35)} : ${total} registros`);
      }
    }

    // 3. Revisión de telegram_sessions
    let totalSesiones = 0;
    let sesionesStaff = 0;
    let sesionesClientes = 0;

    if (tablasEnDb.has('telegram_sessions')) {
      const idsPersonal = await obtenerTelegramIdsDelPersonal();
      const todasLasSesiones: Array<{ key: string }> =
        await AppDataSource.query(`SELECT key FROM telegram_sessions`);
      totalSesiones = todasLasSesiones.length;

      for (const s of todasLasSesiones) {
        const partes = s.key.split(':');
        const coincideConStaff = partes.some((p) => idsPersonal.has(p));
        if (coincideConStaff) {
          sesionesStaff++;
        } else {
          sesionesClientes++;
        }
      }

      console.log('\n---------------------------------------------------------------');
      console.log('3. SESIONES DE TELEGRAM (telegram_sessions)');
      console.log('---------------------------------------------------------------');
      console.log(`  Total de sesiones almacenadas      : ${totalSesiones}`);
      console.log(
        `  Sesiones de staff / modelos / grupos: ${sesionesStaff} (SE CONSERVAN)`,
      );
      console.log(
        `  Sesiones de clientes / anónimos    : ${sesionesClientes} (SE BORRARAN)`,
      );
    }

    // 4. Tablas desconocidas en DB (si las hubiera)
    const tablasNoClasificadas = [...tablasEnDb].filter(
      (t) =>
        !TABLAS_PRESERVADAS.has(t) &&
        !TABLAS_A_VACIAR.includes(t) &&
        t !== 'telegram_sessions' &&
        !t.startsWith('typeorm_metadata') &&
        !t.startsWith('migrations'),
    );

    if (tablasNoClasificadas.length > 0) {
      console.log('\n[AVISO] Tablas detectadas no contempladas expresamente:');
      for (const t of tablasNoClasificadas) {
        const c = await contarFilas(t);
        console.log(`  (?) ${t.padEnd(35)} : ${c} registros (NO se modificará)`);
      }
    }

    console.log('\n===============================================================');
    console.log(
      `RESUMEN: ${aVaciarExistentes.length} tablas a vaciar (~${totalRegistrosABorrar} registros), ` +
        `${sesionesClientes} sesiones de clientes a purgar.`,
    );
    console.log('===============================================================');

    if (!ejecutar) {
      console.log('\n[DRY RUN FINALIZADO]');
      console.log('No se realizó ningún cambio en la base de datos.');
      console.log(
        'Para proceder con el borrado definitivo, ejecuta el comando con la bandera --confirmar:\n',
      );
      console.log('  corepack pnpm run db:clean:run');
      console.log('  o');
      console.log('  node dist/scripts/limpiar-base-datos.js --confirmar\n');
      return;
    }

    // MODO EJECUCIÓN
    console.log('\n>>> EJECUTANDO LIMPIEZA EN BASE DE DATOS...');
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Truncate masivo en cascada de todas las tablas operacionales
      if (aVaciarExistentes.length > 0) {
        const tablasSql = aVaciarExistentes.map((t) => `"${t}"`).join(', ');
        console.log(`- Vaciando ${aVaciarExistentes.length} tablas operativas...`);
        await queryRunner.query(
          `TRUNCATE TABLE ${tablasSql} RESTART IDENTITY CASCADE`,
        );
      }

      // 2. Limpieza de sesiones de Telegram de clientes
      if (tablasEnDb.has('telegram_sessions') && sesionesClientes > 0) {
        const idsPersonal = await obtenerTelegramIdsDelPersonal();
        if (idsPersonal.size > 0) {
          const idsArray = Array.from(idsPersonal);
          console.log(
            `- Purgando sesiones de clientes en telegram_sessions (conservando ${idsArray.length} IDs de personal/grupos)...`,
          );
          await queryRunner.query(
            `DELETE FROM telegram_sessions 
              WHERE NOT EXISTS (
                SELECT 1 FROM usuarios u 
                 WHERE (u.telegram_chat_id IS NOT NULL AND telegram_sessions.key LIKE '%' || u.telegram_chat_id::text || '%')
                    OR (u.grupo_telegram_id IS NOT NULL AND telegram_sessions.key LIKE '%' || u.grupo_telegram_id::text || '%')
              )`,
          );
        } else {
          console.log(
            `- Purgando sesiones de telegram_sessions sin usuarios vinculados...`,
          );
          await queryRunner.query(`TRUNCATE TABLE telegram_sessions`);
        }
      }

      // 3. Reset de contadores de servicios y calificaciones en modelos
      if (tablasEnDb.has('empleadas')) {
        console.log(
          '- Reseteando métricas de servicios y calificaciones en empleadas...',
        );
        await queryRunner.query(
          `UPDATE empleadas 
              SET total_servicios_valorados = 0, 
                  promedio_calificacion = NULL, 
                  disponible = false`,
        );
      }

      // 4. Reset de contadores en choferes
      if (tablasEnDb.has('choferes')) {
        console.log('- Reseteando contadores de disponibilidad en choferes...');
        await queryRunner.query(
          `UPDATE choferes 
              SET rechazos_consecutivos = 0, 
                  ultimo_rechazo_at = NULL, 
                  disponible = false`,
        );
      }

      // 5. Commit de la transacción
      await queryRunner.commitTransaction();
      console.log('\n✓ TRANSACCIÓN COMPLETADA CON ÉXITO.');
      console.log('✓ Todas las tablas operativas han sido vaciadas.');
      console.log(
        '✓ Modelos, lugares, departamentos, jefes, choferes y cuentas/grupos de Telegram se han conservado intactos.\n',
      );
    } catch (error) {
      console.error('\n❌ ERROR durante la limpieza. Revirtiendo cambios (ROLLBACK)...');
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('\nFallo fatal en el script de limpieza:', error);
  process.exitCode = 1;
});
