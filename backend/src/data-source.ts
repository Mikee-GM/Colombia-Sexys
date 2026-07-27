import { DataSource } from 'typeorm';
import { join, resolve } from 'path';
import * as fs from 'fs';

const backendRoot = resolve(process.cwd());

// Manually parse .env file if it exists to avoid external dotenv dependency
const envPath = join(backendRoot, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  for (const line of envConfig.split('\n')) {
    const match = line.match(/^([^=="#]+)=["']?([^"'\r\n]*)["']?/);
    if (match) {
      const [, key, value] = match;
      if (!process.env[key]) {
        process.env[key] = value;
      }
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
