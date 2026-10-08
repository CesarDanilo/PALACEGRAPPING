// Seed de desenvolvimento. Cria um administrador da plataforma, uma loja de
// demonstração com categorias, produtos, variantes, catálogos e um link exclusivo.
//
// Os dados da loja são apenas DADOS: o código da API não conhece nenhuma marca.
//
//   SEED_ADMIN_EMAIL     (padrão: admin@example.com)
//   SEED_ADMIN_PASSWORD  (se ausente, uma senha aleatória é gerada e exibida)
//   SEED_STORE_SLUG / SEED_STORE_NAME
//
// Recusa-se a rodar com NODE_ENV=production.
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { createPrismaClient } from '../src/infrastructure/prisma/client.js';
import { randomToken } from '../src/shared/crypto.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Seed de desenvolvimento não pode rodar em produção.');
  process.exit(1);
}

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const generated = !process.env.SEED_ADMIN_PASSWORD;
const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');
const storeSlug = process.env.SEED_STORE_SLUG ?? 'palace-grappling';
const storeName = process.env.SEED_STORE_NAME ?? 'Palace Grappling';

type SeedProduct = {
  name: string;
  slug: string;
  category: string;
  line: string;
  price: string;
  salePrice?: string;
  featured?: boolean;
  description: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
  stock: number;
};

const categories = [
  { slug: 'kimonos', name: 'Kimonos', description: 'Kimonos de Jiu-Jitsu para treino e competição.' },
  { slug: 'rash-guards', name: 'Rash guards', description: 'Compressão e proteção para treinos No-Gi.' },
  { slug: 'shorts', name: 'Shorts No-Gi', description: 'Mobilidade total para grappling.' },
  { slug: 'leggings', name: 'Leggings e calças', description: 'Calças de compressão e spats.' },
  { slug: 'acessorios', name: 'Acessórios', description: 'Faixas, bolsas e itens de treino.' },
];

const products: SeedProduct[] = [
  { name: 'Kimono Competition A1 Preto', slug: 'kimono-competition-preto', category: 'kimonos', line: 'gi', price: '899.00', featured: true, description: 'Trançado pearl weave 450 g, gola reforçada e calça em ripstop.', sizes: ['A0', 'A1', 'A2', 'A3', 'A4'], colors: [{ name: 'Preto', hex: '#0A0A0A' }], stock: 6 },
  { name: 'Kimono Treino Leve Branco', slug: 'kimono-treino-branco', category: 'kimonos', line: 'gi', price: '649.00', salePrice: '549.00', description: 'Tecido leve para rotina diária de treinos.', sizes: ['A1', 'A2', 'A3'], colors: [{ name: 'Branco', hex: '#F5F5F5' }], stock: 8 },
  { name: 'Rash Guard Manga Longa Ranked', slug: 'rash-guard-ranked', category: 'rash-guards', line: 'no-gi', price: '289.00', featured: true, description: 'Compressão com costura flatlock e sublimação resistente.', sizes: ['P', 'M', 'G', 'GG'], colors: [{ name: 'Preto', hex: '#0A0A0A' }, { name: 'Grafite', hex: '#2B2B2B' }], stock: 5 },
  { name: 'Rash Guard Manga Curta Core', slug: 'rash-guard-core', category: 'rash-guards', line: 'no-gi', price: '239.00', description: 'Ajuste anatômico para treinos intensos.', sizes: ['P', 'M', 'G'], colors: [{ name: 'Preto', hex: '#0A0A0A' }], stock: 4 },
  { name: 'Shorts No-Gi Fight Day', slug: 'shorts-fight-day', category: 'shorts', line: 'no-gi', price: '219.00', salePrice: '189.00', featured: true, description: 'Fenda lateral e cós com velcro e cordão.', sizes: ['P', 'M', 'G', 'GG'], colors: [{ name: 'Preto', hex: '#0A0A0A' }], stock: 7 },
  { name: 'Spats de Compressão Pro', slug: 'spats-compressao-pro', category: 'leggings', line: 'no-gi', price: '259.00', description: 'Compressão graduada e tecido com proteção UV.', sizes: ['P', 'M', 'G'], colors: [{ name: 'Preto', hex: '#0A0A0A' }], stock: 3 },
  { name: 'Faixa Premium', slug: 'faixa-premium', category: 'acessorios', line: 'gi', price: '129.00', description: 'Faixa de algodão com miolo reforçado.', sizes: ['A1', 'A2', 'A3'], colors: [{ name: 'Branca', hex: '#F5F5F5' }, { name: 'Azul', hex: '#1F4FD8' }, { name: 'Roxa', hex: '#5B2A86' }], stock: 10 },
  { name: 'Bolsa de Treino Duffel', slug: 'bolsa-duffel', category: 'acessorios', line: 'acessorios', price: '329.00', description: 'Compartimento ventilado para kimono úmido.', sizes: [], colors: [{ name: 'Preto', hex: '#0A0A0A' }], stock: 2 },
];

async function main() {
  const passwordHash = await hash(password, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Administrador', passwordHash, isPlatformAdmin: true },
    update: generated ? {} : { passwordHash },
  });

  let tenant = await prisma.tenant.findUnique({ where: { slug: storeSlug } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: storeSlug,
        name: storeName,
        settings: { create: { shippingFlatRate: '29.90', freeShippingThreshold: '499.00', contactEmail: 'contato@example.com', contactPhone: '(11) 90000-0000' } },
        financeCategories: {
          create: [
            { name: 'Vendas', kind: 'INCOME', isSystem: true },
            { name: 'Outras receitas', kind: 'INCOME' },
            { name: 'Fornecedores', kind: 'EXPENSE' },
            { name: 'Frete e envio', kind: 'EXPENSE' },
            { name: 'Marketing', kind: 'EXPENSE' },
            { name: 'Taxas e tarifas', kind: 'EXPENSE' },
            { name: 'Operacional', kind: 'EXPENSE' },
          ],
        },
      },
    });
  }
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
    create: { userId: admin.id, tenantId: tenant.id, role: 'OWNER' },
    update: {},
  });

  const categoryIds = new Map<string, string>();
  for (const [position, c] of categories.entries()) {
    const row = await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
      create: { ...c, position, tenantId: tenant.id },
      update: {},
    });
    categoryIds.set(c.slug, row.id);
  }

  const productIds: string[] = [];
  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: p.slug } } });
    if (existing) {
      productIds.push(existing.id);
      continue;
    }
    const sizes = p.sizes.length ? p.sizes : [null];
    const variants = sizes.flatMap((size) =>
      p.colors.map((color) => ({
        tenantId: tenant.id,
        sku: [p.slug, size, color.name].filter(Boolean).join('-').toUpperCase().replace(/[^A-Z0-9-]/g, ''),
        size,
        color: color.name,
        colorHex: color.hex,
        stock: p.stock,
      })),
    );
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: categoryIds.get(p.category) ?? null,
        name: p.name,
        slug: p.slug,
        description: p.description,
        line: p.line,
        price: p.price,
        salePrice: p.salePrice ?? null,
        isFeatured: p.featured ?? false,
        releasedAt: new Date(),
        tags: [p.line],
        variants: { create: variants },
      },
      include: { variants: true },
    });
    await prisma.stockMovement.createMany({
      data: product.variants.map((v) => ({
        tenantId: tenant.id,
        variantId: v.id,
        type: 'INBOUND' as const,
        quantity: v.stock,
        balanceAfter: v.stock,
        reason: 'Estoque inicial (seed)',
        userId: admin.id,
        source: 'seed',
      })),
    });
    productIds.push(product.id);
  }

  const general = await prisma.catalog.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'loja' } },
    create: { tenantId: tenant.id, name: 'Loja completa', slug: 'loja', type: 'GENERAL' },
    update: {},
  });
  const campaign = await prisma.catalog.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'no-gi-drop' } },
    create: { tenantId: tenant.id, name: 'No-Gi Drop', slug: 'no-gi-drop', type: 'CAMPAIGN', description: 'Seleção da linha No-Gi.', isPublic: false },
    update: {},
  });
  const gi = await prisma.catalog.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'linha-gi-2026' } },
    create: { tenantId: tenant.id, name: 'Linha Gi 2026', slug: 'linha-gi-2026', type: 'COLLECTION', description: 'Kimonos e faixas da temporada.' },
    update: {},
  });
  // Campanha pública com data de fim: demonstra a contagem regressiva real da vitrine.
  const drop = await prisma.catalog.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'drop-competicao' } },
    create: {
      tenantId: tenant.id,
      name: 'Drop Competição',
      slug: 'drop-competicao',
      type: 'CAMPAIGN',
      description: 'Lote curto para a temporada de campeonatos. Quando acabar, acabou.',
      endsAt: new Date(Date.now() + 14 * 86_400_000),
    },
    update: {},
  });
  for (const [catalog, ids] of [
    [general, productIds],
    [campaign, productIds.slice(2, 6)],
    [gi, [productIds[0]!, productIds[1]!, productIds[6]!]],
    [drop, [productIds[0]!, productIds[2]!, productIds[4]!]],
  ] as const) {
    for (const [position, productId] of ids.entries()) {
      await prisma.catalogProduct.upsert({
        where: { catalogId_productId: { catalogId: catalog.id, productId } },
        create: { tenantId: tenant.id, catalogId: catalog.id, productId, position },
        update: {},
      });
    }
  }
  let link = await prisma.catalogLink.findFirst({ where: { tenantId: tenant.id, catalogId: campaign.id } });
  link ??= await prisma.catalogLink.create({
    data: { tenantId: tenant.id, catalogId: campaign.id, token: randomToken(), label: 'Equipe de competição', createdById: admin.id },
  });

  console.log('\nSeed concluído.');
  console.log(`  Loja:        ${tenant.name} (slug: ${tenant.slug}, id: ${tenant.id})`);
  console.log(`  Admin:       ${email}`);
  console.log(generated ? `  Senha:       ${password}   ← gerada agora; troque após o primeiro acesso` : '  Senha:       (SEED_ADMIN_PASSWORD)');
  console.log(`  Link VIP:    /c/${link.token}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
