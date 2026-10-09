import { expect, test } from '@playwright/test';

test('compra completa: produto com variante obrigatória até o pedido', async ({ page }) => {
  await page.goto('/produto/rash-guard-ranked');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rash Guard');

  // Sem tamanho e cor, não adiciona ao carrinho.
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).first().click();
  await expect(page.getByRole('alert')).toContainText('Selecione o tamanho');

  await page.getByRole('radio', { name: 'Preto' }).click();
  // Primeiro tamanho com estoque (execuções anteriores podem ter esgotado algum).
  await page.getByRole('radiogroup', { name: 'Tamanho' }).getByRole('radio').filter({ hasNotText: 'esgotado' }).first().click();
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).first().click();
  await expect(page.getByText(/no carrinho/)).toBeVisible();

  await page.goto('/carrinho');
  await expect(page.getByText('Total', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar compra' }).click();

  await page.getByLabel('Nome completo', { exact: true }).fill('Cliente E2E');
  await page.getByLabel('Telefone (WhatsApp)', { exact: true }).fill('11977776666');
  await page.getByLabel('CEP', { exact: true }).fill('01310-100');
  await page.getByLabel('Rua', { exact: true }).fill('Av. Paulista');
  await page.getByLabel('Número', { exact: true }).fill('1000');
  await page.getByLabel('Bairro', { exact: true }).fill('Bela Vista');
  await page.getByLabel('Cidade', { exact: true }).fill('São Paulo');

  // Termos são obrigatórios.
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page.getByText('Aceite os termos para continuar')).toBeVisible();
  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  // Sem provedor configurado, o pedido fica aguardando pagamento (nunca "pago" pelo navegador).
  await expect(page.getByRole('heading', { name: /Pedido recebido/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aguardando pagamento' })).toBeVisible();
});

test('link exclusivo inválido não abre a seleção', async ({ page }) => {
  await page.goto('/c/token-que-nao-existe-1234567890');
  await expect(page.getByRole('heading', { name: /Link indisponível/ })).toBeVisible();
});

test('painel exige login e mostra indicadores', async ({ page }) => {
  await page.goto('/admin/pedidos');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel('E-mail').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com');
  await page.getByLabel('Senha').fill(process.env.E2E_ADMIN_PASSWORD ?? 'palace-dev-12345');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible();
  await expect(page.getByText('Cliente E2E').first()).toBeVisible();
});
