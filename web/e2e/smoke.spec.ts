import { expect, test } from '@playwright/test';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
});

test.afterEach(() => {
  expect(errors.filter((e) => !/favicon|Failed to load resource/.test(e))).toEqual([]);
});

test('landing explains the product and links into the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /launch app/i }).first().click();
  await expect(page).toHaveURL(/\/app$/);
});

test('demo mode gives a wallet and every page renders', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /try instant demo/i }).click();
  await expect(page.getByText(/testnet only · demo mode/i)).toBeVisible();
  const pages: [string, RegExp][] = [
    ['/app', /payroll control room/i],
    ['/app/agent', /agent/i],
    ['/me', /stream/i],
    ['/activity', /activity|audit|timeline/i],
    ['/docs', /safety|permission/i],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading, { timeout: 15_000 });
  }
});

test('payroll form validates a bad row before any wallet prompt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /try instant demo/i }).click();
  await page.goto('/app');
  await page.getByRole('textbox', { name: /^address$/i }).first().fill('0xnot-an-address');
  await page.getByRole('textbox', { name: /amount \(tusd8\)/i }).first().fill('100');
  await expect(page.getByText(/enter a valid recipient address/i).first()).toBeVisible();
});

test('agent page parses a plain-English payroll instruction', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /try instant demo/i }).click();
  await page.goto('/app/agent');
  await page
    .getByRole('textbox', { name: /payroll instruction/i })
    .fill('Pay 0x00000000000000000000000000000000000a11ce 400 over 3 months, 1 month cliff');
  await page.getByRole('button', { name: /send instruction/i }).click();
  await expect(page.getByText(/400/).first()).toBeVisible();
});

test('claim page for an unknown stream degrades honestly', async ({ page }) => {
  await page.goto('/claim/999999');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('theme toggle round-trips', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /switch to light theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
