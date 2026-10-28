import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('production React shell validates a real module-worker round trip', async ({ page }) => {
  const errors: string[] = [];
  const workers: string[] = [];
  const remoteRequests: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('worker', (worker) => {
    workers.push(worker.url());
  });
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) remoteRequests.push(request.url());
  });
  await page.goto('/foundation');
  await expect(page.getByRole('heading', { name: 'CIVITAS', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Local worker connection verified.');
  expect(workers.some((url) => /\/assets\/probe\.worker-.*\.js$/.test(url))).toBe(true);
  expect(errors).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

test('unsupported Worker support is explicit without fabricated running state', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { value: undefined });
  });
  await page.goto('/foundation');
  await expect(page.getByRole('status')).toContainText('Local worker unavailable');
  await expect(
    page.getByText(
      'Simulation behavior and city visuals are not implemented in this work package.',
    ),
  ).toBeVisible();
});

test('foundation accessibility has no serious or critical axe issues', async ({ page }) => {
  await page.goto('/foundation');
  await expect(page.getByRole('status')).toHaveText('Local worker connection verified.');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
  ).toEqual([]);
});
