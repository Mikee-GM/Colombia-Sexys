import { spawnSync } from 'node:child_process';

const containerName = `colombia-sexys-e2e-${process.pid}`;
const database = 'colombia_sexys_e2e';
const user = 'e2e';
const password = 'e2e_password';
let ownsContainer = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
    }
    throw new Error(`${command} terminó con código ${result.status}`);
  }
  return (result.stdout ?? '').trim();
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const probe = spawnSync('docker', [
      'exec',
      containerName,
      'pg_isready',
      '-U',
      user,
      '-d',
      database,
    ]);
    if (probe.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error('PostgreSQL E2E no estuvo listo en 15 segundos');
}

try {
  let host = process.env.E2E_DATABASE_HOST;
  let port = process.env.E2E_DATABASE_PORT;

  if (!host) {
    run('docker', [
      'run',
      '--detach',
      '--name',
      containerName,
      '-e',
      `POSTGRES_USER=${user}`,
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      `POSTGRES_DB=${database}`,
      '-p',
      '127.0.0.1::5432',
      'postgres:16-alpine',
    ]);
    ownsContainer = true;
    waitForPostgres();
    const binding = run(
      'docker',
      ['port', containerName, '5432/tcp'],
      { capture: true },
    );
    host = '127.0.0.1';
    port = binding.slice(binding.lastIndexOf(':') + 1);
  }

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_HOST: host,
    DATABASE_PORT: port ?? '5432',
    DATABASE_USER: process.env.E2E_DATABASE_USER ?? user,
    DATABASE_PASSWORD: process.env.E2E_DATABASE_PASSWORD ?? password,
    DATABASE_NAME: process.env.E2E_DATABASE_NAME ?? database,
  };

  run('node', ['node_modules/@nestjs/cli/bin/nest.js', 'build'], { env });
  run(
    'node',
    [
      'node_modules/typeorm/cli.js',
      'migration:run',
      '-d',
      'dist/data-source.js',
    ],
    { env },
  );
  run(
    'node',
    [
      'node_modules/jest/bin/jest.js',
      '--config',
      './test/jest-e2e.json',
      '--runInBand',
      ...process.argv.slice(2),
    ],
    { env },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (ownsContainer) {
    spawnSync('docker', ['rm', '--force', containerName], { stdio: 'ignore' });
  }
}
