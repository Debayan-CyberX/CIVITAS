import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { EngineArtifact } from '@civitas/contracts';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  await expect(page.getByTestId('run-state')).toContainText('tick 0');
}
async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export run', exact: false }).first().click();
  const file = await download;
  const path = await file.path();
  if (!path) throw new Error('Missing downloaded run');
  return await readFile(path, 'utf8');
}
async function labTab(page: Page, name: string) {
  const lab = page.getByRole('complementary', { name: 'Simulation laboratory' });
  if (!(await lab.isVisible()))
    await page.getByRole('button', { name: 'Laboratory', exact: true }).click();
  await lab.getByRole('button', { name, exact: true }).click();
  return lab;
}

test('living city: acknowledged closure, reopen, export, exact replay and view independence', async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Road R:J11:J21', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Entity inspector' });
  await expect(inspector.getByRole('heading', { name: 'R:J11:J21' })).toBeVisible();
  await inspector.getByRole('button', { name: 'Close J11 → J21', exact: true }).click();
  await expect(inspector.getByText('Close pending · tick 1')).toBeVisible();
  await expect(page.getByTestId('run-state')).toContainText('tick 0');
  await page.getByRole('button', { name: 'Step one tick' }).click();
  await expect(inspector.getByText('Closed to new entry · empty')).toBeVisible();
  await expect(page.getByTestId('run-state')).toContainText('tick 1');
  await inspector.getByRole('button', { name: 'Reopen J11 → J21', exact: true }).click();
  await expect(inspector.getByText('Reopen pending · tick 2')).toBeVisible();
  await page.getByRole('button', { name: 'Step one tick' }).click();
  await expect(
    inspector.getByRole('button', { name: 'Close J11 → J21', exact: true }),
  ).toBeEnabled();
  const before = JSON.parse(await exported(page)) as EngineArtifact;
  expect(before.commands).toHaveLength(2);
  expect(
    before.events
      .filter((e) => e.type === 'CLOSURE_APPLIED' || e.type === 'LANE_REOPENED')
      .map((e) => e.tick),
  ).toEqual([1, 2]);
  await page.getByRole('button', { name: 'Pan north', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Reset camera' }).click();
  const cityButton = page.getByRole('button', { name: 'City', exact: true });
  if (await cityButton.isEnabled()) {
    await cityButton.click();
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Focus in city' }).click();
  }
  const lab = await labTab(page, 'Display');
  await lab.getByLabel('City quality').selectOption('reduced');
  await lab.getByLabel('Authoritative geometry only').check();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  const after = JSON.parse(await exported(page)) as EngineArtifact;
  expect(after.outcome.finalHash).toBe(before.outcome.finalHash);
  expect(after.outcome.eventDigest).toBe(before.outcome.eventDigest);
  await labTab(page, 'Experiment');
  await lab.getByRole('button', { name: 'Verify replay from origin' }).click();
  await expect(page.locator('.console-meta p')).toContainText(
    'Replay from origin verified through tick 2',
  );
  await lab.locator('input[type=file]').setInputFiles({
    name: 'run.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(before)),
  });
  await expect(page.locator('.console-meta p')).toContainText('Restored paused at tick 2');
  const restored = JSON.parse(await exported(page)) as EngineArtifact;
  expect(restored.outcome.finalHash).toBe(before.outcome.finalHash);
  await info.attach('closure-replay-evidence', {
    body: JSON.stringify(
      { commands: restored.commands, outcome: restored.outcome, browser: restored.compatibility },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await lab.locator('input[type=file]').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const fleet of [100, 200, 300])
  test(`configured fleet ${fleet}: live counts reconcile between scene, map and worker`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await ready(page);
    const lab = await labTab(page, 'Experiment');
    await lab.getByLabel('Configured vehicle agents').selectOption(String(fleet));
    await lab.getByLabel('Validated seed').selectOption('130363');
    await lab.getByRole('button', { name: 'Start new experiment' }).click();
    await expect(page.getByTestId('run-state')).toContainText('tick 0');
    await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
    await page.getByRole('button', { name: 'Close laboratory' }).click();
    await page.getByLabel('Simulation speed').selectOption('4');
    await page.getByRole('button', { name: 'Play simulation' }).click();
    await expect
      .poll(async () => await page.getByTestId('run-state').innerText(), { timeout: 15000 })
      .toMatch(/tick (?:[4-9]\d|[1-9]\d{2,})\b/);
    await page.getByRole('button', { name: 'Pause simulation' }).click();
    const artifact = JSON.parse(await exported(page)) as EngineArtifact;
    const state = artifact.checkpoints.at(-1)!.state;
    const inNetwork = state.agents.filter(
      (a) => a.location.kind === 'ON_LANE' || a.location.kind === 'ON_CONNECTOR',
    ).length;
    expect(state.agents).toHaveLength(fleet);
    expect(inNetwork).toBeGreaterThan(0);
    const canvas = page.locator('canvas');
    if (await canvas.count())
      await expect(canvas).toHaveAttribute('data-visible-vehicles', String(inNetwork));
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByLabel('Aster interactive traffic map')).toHaveAttribute(
      'data-visible-vehicles',
      String(inNetwork),
    );
    expect(
      state.agents.filter((a) => a.location.kind === 'PARKED').length +
        state.agents.filter((a) => a.location.kind === 'SOURCE_QUEUED').length +
        inNetwork,
    ).toBe(fleet);
    await info.attach('visible-count-reconciliation', {
      body: JSON.stringify({
        fleet,
        inNetwork,
        tick: state.tick,
        compatibility: artifact.compatibility,
      }),
      contentType: 'application/json',
    });
    const explore = await labTab(page, 'Explore');
    const active = state.agents.find((a) => a.location.kind === 'ON_LANE')!;
    await explore.getByRole('searchbox').fill(active.id);
    await explore.getByRole('button', { name: new RegExp(`Vehicle ${active.id}`) }).click();
    await expect(
      page.getByRole('complementary', { name: 'Entity inspector' }).getByText(/^Route 1:/),
    ).toBeVisible();
  });

test('WebGL unavailable: keyboard closure and playback remain functional', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
      .value as HTMLCanvasElement['getContext'];
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, ...args: [string, unknown?]) {
        if (args[0].startsWith('webgl')) return null;
        const result: unknown = Reflect.apply(original, this, args);
        return result;
      },
    });
  });
  await ready(page);
  await expect(page.getByLabel('Aster interactive traffic map')).toBeVisible();
  await expect(page.getByRole('button', { name: 'City', exact: true })).toBeDisabled();
  const road = page.getByRole('button', { name: 'Road R:J11:J21', exact: true });
  await road.focus();
  await page.keyboard.press('Enter');
  const close = page.getByRole('button', { name: 'Close J11 → J21', exact: true });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Close pending · tick 1')).toBeVisible();
  const viewport = page.locator('.viewport');
  await viewport.focus();
  await page.keyboard.press('.');
  await expect(page.getByTestId('run-state')).toContainText('tick 1');
  await expect(page.getByText('Closed to new entry · empty')).toBeVisible();
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: 'Pause simulation' })).toBeEnabled();
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Entity inspector' })).toHaveCount(0);
});

test('graphics context loss preserves tick, closure and selection', async ({ page }) => {
  await ready(page);
  if (await page.getByRole('button', { name: 'City', exact: true }).isDisabled()) {
    test.skip(
      true,
      'WebGL2 unavailable in this browser binary; independent fallback covered separately.',
    );
    return;
  }
  await expect(page.locator('canvas')).toBeVisible();
  const lab = await labTab(page, 'Explore');
  await lab.getByRole('searchbox').fill('R:J11:J21');
  await lab.getByRole('button', { name: /Road J11 ↔ J21/ }).click();
  await page.getByRole('button', { name: 'Close J11 → J21', exact: true }).click();
  await page.getByRole('button', { name: 'Step one tick' }).click();
  const before = JSON.parse(await exported(page)) as EngineArtifact;
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.getByLabel('Aster interactive traffic map')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'R:J11:J21' })).toBeVisible();
  const after = JSON.parse(await exported(page)) as EngineArtifact;
  expect(after.outcome.finalHash).toBe(before.outcome.finalHash);
  await page.getByRole('button', { name: 'City', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
});

for (const viewport of [
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
])
  test(`responsive ${viewport.width}px and reduced motion accessibility`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    if (viewport.width < 600)
      await expect(page.getByLabel('Aster interactive traffic map')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await labTab(page, 'Display');
    await expect(page.getByLabel('Reduced motion / static snapshot symbols')).toBeChecked();
    await page.getByRole('button', { name: 'Close laboratory' }).click();
    await page.getByRole('button', { name: 'Step one tick' }).click();
    await expect(page.getByTestId('run-state')).toContainText('tick 1');
    await page.screenshot({
      path: info.outputPath(`viewport-${viewport.width}.png`),
      fullPage: true,
    });
  });

test('application accessibility: loaded, selected, evidence and reset dialog', async ({ page }) => {
  test.setTimeout(60000);
  await ready(page);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  const check = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);
  };
  await check();
  await page.getByRole('button', { name: 'Road R:J11:J21', exact: true }).click();
  await check();
  await labTab(page, 'Evidence');
  await check();
  await page.getByRole('button', { name: 'Step one tick' }).click();
  await page.getByRole('button', { name: 'Reset experiment' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Reset experiment' })).toBeFocused();
});

test('worker failure offers explicit recovery of the last exported run', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        Reflect.set(window, 'civitasFaultWorker', this);
      }
    };
  });
  await ready(page);
  await page.getByRole('button', { name: 'Step one tick' }).click();
  const before = JSON.parse(await exported(page)) as EngineArtifact;
  await page.evaluate(() => {
    const worker = Reflect.get(window, 'civitasFaultWorker') as Worker;
    worker.dispatchEvent(new ErrorEvent('error', { message: 'Injected worker fault' }));
  });
  await expect(page.getByRole('alert')).toContainText('Simulation worker failed');
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeDisabled();
  const lab = await labTab(page, 'Experiment');
  await lab.getByRole('button', { name: 'Recover last exported run' }).click();
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  const after = JSON.parse(await exported(page)) as EngineArtifact;
  expect(after.outcome.finalHash).toBe(before.outcome.finalHash);
});

test('snapshot starvation freezes Map symbols and reports stale evidence', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    Reflect.set(window, 'civitasDropSnapshots', false);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event: MessageEvent<unknown>) => {
          const message = event.data as { type: string };
          if (message.type === 'SNAPSHOT' && Reflect.get(window, 'civitasDropSnapshots'))
            event.stopImmediatePropagation();
        });
      }
    };
  });
  await ready(page);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByLabel('Simulation speed').selectOption('4');
  await page.getByRole('button', { name: 'Play simulation' }).click();
  const map = page.getByLabel('Aster interactive traffic map');
  await expect
    .poll(async () => Number(await map.getAttribute('data-visible-vehicles')))
    .toBeGreaterThan(0);
  await page.evaluate(() => Reflect.set(window, 'civitasDropSnapshots', true));
  await expect(page.locator('.stale-notice')).toBeVisible();
  const before = await map
    .locator('[data-slot]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')));
  await page.waitForTimeout(500);
  const after = await map
    .locator('[data-slot]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')));
  expect(after).toEqual(before);
  await page.evaluate(() => Reflect.set(window, 'civitasDropSnapshots', false));
  await expect(page.locator('.stale-notice')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause simulation' }).click();
});

test('presentation cadence at 30, 60 and 120 callbacks per second cannot change a run', async ({
  browser,
}, info) => {
  test.setTimeout(90000);
  const outcomes: {
    target: number;
    hash: string;
    digest: string;
    measuredFrameIntervalsMs: number[];
  }[] = [];
  for (const cadence of [30, 60, 120]) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      deviceScaleFactor: 1,
      viewport: { width: 1280, height: 720 },
    });
    await context.addInitScript((rate) => {
      // Synthetic callback pacing tests authority independence; it is not a display refresh claim.
      window.requestAnimationFrame = (callback) =>
        window.setTimeout(() => callback(performance.now()), 1000 / rate);
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    }, cadence);
    const page = await context.newPage();
    await ready(page);
    const display = await labTab(page, 'Display');
    await display.getByLabel('City quality').selectOption('reduced');
    await display.getByRole('button', { name: 'Explore', exact: true }).click();
    const lab = await labTab(page, 'Explore');
    await lab.getByRole('searchbox').fill('R:J11:J21');
    await lab.getByRole('button', { name: /Road J11 ↔ J21/ }).click();
    await page.getByRole('button', { name: 'Close J11 → J21', exact: true }).click();
    for (let tick = 0; tick < 10; tick++) {
      await expect(page.getByRole('button', { name: 'Step one tick' })).toBeEnabled();
      await page.getByRole('button', { name: 'Step one tick' }).press('Enter');
      await expect(page.getByTestId('run-state')).toContainText(new RegExp(`tick ${tick + 1}$`));
    }
    await page.getByRole('button', { name: 'Reopen J11 → J21', exact: true }).click();
    for (let tick = 10; tick < 20; tick++) {
      await expect(page.getByRole('button', { name: 'Step one tick' })).toBeEnabled();
      await page.getByRole('button', { name: 'Step one tick' }).press('Enter');
      await expect(page.getByTestId('run-state')).toContainText(new RegExp(`tick ${tick + 1}$`));
    }
    await page.getByRole('button', { name: 'Close laboratory' }).click();
    await page.getByRole('button', { name: 'Pan north', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.waitForTimeout(1200);
    const intervals = (await page.locator('canvas').count())
      ? await page.locator('canvas').getAttribute('data-frame-samples')
      : null;
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    const artifact = JSON.parse(await exported(page)) as EngineArtifact;
    outcomes.push({
      target: cadence,
      hash: artifact.outcome.finalHash,
      digest: artifact.outcome.eventDigest,
      measuredFrameIntervalsMs: intervals ? (JSON.parse(intervals) as number[]) : [],
    });
    await context.close();
  }
  expect(new Set(outcomes.map((o) => o.hash)).size).toBe(1);
  expect(new Set(outcomes.map((o) => o.digest)).size).toBe(1);
  await info.attach('synthetic-presentation-cadence', {
    body: JSON.stringify(outcomes),
    contentType: 'application/json',
  });
});
