/**
 * Valores exclusivamente locales para que importar AppModule no lea secretos
 * de un `.env`. El runner fija la base efímera antes de arrancar Jest.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  WEB_URL: 'http://localhost:3000',
  DATABASE_HOST: '127.0.0.1',
  DATABASE_PORT: '55432',
  DATABASE_USER: 'e2e',
  DATABASE_PASSWORD: 'e2e_password',
  DATABASE_NAME: 'colombia_sexys_e2e',
  DATABASE_POOL_MAX: '5',
  JWT_SECRET: 'local-e2e-jwt-secret-0000000000000001',
  JWT_REFRESH_SECRET: 'local-e2e-refresh-secret-000000000001',
  COOKIE_SECRET: 'local-e2e-cookie-secret-000000000001',
  TELEGRAM_BOT_TOKEN: '123456789:dummy',
  DEFAULT_ADMIN_EMAIL: 'e2e-admin@example.com',
  DEFAULT_ADMIN_PASSWORD: 'local-e2e-password',
  R2_ENDPOINT: 'http://127.0.0.1:59999',
  R2_ACCESS_KEY_ID: 'e2e-dummy',
  R2_SECRET_ACCESS_KEY: 'e2e-dummy',
  R2_BUCKET_NAME: 'e2e-dummy',
  R2_PUBLIC_URL: 'http://localhost:59999',
};

for (const [name, value] of Object.entries(defaults)) {
  process.env[name] ??= value;
}
