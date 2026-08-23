import { DataSource } from 'typeorm';
import { join, resolve } from 'path';
import * as fs from 'fs';

const backendRoot = resolve(process.cwd());

/**
 * Lectura minima del .env para la CLI de TypeORM.
 *
 * No se usa dotenv porque solo llega como dependencia transitiva de
 * @nestjs/config y con pnpm no es importable directamente. La version anterior
 * usaba una unica expresion regular que no recortaba espacios, rompia los
 * valores con comillas dentro y no entendia el prefijo `export`.
 */
function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice(7) : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;

    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separator + 1).trim();

    const quote = value[0];
    if (
      (quote === '"' || quote === "'") &&
      value.endsWith(quote) &&
      value.length > 1
    ) {
      // Entre comillas el valor va literal, incluidos los `#`.
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      // Sin comillas, un `#` precedido de espacio abre un comentario.
      value = value.replace(/\s+#.*$/, '').trim();
    }

    parsed[key] = value;
  }

  return parsed;
}

const envPath = join(backendRoot, '.env');
if (fs.existsSync(envPath)) {
  const parsed = parseEnvFile(fs.readFileSync(envPath, 'utf-8'));
  for (const [key, value] of Object.entries(parsed)) {
    // El entorno real siempre gana sobre el fichero.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'chamba_pasteles',
  synchronize: false,
  logging: true,
  // Migration commands build first and run this DataSource from dist.
  // Loading src/**/*.ts here would make plain Node parse TypeScript files.
  entities: [join(backendRoot, 'dist/**/*.entity.js')],
  migrations: [join(backendRoot, 'dist/migrations/*.js')],
  subscribers: [],
});
