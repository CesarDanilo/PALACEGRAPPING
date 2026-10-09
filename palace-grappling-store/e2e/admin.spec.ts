import { expect, test, type Page } from '@playwright/test';

// Funções do painel: menu recolhível, entrada de estoque, pagamento manual,
// links (apagar um / todos) e equipe. Roda contra a API local com o seed.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'palace-dev-12345';

async function login(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/admin/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Painel', exact: true })).toBeVisible();
}

test.use({ viewport: { width: 1280, height: 900 } });
test.beforeEach(({ page }) => {
  page.on('dialog', (d) => void d.accept());
});

test('menu lateral recolhe para ícones e lembra a escolha', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Painel' });
  await expect(nav.getByText('Pedidos', { exact: true })).toBeVisible();
  const aside = page.locator('#admin-menu');
  const wide = (await aside.boundingBox())!.width;
  await page.getByRole('button', { name: 'Recolher menu' }).click();
  await expect.poll(async () => (await aside.boundingBox())!.width).toBeLessThan(100);
  expect(wide).toBeGreaterThan(200);
  // Recolhido, o link continua acessível pelo nome.
  await nav.getByRole('link', { name: 'Pedidos' }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Expandir menu' }).click();
  await expect.poll(async () => (await aside.boundingBox())!.width).toBeGreaterThan(200);
});

test('painel destaca estoque baixo e pedidos com cores', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('link', { name: /Estoque baixo/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Para separar e enviar/ })).toBeVisible();
  await page.goto('/admin/produtos');
  // Coluna de foto (miniatura ou espaço reservado) e estoque com indicação.
  await expect(page.locator('tbody tr').first().locator('img, span[aria-hidden="true"]').first()).toBeVisible();
});

test('entrada de estoque: busca o produto, informa quantidades e atualiza o saldo', async ({ page }) => {
  await login(page);
  await page.goto('/admin/estoque');
  await page.getByLabel('1. Qual produto chegou?').fill('Rash Guard');
  await page.getByRole('button', { name: /Rash Guard/ }).first().click();
  const first = page.getByRole('spinbutton', { name: /Unidades que chegaram/ }).first();
  await first.waitFor();
  // Saldo atual da primeira variante na tabela da entrada (não no histórico).
  const entryRow = () => page.locator('#entrada tbody tr').first().locator('td').nth(1);
  const before = Number(await entryRow().innerText().then((t) => t.match(/\d+/)?.[0] ?? '0'));
  await first.fill('0.5');
  await expect(page.getByText('Inteiro de 1 a 100.000')).toBeVisible();
  await first.fill('3');
  await page.getByRole('button', { name: /Registrar entrada de 3 unidades/ }).click();
  await expect(page.getByText(/3 unidades de .* registradas/)).toBeVisible();
  await page.getByRole('button', { name: 'Nova entrada' }).click();
  await page.getByLabel('1. Qual produto chegou?').fill('Rash Guard');
  await page.getByRole('button', { name: /Rash Guard/ }).first().click();
  await page.getByRole('spinbutton', { name: /Unidades que chegaram/ }).first().waitFor();
  await expect(entryRow()).toContainText(String(before + 3));
});

test('confirmação manual de pagamento leva o pedido para Pago', async ({ page }) => {
  await login(page);
  // Cria um pedido aguardando pagamento pelo próprio painel.
  await page.goto('/admin/pedidos/novo');
  await page.getByLabel('Buscar produto').fill('faixa');
  await page.getByRole('button', { name: /^Adicionar Faixa/ }).filter({ hasNot: page.locator('[disabled]') }).first().click();
  await page.getByLabel('Nome completo').fill('Cliente Pix Direto');
  await page.getByLabel('Telefone (WhatsApp)').fill('(11) 95555-4444');
  await page.getByLabel('CEP').fill('01310-100');
  await page.getByLabel('Rua').fill('Av. Paulista');
  await page.getByLabel('Número').fill('1000');
  await page.getByLabel('Bairro').fill('Bela Vista');
  await page.getByLabel('Cidade').fill('São Paulo');
  await page.getByRole('button', { name: 'Criar pedido', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/pedidos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Recebeu o pagamento por fora?' })).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Confirmar pagamento' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Como foi pago (obrigatório)').fill('Pix recebido direto (teste E2E)');
  await confirm.click();
  await expect(page.getByText('Pago', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recebeu o pagamento por fora?' })).toBeHidden();
  await expect(page.getByText(/Pagamento confirmado manualmente/)).toBeVisible();
});

test('links: gera, apaga um e apaga todos', async ({ page }) => {
  await login(page);
  await page.goto('/admin/links');
  const make = async (label: string) => {
    await page.getByLabel('Catálogo').selectOption({ index: 1 });
    await page.getByLabel('Identificação').fill(label);
    await page.getByRole('button', { name: 'Gerar' }).click();
    await expect(page.getByRole('row').filter({ hasText: label })).toBeVisible();
  };
  await make('E2E apagar um');
  await make('E2E apagar todos');
  await page.getByRole('button', { name: 'Apagar link E2E apagar um' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'E2E apagar um' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apagar todos', exact: true }).click();
  await expect(page.getByText(/links apagados/)).toBeVisible();
  await expect(page.getByText('Nenhum link gerado')).toBeVisible();
});

test('equipe: adiciona pessoa com login e senha, ela entra e é removida', async ({ page, browser }) => {
  await login(page);
  await page.goto('/admin/configuracoes');
  const email = `operador-${Date.now()}@example.com`;
  await page.getByLabel('Nome completo').fill('Operador Teste');
  await page.getByLabel('E-mail (login)').fill(email);
  await page.getByLabel('Senha inicial').fill('curta');
  await page.getByLabel('Confirme a senha').fill('outra');
  await page.getByRole('button', { name: 'Adicionar à equipe' }).click();
  await expect(page.getByText('Pelo menos 12 caracteres')).toBeVisible();
  await page.getByLabel('Senha inicial').fill('SenhaOperador2026');
  await page.getByLabel('Confirme a senha').fill('SenhaOperador2026');
  await page.getByRole('button', { name: 'Adicionar à equipe' }).click();
  await expect(page.getByText(/Pessoa adicionada/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: email })).toBeVisible();

  const other = await browser.newContext();
  const op = await other.newPage();
  await login(op, email, 'SenhaOperador2026');
  // Operador não vê financeiro nem configurações.
  await expect(op.getByRole('navigation', { name: 'Painel' }).getByRole('link', { name: 'Financeiro' })).toHaveCount(0);
  await other.close();

  await page.getByRole('button', { name: 'Remover Operador Teste da equipe' }).click();
  await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0);
});

test('catálogo: busca de produtos filtra enquanto digita e respeita o limite', async ({ page }) => {
  await login(page);
  await page.goto('/admin/catalogos');
  await page.getByRole('button', { name: 'Novo catálogo' }).click();
  const list = page.getByRole('list', { name: 'Produtos do catálogo' });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  const total = await list.getByRole('listitem').count();
  const search = page.getByLabel(/Produtos \(\d+ selecionados\)/);
  await search.fill('spats');
  await expect.poll(() => list.getByRole('listitem').count()).toBeLessThan(total);
  await expect(list.getByRole('listitem').first()).toContainText(/Spats/i);
  await list.getByRole('checkbox').first().check();
  await expect(page.getByLabel('Produtos (1 selecionados)')).toBeVisible();
  await search.fill('x'.repeat(120));
  expect((await search.inputValue()).length).toBe(80);
  await search.fill('');
  await page.getByLabel('Só os selecionados').check();
  await expect(list.getByRole('listitem')).toHaveCount(1);
});

test('cliente manual: cadastra e recusa telefone repetido', async ({ page }) => {
  await login(page);
  await page.goto('/admin/clientes');
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  const phone = `(11) 9${String(Date.now()).slice(-4)}-${String(Date.now()).slice(-8, -4)}`;
  await page.getByLabel('Nome completo').fill('Cliente Manual E2E');
  await page.getByLabel('Telefone (WhatsApp)').fill(phone);
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByText('Cliente cadastrado.')).toBeVisible();
  await page.getByLabel('Nome completo').fill('Outra Pessoa');
  await page.getByLabel('Telefone (WhatsApp)').fill(phone);
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByText(/Já existe um cliente com este telefone/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver cliente' })).toBeVisible();
  expect((await page.getByLabel('Nome completo').getAttribute('maxlength'))).toBe('120');
});

test('pedido manual: produto, cliente, entrega e pagamento recebido', async ({ page }) => {
  await login(page);
  await page.goto('/admin/pedidos');
  await page.getByRole('link', { name: 'Novo pedido' }).click();
  await expect(page.getByRole('button', { name: 'Criar pedido' })).toBeDisabled();
  await page.getByLabel('Buscar produto').fill('rash ranked');
  await page.getByRole('button', { name: /Adicionar Rash Guard Manga Longa Ranked/ }).filter({ hasNot: page.locator('[disabled]') }).first().click();
  await expect(page.getByRole('list', { name: 'Itens do pedido' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: /Aumentar Rash Guard/ }).click();
  await page.getByLabel('Nome completo').fill('Comprador Balcão');
  await page.getByLabel('Telefone (WhatsApp)').fill('(11) 96666-5555');
  await page.getByLabel('CEP').fill('01310-100');
  await page.getByLabel('Rua').fill('Av. Paulista');
  await page.getByLabel('Número').fill('1000');
  await page.getByLabel('Bairro').fill('Bela Vista');
  await page.getByLabel('Cidade').fill('São Paulo');
  await expect(page.getByText('Total', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Pagamento já recebido').check();
  await page.getByRole('button', { name: 'Criar pedido pago' }).click();
  await expect(page.getByText('Descreva como o pagamento foi recebido')).toBeVisible();
  await page.getByLabel('Como foi pago (obrigatório)').fill('Dinheiro no balcão (E2E)');
  await page.getByRole('button', { name: 'Criar pedido pago' }).click();
  await expect(page).toHaveURL(/\/admin\/pedidos\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Pago', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Painel/).first()).toBeVisible();
  await expect(page.getByText(/2/).first()).toBeVisible();
});
