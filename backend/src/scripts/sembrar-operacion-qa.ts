import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../data-source';
import { sembrar } from './sembrar-datos-demo';

const QA_PASSWORD = 'QaLocal-2026!';
const QA_EMAILS = [
  'demo.jefe1@ejemplo.local',
  'demo.modelo1@ejemplo.local',
  'demo.chofer1@ejemplo.local',
] as const;

export function assertSafeQaSeedTarget(input: {
  nodeEnv?: string;
  confirmation?: string;
  host?: string;
  database?: string;
}): void {
  if (input.nodeEnv === 'production') {
    throw new Error(
      'El seed de QA no puede ejecutarse con NODE_ENV=production.',
    );
  }
  if (input.confirmation !== 'CONFIRM_LOCAL_QA') {
    throw new Error(
      'Define QA_LOCAL_SEED=CONFIRM_LOCAL_QA para autorizar la siembra.',
    );
  }

  const host = input.host?.toLowerCase();
  if (!host || !['localhost', '127.0.0.1', '::1', 'db'].includes(host)) {
    throw new Error(
      'El seed de QA solo admite PostgreSQL local o el servicio Docker "db".',
    );
  }
  if (!input.database || !/(qa|test|local|dev)/i.test(input.database)) {
    throw new Error(
      'El nombre de la base debe identificarla explícitamente como QA/test/local/dev.',
    );
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirmar')) {
    throw new Error('Falta --confirmar; no se realizó ninguna conexión.');
  }

  const options = AppDataSource.options as {
    host?: string;
    database?: string;
  };
  assertSafeQaSeedTarget({
    nodeEnv: process.env.NODE_ENV,
    confirmation: process.env.QA_LOCAL_SEED,
    host: options.host,
    database: options.database,
  });

  await AppDataSource.initialize();
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const existing: Array<{ count: string }> = await runner.query(
      `SELECT count(*)::text AS count FROM usuarios WHERE id::text LIKE 'deadbeef-%'`,
    );
    if (Number(existing[0]?.count ?? 0) > 0) {
      throw new Error(
        'Ya existen datos demo. Este seed seguro no reemplaza ni borra registros.',
      );
    }

    await sembrar(runner);
    const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
    await runner.query(
      `UPDATE usuarios SET password_hash = $1 WHERE email = ANY($2::varchar[])`,
      [passwordHash, [...QA_EMAILS]],
    );
    await runner.commitTransaction();

    console.log(
      'Datos ficticios de QA creados sin borrar registros existentes.',
    );
    console.log(`Usuarios: ${QA_EMAILS.join(', ')}`);
    console.log(`Clave exclusivamente local: ${QA_PASSWORD}`);
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
