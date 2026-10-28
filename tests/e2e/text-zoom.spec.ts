import { expect, test } from '@playwright/test';

test('320px layout supports simulated 200% text enlargement and intervention controls', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  const enlarge = async () =>
    page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          'h1,h2,h3,p,span,small,strong,button,label,summary,input,select,dt,dd,td,th',
        ),
      ].filter(
        (element) =>
          !element.hasAttribute('data-text-enlarged') &&
          (['INPUT', 'SELECT'].includes(element.tagName) ||
            [...element.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            )),
      );
      const sizes = targets.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      targets.forEach((element, i) => {
        element.style.fontSize = `${sizes[i]! * 2}px`;
        element.setAttribute('data-text-enlarged', 'true');
      });
    });
  await enlarge();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Laboratory', exact: true }).click();
  await page.getByRole('searchbox').fill('R:J11:J21');
  await enlarge();
  await page.getByRole('button', { name: /Road J11 ↔ J21/ }).click();
  await enlarge();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close J11 → J21', exact: true }).click();
  await page.getByRole('button', { name: 'Step one tick' }).click();
  await expect(page.getByText('Closed to new entry · empty')).toBeVisible();
  await page.screenshot({ path: info.outputPath('text-enlargement.png'), fullPage: true });
});
