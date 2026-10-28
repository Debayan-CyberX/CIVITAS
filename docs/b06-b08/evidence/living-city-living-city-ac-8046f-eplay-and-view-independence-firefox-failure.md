# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: living-city.spec.ts >> living city: acknowledged closure, reopen, export, exact replay and view independence
- Location: tests\e2e\living-city.spec.ts:28:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Road R:J11:J21', exact: true })
    - locator resolved to <g tabindex="0" role="button" aria-label="Road R:J11:J21">…</g>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <polyline stroke-width="2.4" stroke="transparent" points="348,268.4 192,268.4"></polyline> from <g>…</g> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <polyline stroke-width="2.4" stroke="transparent" points="348,268.4 192,268.4"></polyline> from <g>…</g> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    162 × waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <polyline stroke-width="2.4" stroke="transparent" points="348,268.4 192,268.4"></polyline> from <g>…</g> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- main [ref=e3]:
    - generic [ref=e4]:
        - link [ref=e5] [cursor=pointer]:
            - /url: /
            - generic [aria-hidden] [ref=e6]: C
            - heading "CIVITAS" [level=1] [ref=e7]
        - generic [ref=e8]: THE LIVING CITY
        - generic [ref=e10]:
            - text: Aster
            - generic [ref=e11]: Fictional city / v1
        - navigation "Workspace" [ref=e12]:
            - button "City" [ref=e13] [cursor=pointer]
            - button "Map" [active] [pressed] [ref=e16] [cursor=pointer]
            - button "Laboratory" [ref=e19] [cursor=pointer]
        - generic [ref=e22]: Local engine
        - button "Export run" [ref=e24] [cursor=pointer]:
            - text: Export run
            - generic [aria-hidden] [ref=e25]: ↗
    - region "City workspace" [ref=e26]:
        - generic "2D map viewport. Space to play or pause, period to step. Explore entities in Laboratory." [ref=e27]:
            - img "Aster interactive traffic map" [ref=e28]:
                - generic [ref=e29]: Kiln Quarter
                - generic [ref=e31]: Exchange
                - generic [ref=e33]: Foundry Reach
                - button "Building B000" [ref=e35] [cursor=pointer]
                - button "Building B001" [ref=e36] [cursor=pointer]
                - button "Building B002" [ref=e37] [cursor=pointer]
                - button "Building B003" [ref=e38] [cursor=pointer]
                - button "Building B004" [ref=e39] [cursor=pointer]
                - button "Building B005" [ref=e40] [cursor=pointer]
                - button "Building B006" [ref=e41] [cursor=pointer]
                - button "Building B007" [ref=e42] [cursor=pointer]
                - button "Building B008" [ref=e43] [cursor=pointer]
                - button "Building B009" [ref=e44] [cursor=pointer]
                - button "Building B010" [ref=e45] [cursor=pointer]
                - button "Building B011" [ref=e46] [cursor=pointer]
                - button "Building B012" [ref=e47] [cursor=pointer]
                - button "Building B013" [ref=e48] [cursor=pointer]
                - button "Building B014" [ref=e49] [cursor=pointer]
                - button "Building B015" [ref=e50] [cursor=pointer]
                - button "Building B100" [ref=e51] [cursor=pointer]
                - button "Building B101" [ref=e52] [cursor=pointer]
                - button "Building B102" [ref=e53] [cursor=pointer]
                - button "Building B103" [ref=e54] [cursor=pointer]
                - button "Building B104" [ref=e55] [cursor=pointer]
                - button "Building B105" [ref=e56] [cursor=pointer]
                - button "Building B106" [ref=e57] [cursor=pointer]
                - button "Building B107" [ref=e58] [cursor=pointer]
                - button "Building B108" [ref=e59] [cursor=pointer]
                - button "Building B109" [ref=e60] [cursor=pointer]
                - button "Building B110" [ref=e61] [cursor=pointer]
                - button "Building B111" [ref=e62] [cursor=pointer]
                - button "Building B112" [ref=e63] [cursor=pointer]
                - button "Building B113" [ref=e64] [cursor=pointer]
                - button "Building B114" [ref=e65] [cursor=pointer]
                - button "Building B115" [ref=e66] [cursor=pointer]
                - button "Building B200" [ref=e67] [cursor=pointer]
                - button "Building B201" [ref=e68] [cursor=pointer]
                - button "Building B202" [ref=e69] [cursor=pointer]
                - button "Building B203" [ref=e70] [cursor=pointer]
                - button "Building B204" [ref=e71] [cursor=pointer]
                - button "Building B205" [ref=e72] [cursor=pointer]
                - button "Building B206" [ref=e73] [cursor=pointer]
                - button "Building B207" [ref=e74] [cursor=pointer]
                - button "Building B208" [ref=e75] [cursor=pointer]
                - button "Building B209" [ref=e76] [cursor=pointer]
                - button "Building B210" [ref=e77] [cursor=pointer]
                - button "Building B211" [ref=e78] [cursor=pointer]
                - button "Building B212" [ref=e79] [cursor=pointer]
                - button "Building B213" [ref=e80] [cursor=pointer]
                - button "Building B214" [ref=e81] [cursor=pointer]
                - button "Building B215" [ref=e82] [cursor=pointer]
                - button "Road R:J00:J01" [ref=e83] [cursor=pointer]
                - button "Road R:J00:J10" [ref=e87] [cursor=pointer]
                - button "Road R:J01:J02" [ref=e91] [cursor=pointer]
                - button "Road R:J01:J11" [ref=e95] [cursor=pointer]
                - button "Road R:J02:J12" [ref=e99] [cursor=pointer]
                - button "Road R:J10:J11" [ref=e103] [cursor=pointer]
                - button "Road R:J10:J20" [ref=e107] [cursor=pointer]
                - button "Road R:J11:J12" [ref=e111] [cursor=pointer]
                - button "Road R:J11:J21" [ref=e115] [cursor=pointer]
                - button "Road R:J12:J22" [ref=e119] [cursor=pointer]
                - button "Road R:J20:J21" [ref=e123] [cursor=pointer]
                - button "Road R:J20:J30" [ref=e127] [cursor=pointer]
                - button "Road R:J21:J22" [ref=e131] [cursor=pointer]
                - button "Road R:J21:J31" [ref=e135] [cursor=pointer]
                - button "Road R:J22:J32" [ref=e139] [cursor=pointer]
                - button "Road R:J30:J31" [ref=e143] [cursor=pointer]
                - button "Road R:J31:J32" [ref=e147] [cursor=pointer]
                - button "Junction J00, Green, north approach" [ref=e219] [cursor=pointer]: J00
                - button "Junction J01, Green, north approach" [ref=e221] [cursor=pointer]: J01
                - button "Junction J02, Green, east approach" [ref=e223] [cursor=pointer]: J02
                - button "Junction J10, Green, north approach" [ref=e225] [cursor=pointer]: J10
                - button "Junction J11, Green, north approach" [ref=e227] [cursor=pointer]: J11
                - button "Junction J12, Green, east approach" [ref=e229] [cursor=pointer]: J12
                - button "Junction J20, Green, north approach" [ref=e231] [cursor=pointer]: J20
                - button "Junction J21, Green, north approach" [ref=e233] [cursor=pointer]: J21
                - button "Junction J22, Green, east approach" [ref=e235] [cursor=pointer]: J22
                - button "Junction J30, Green, north approach" [ref=e237] [cursor=pointer]: J30
                - button "Junction J31, Green, north approach" [ref=e239] [cursor=pointer]: J31
                - button "Junction J32, Green, south approach" [ref=e241] [cursor=pointer]: J32
                - generic [ref=e243]: N100 m · local metric frame
        - generic:
            - paragraph [ref=e246]:
                - text: LOCAL URBAN OBSERVATORY
                - generic [ref=e247]: 01 / ASTER
            - heading [level=2] [ref=e248]:
                - text: A city in
                - emphasis [ref=e249]: motion.
            - paragraph [ref=e250]: Explore the streets.Understand what moves them.
            - generic [ref=e251]:
                - generic [ref=e252]: 3 districts
                - generic [ref=e253]: 17 streets
                - generic [ref=e254]: 48 model buildings
            - generic "District focus" [ref=e255]:
                - button "01 Kiln Quarter" [ref=e256] [cursor=pointer]:
                    - generic [ref=e257]: '01'
                    - generic [ref=e258]: Kiln Quarter
                    - generic [aria-hidden] [ref=e259]: ↗
                - button "02 Exchange" [ref=e260] [cursor=pointer]:
                    - generic [ref=e261]: '02'
                    - generic [ref=e262]: Exchange
                    - generic [aria-hidden] [ref=e263]: ↗
                - button "03 Foundry Reach" [ref=e264] [cursor=pointer]:
                    - generic [ref=e265]: '03'
                    - generic [ref=e266]: Foundry Reach
                    - generic [aria-hidden] [ref=e267]: ↗
            - paragraph [ref=e268]: Deterministic traffic modelVisual dressing adds no traffic routes.
        - generic [ref=e269]:
            - generic [ref=e271]: NETWORK MAP
            - generic [ref=e272]: LOCAL METRIC FRAME · NORTH UP
        - generic [ref=e274]: 'N'
        - generic "Viewport navigation" [ref=e278]:
            - button "Zoom in" [ref=e279] [cursor=pointer]: +
            - button "Zoom out" [ref=e280] [cursor=pointer]: −
            - button "Pan north" [ref=e281] [cursor=pointer]: ↑
            - button "Pan south" [ref=e282] [cursor=pointer]: ↓
            - button "Pan west" [ref=e283] [cursor=pointer]: ←
            - button "Pan east" [ref=e284] [cursor=pointer]: →
            - button "Reset camera" [ref=e285] [cursor=pointer]: ⌂
        - generic [ref=e286]:
            - generic [ref=e287]: Live signal
            - generic [ref=e289]: Measured queue
            - generic [ref=e291]: Closed entry
    - generic [ref=e293]:
        - generic "Network measurements" [ref=e294]:
            - group [ref=e295]:
                - generic "In network 0vehicles" [ref=e296] [cursor=pointer]:
                    - generic [ref=e297]: In network
                    - strong [ref=e298]: 0vehicles
            - group [ref=e299]:
                - generic "Mean network speed —km/h" [ref=e300] [cursor=pointer]:
                    - generic [ref=e301]: Mean network speed
                    - strong [ref=e302]: —km/h
            - group [ref=e303]:
                - generic "Completed throughput —veh/h" [ref=e304] [cursor=pointer]:
                    - generic [ref=e305]: Completed throughput
                    - strong [ref=e306]: —veh/h
            - group [ref=e307]:
                - generic "Unfinished requests 0requests" [ref=e308] [cursor=pointer]:
                    - generic [ref=e309]: Unfinished requests
                    - strong [ref=e310]: 0requests
        - generic [ref=e311]:
            - generic [ref=e312]:
                - button "Play simulation" [ref=e313] [cursor=pointer]:
                    - generic [aria-hidden] [ref=e314]: ▶
                    - text: Play
                - button "Step one tick" [ref=e315] [cursor=pointer]:
                    - text: Step
                    - generic [aria-hidden] [ref=e316]: ›|
                - button "Reset experiment" [ref=e317] [cursor=pointer]
            - generic [ref=e320]:
                - strong [ref=e321]: 00:00.0
                - generic [ref=e322]: Paused · exact snapshot · tick 0
            - generic "Elapsed 00:00.0 of 15 simulated minutes" [ref=e323]:
                - generic [ref=e324]: 00:00
                - generic [ref=e326]: 15:00
            - generic [ref=e327]:
                - text: Speed
                - combobox "Simulation speed" [ref=e328]:
                    - option "0.25×"
                    - option "1×" [selected]
                    - option "2×"
                    - option "4×"
        - generic [ref=e329]:
            - paragraph [ref=e330]: Experiment ready · paused at origin.
            - generic [ref=e332]: 0 source queued (t0) · 0 not admitted (t0)
        - generic [ref=e333]: Experiment ready · paused at origin.
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | import type { Page } from '@playwright/test';
  3   | import AxeBuilder from '@axe-core/playwright';
  4   | import { readFile } from 'node:fs/promises';
  5   | import type { EngineArtifact } from '@civitas/contracts';
  6   |
  7   | async function ready(page: Page) {
  8   |   await page.goto('/');
  9   |   await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  10  |   await expect(page.getByTestId('run-state')).toContainText('tick 0');
  11  | }
  12  | async function exported(page: Page) {
  13  |   const download = page.waitForEvent('download');
  14  |   await page.getByRole('button', { name: 'Export run', exact: false }).first().click();
  15  |   const file = await download;
  16  |   const path = await file.path();
  17  |   if (!path) throw new Error('Missing downloaded run');
  18  |   return await readFile(path, 'utf8');
  19  | }
  20  | async function labTab(page: Page, name: string) {
  21  |   const lab = page.getByRole('complementary', { name: 'Simulation laboratory' });
  22  |   if (!(await lab.isVisible()))
  23  |     await page.getByRole('button', { name: 'Laboratory', exact: true }).click();
  24  |   await lab.getByRole('button', { name, exact: true }).click();
  25  |   return lab;
  26  | }
  27  |
  28  | test('living city: acknowledged closure, reopen, export, exact replay and view independence', async ({
  29  |   page,
  30  | }, info) => {
  31  |   test.setTimeout(90000);
  32  |   const errors: string[] = [];
  33  |   page.on('pageerror', (e) => errors.push(e.message));
  34  |   await ready(page);
  35  |   await page.getByRole('button', { name: 'Map', exact: true }).click();
> 36  |   await page.getByRole('button', { name: 'Road R:J11:J21', exact: true }).click();
      |                                                                           ^ Error: locator.click: Test timeout of 90000ms exceeded.
  37  |   const inspector = page.getByRole('complementary', { name: 'Entity inspector' });
  38  |   await expect(inspector.getByRole('heading', { name: 'R:J11:J21' })).toBeVisible();
  39  |   await inspector.getByRole('button', { name: 'Close J11 → J21', exact: true }).click();
  40  |   await expect(inspector.getByText('Close pending · tick 1')).toBeVisible();
  41  |   await expect(page.getByTestId('run-state')).toContainText('tick 0');
  42  |   await page.getByRole('button', { name: 'Step one tick' }).click();
  43  |   await expect(inspector.getByText('Closed to new entry · empty')).toBeVisible();
  44  |   await expect(page.getByTestId('run-state')).toContainText('tick 1');
  45  |   await inspector.getByRole('button', { name: 'Reopen J11 → J21', exact: true }).click();
  46  |   await expect(inspector.getByText('Reopen pending · tick 2')).toBeVisible();
  47  |   await page.getByRole('button', { name: 'Step one tick' }).click();
  48  |   await expect(
  49  |     inspector.getByRole('button', { name: 'Close J11 → J21', exact: true }),
  50  |   ).toBeEnabled();
  51  |   const before = JSON.parse(await exported(page)) as EngineArtifact;
  52  |   expect(before.commands).toHaveLength(2);
  53  |   expect(
  54  |     before.events
  55  |       .filter((e) => e.type === 'CLOSURE_APPLIED' || e.type === 'LANE_REOPENED')
  56  |       .map((e) => e.tick),
  57  |   ).toEqual([1, 2]);
  58  |   await page.getByRole('button', { name: 'Pan north', exact: true }).click();
  59  |   await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  60  |   await page.getByRole('button', { name: 'Reset camera' }).click();
  61  |   const cityButton = page.getByRole('button', { name: 'City', exact: true });
  62  |   if (await cityButton.isEnabled()) {
  63  |     await cityButton.click();
  64  |     await expect(page.locator('canvas')).toBeVisible();
  65  |     await page.getByRole('button', { name: 'Focus in city' }).click();
  66  |   }
  67  |   const lab = await labTab(page, 'Display');
  68  |   await lab.getByLabel('City quality').selectOption('reduced');
  69  |   await lab.getByLabel('Authoritative geometry only').check();
  70  |   await page.getByRole('button', { name: 'Map', exact: true }).click();
  71  |   const after = JSON.parse(await exported(page)) as EngineArtifact;
  72  |   expect(after.outcome.finalHash).toBe(before.outcome.finalHash);
  73  |   expect(after.outcome.eventDigest).toBe(before.outcome.eventDigest);
  74  |   await labTab(page, 'Experiment');
  75  |   await lab.getByRole('button', { name: 'Verify replay from origin' }).click();
  76  |   await expect(page.locator('.console-meta p')).toContainText(
  77  |     'Replay from origin verified through tick 2',
  78  |   );
  79  |   await lab.locator('input[type=file]').setInputFiles({
  80  |     name: 'run.json',
  81  |     mimeType: 'application/json',
  82  |     buffer: Buffer.from(JSON.stringify(before)),
  83  |   });
  84  |   await expect(page.locator('.console-meta p')).toContainText('Restored paused at tick 2');
  85  |   const restored = JSON.parse(await exported(page)) as EngineArtifact;
  86  |   expect(restored.outcome.finalHash).toBe(before.outcome.finalHash);
  87  |   await info.attach('closure-replay-evidence', {
  88  |     body: JSON.stringify(
  89  |       { commands: restored.commands, outcome: restored.outcome, browser: restored.compatibility },
  90  |       null,
  91  |       2,
  92  |     ),
  93  |     contentType: 'application/json',
  94  |   });
  95  |   await lab.locator('input[type=file]').setInputFiles({
  96  |     name: 'invalid.json',
  97  |     mimeType: 'application/json',
  98  |     buffer: Buffer.from('{}'),
  99  |   });
  100 |   await expect(page.getByRole('alert')).toBeVisible();
  101 |   expect(errors).toEqual([]);
  102 | });
  103 |
  104 | for (const fleet of [100, 200, 300])
  105 |   test(`configured fleet ${fleet}: live counts reconcile between scene, map and worker`, async ({
  106 |     page,
  107 |   }, info) => {
  108 |     test.setTimeout(60000);
  109 |     await ready(page);
  110 |     const lab = await labTab(page, 'Experiment');
  111 |     await lab.getByLabel('Configured vehicle agents').selectOption(String(fleet));
  112 |     await lab.getByLabel('Validated seed').selectOption('130363');
  113 |     await lab.getByRole('button', { name: 'Start new experiment' }).click();
  114 |     await expect(page.getByTestId('run-state')).toContainText('tick 0');
  115 |     await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  116 |     await page.getByRole('button', { name: 'Close laboratory' }).click();
  117 |     await page.getByLabel('Simulation speed').selectOption('4');
  118 |     await page.getByRole('button', { name: 'Play simulation' }).click();
  119 |     await expect
  120 |       .poll(async () => await page.getByTestId('run-state').innerText(), { timeout: 15000 })
  121 |       .toMatch(/tick (?:[4-9]\d|[1-9]\d{2,})\b/);
  122 |     await page.getByRole('button', { name: 'Pause simulation' }).click();
  123 |     const artifact = JSON.parse(await exported(page)) as EngineArtifact;
  124 |     const state = artifact.checkpoints.at(-1)!.state;
  125 |     const inNetwork = state.agents.filter(
  126 |       (a) => a.location.kind === 'ON_LANE' || a.location.kind === 'ON_CONNECTOR',
  127 |     ).length;
  128 |     expect(state.agents).toHaveLength(fleet);
  129 |     expect(inNetwork).toBeGreaterThan(0);
  130 |     const canvas = page.locator('canvas');
  131 |     if (await canvas.count())
  132 |       await expect(canvas).toHaveAttribute('data-visible-vehicles', String(inNetwork));
  133 |     await page.getByRole('button', { name: 'Map', exact: true }).click();
  134 |     await expect(page.getByLabel('Aster interactive traffic map')).toHaveAttribute(
  135 |       'data-visible-vehicles',
  136 |       String(inNetwork),
```
