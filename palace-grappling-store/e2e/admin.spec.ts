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
  const before = Number(await page.locator('tbody tr').first().locator('td').nth(1).innerText().then((t) => t.match(/\d+/)?.[0] ?? '0'));
  await first.fill('0.5');
  await expect(page.getByText('Inteiro de 1 a 100.000')).toBeVisible();
  await first.fill('3');
  await page.getByRole('button', { name: /Registrar entrada de 3 unidades/ }).click();
  await expect(page.getByText(/3 unidades de .* registradas/)).toBeVisible();
  await page.getByRole('button', { name: 'Nova entrada' }).click();
  await page.getByLabel('1. Qual produto chegou?').fill('Rash Guard');
  await page.getByRole('button', { name: /Rash Guard/ }).first().click();
  await expect(page.locator('tbody tr').first().locator('td').nth(1)).toContainText(String(before + 3));
});

test('confirmação manual de pagamento leva o pedido para Pago', async ({ page }) => {
  await login(page);
  await page.goto('/admin/pedidos?status=PENDING_PAYMENT');
  await expect(page.locator('tbody tr').first().or(page.getByText(/Nenhum pedido/))).toBeVisible();
  const row = page.locator('tbody tr').first();
  test.skip(!(await row.count()), 'sem pedido aguardando pagamento no banco de teste');
  await row.getByRole('link').first().click();
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
