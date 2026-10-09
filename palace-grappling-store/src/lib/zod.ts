import { z } from 'zod';

// A CSP da loja proíbe eval. No modo JIT o Zod testa `new Function`, o que gera
// uma violação de CSP; no modo jitless ele valida sem gerar código.
// Importe `z` sempre daqui (regra no eslint.config.js).
z.config({ jitless: true });

export { z };
