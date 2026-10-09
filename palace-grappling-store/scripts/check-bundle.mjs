// Procura segredos no build da loja (dist/). Tudo em dist/ é público.
// Uso: npm run build && npm run check:bundle
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'dist';
const patterns = [
  [/sb_secret_[A-Za-z0-9_-]+/, 'chave secreta do Supabase'],
  [/service_role/i, 'menção à chave service_role do Supabase'],
  [/SUPABASE_SERVICE_ROLE_KEY|JWT_ACCESS_SECRET|MERCADOPAGO_(ACCESS_TOKEN|WEBHOOK_SECRET)|DATABASE_URL|DIRECT_URL/, 'nome de variável secreta do backend'],
  [/postgres(ql)?:\/\/[^\s"'`]+/i, 'string de conexão de banco'],
  [/\b(APP_USR|TEST)-\d{6,}-[A-Za-z0-9-]{10,}/, 'token do Mercado Pago'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT embutido'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chave privada'],
];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|mjs|css|html|json|map|txt|svg)$/.test(name)) files.push(path);
  }
};
walk(root);

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [re, what] of patterns) {
    const m = text.match(re);
    if (m) findings.push(`${file}: ${what} (${m[0].slice(0, 12)}…)`);
  }
}

if (findings.length) {
  console.error(`Possíveis segredos no bundle (${findings.length}):\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`Nenhum segredo encontrado em ${files.length} arquivos de ${root}/.`);
