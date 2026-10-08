// Prepara o banco de testes de integração: recria o schema e aplica as migrations
// versionadas (as mesmas de produção). Só roda contra bancos cujo nome contém "test".
import { execSync } from 'node:child_process';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // variáveis podem vir do ambiente (CI)
  }
  const url = process.env.TEST_DATABASE_URL ?? '';
  project.provide('testDatabaseUrl', '');
  if (!url) {
    console.warn('[tests] TEST_DATABASE_URL ausente: testes de integração serão ignorados.');
    return;
  }
  const dbName = new URL(url).pathname.replace('/', '');
  if (!/test/i.test(dbName)) throw new Error(`Recusando preparar "${dbName}": o banco de testes precisa conter "test" no nome.`);

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (error) {
    console.warn(`[tests] banco de testes inacessível (${(error as Error).message}); testes de integração serão ignorados.`);
    return;
  }
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url } });
  project.provide('testDatabaseUrl', url);
}
