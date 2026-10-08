import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile('.env');
} catch {
  // .env é opcional; CI e containers fornecem as variáveis diretamente.
}

// O Prisma CLI (migrate, studio) usa DIRECT_URL: no Supabase é a conexão direta
// (porta 5432), necessária para migrations. Em runtime a aplicação usa DATABASE_URL,
// que pode apontar para o pooler (Supavisor, porta 6543). Ver README > Supabase.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
