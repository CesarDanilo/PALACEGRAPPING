import { expect, test, type Page } from '@playwright/test';

// Layout, acessibilidade básica e validação em 4 larguras. É emulação de viewport
// no Chromium (com toque e user agent móvel abaixo de 768 px), não um aparelho real.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'palace-dev-12345';
const PRODUCT = process.env.E2E_PRODUCT_SLUG ?? 'shorts-fight-day';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('E-mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Senha').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Painel', exact: true })).toBeVisible();
}

async function addToCart(page: Page) {
  await page.goto(`/produto/${PRODUCT}`);
  const colors = page.getByRole('radiogroup', { name: 'Cor' });
  if (await colors.count()) await colors.getByRole('radio').first().click();
  await page.getByRole('radiogroup', { name: 'Tamanho' }).getByRole('radio').filter({ hasNotText: 'esgotado' }).first().click();
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).first().click();
  await expect(page.getByText(/no carrinho/)).toBeVisible();
}

/** Sem rolagem horizontal e todo campo visível com nome acessível. */
async function expectLayoutOk(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const report = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const unlabeled = [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')]
      .filter((el) => el.type !== 'hidden' && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .filter((el) => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')))
      .map((el) => el.outerHTML.slice(0, 80));
    return { scrollWidth: document.documentElement.scrollWidth, width, unlabeled };
  });
  expect(report.scrollWidth, `${label}: rolagem horizontal`).toBeLessThanOrEqual(report.width);
  expect(report.unlabeled, `${label}: campos sem rótulo`).toEqual([]);
}

const storeRoutes = ['/', '/loja', '/categoria/kimonos', `/produto/${PRODUCT}`, '/carrinho'];
const adminRoutes = ['/admin', '/admin/produtos/novo', '/admin/estoque', '/admin/pedidos', '/admin/pedidos/quadro', '/admin/pedidos/novo', '/admin/clientes', '/admin/catalogos', '/admin/financeiro', '/admin/configuracoes'];

for (const width of [320, 390, 768, 1280]) {
  const mobile = width < 768;
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: mobile, hasTouch: mobile });

    test('loja: sem overflow e com rótulos', async ({ page }) => {
      for (const route of storeRoutes) {
        await page.goto(route);
        await expectLayoutOk(page, route);
      }
      await addToCart(page);
      await page.goto('/checkout');
      await expect(page.getByRole('heading', { name: /Finalizar|Checkout|Entrega/i }).first()).toBeVisible();
      await expectLayoutOk(page, '/checkout');
    });

    test('painel: navegação, sem overflow e com rótulos', async ({ page }) => {
      await login(page);
      for (const route of adminRoutes) {
        await page.goto(route);
        await expectLayoutOk(page, route);
      }
      const menuButton = page.getByRole('button', { name: 'Abrir menu do painel' });
      if (width < 1024) {
        // Gaveta: abre, navega, fecha ao trocar de página; Esc devolve o foco ao botão.
        await expect(page.getByRole('link', { name: 'Pedidos', exact: true })).toBeHidden();
        await menuButton.click();
        await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
        await page.getByRole('link', { name: 'Pedidos', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Estoque' })).toBeHidden();
        await menuButton.click();
        await page.keyboard.press('Escape');
        await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
        await expect(menuButton).toBeFocused();
      } else {
        await expect(menuButton).toBeHidden();
        await expect(page.getByRole('link', { name: 'Pedidos', exact: true })).toBeVisible();
      }
    });
  });
}

test.describe('validação e teclado', () => {
  test('checkout mostra erros por campo e não envia', async ({ page }) => {
    await addToCart(page);
    await page.goto('/checkout');
    let posted = false;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/checkout/orders')) posted = true;
    });
    await page.getByLabel('Nome completo', { exact: true }).fill('Ana');
    await page.getByLabel('Telefone (WhatsApp)', { exact: true }).fill('(20) 98888-7777');
    await page.getByLabel('CEP', { exact: true }).fill('0131');
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await expect(page.getByText('Informe nome e sobrenome')).toBeVisible();
    await expect(page.getByText(/Telefone com DDD válido/)).toBeVisible();
    await expect(page.getByText('CEP com 8 dígitos')).toBeVisible();
    await expect(page.getByLabel('Nome completo', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toBe(false);
  });

  test('cadastro de produto valida variantes antes de chamar a API', async ({ page }) => {
    await login(page);
    await page.goto('/admin/produtos/novo');
    await page.getByLabel('Nome', { exact: true }).fill('Produto de teste');
    await page.getByLabel('Preço', { exact: true }).fill('199,90');
    await page.getByLabel('Preço promocional (opcional)').fill('250,00');
    await page.getByRole('spinbutton', { name: 'Estoque inicial' }).fill('-2');
    await page.getByRole('button', { name: 'Criar produto' }).click();
    await expect(page.getByText('O promocional deve ser menor que o preço')).toBeVisible();
    await expect(page.getByText('Informe o SKU')).toBeVisible();
    await expect(page.getByText('Não pode ser negativo')).toBeVisible();

    await page.getByRole('button', { name: 'Adicionar variante' }).click();
    await page.getByRole('textbox', { name: 'SKU', exact: true }).nth(0).fill('E2E-DUP');
    await page.getByRole('textbox', { name: 'SKU', exact: true }).nth(1).fill('e2e-dup');
    await page.getByRole('button', { name: 'Criar produto' }).click();
    await expect(page.getByText('SKU repetido')).toBeVisible();
  });

  test('troca de senha confere a confirmação', async ({ page }) => {
    await login(page);
    await page.goto('/admin/configuracoes');
    await page.getByLabel('Senha atual').fill(ADMIN_PASSWORD);
    await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenhaForte2026');
    await page.getByLabel('Confirme a nova senha').fill('OutraSenha2026');
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    await expect(page.getByText('As senhas não conferem')).toBeVisible();
    await page.getByLabel('Nova senha', { exact: true }).fill('curta');
    await page.getByRole('button', { name: 'Alterar senha' }).click();
    await expect(page.getByText('Pelo menos 12 caracteres')).toBeVisible();
  });

  test('teclado: link para pular ao conteúdo e foco visível', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();
    // O próximo Tab chega a um elemento interativo com contorno de foco.
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { tag: el.tagName, outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });
    expect(['A', 'BUTTON', 'INPUT']).toContain(outline.tag);
    expect(outline.outline !== 'none' || outline.shadow !== 'none').toBe(true);
  });
});
