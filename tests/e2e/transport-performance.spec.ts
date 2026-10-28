import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { prepareAster } from '@civitas/simulation';
import { digest } from '../../scripts/runtime';
import type * as Bridge from '../../apps/web/src/bridge/simulation-client';

test('preliminary worker transport budgets at 300 agents and 1x/4x', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  const inputs = await prepareAster(digest, 300);
  const manifest = JSON.parse(
    await readFile('apps/web/dist/.vite/manifest.json', 'utf8'),
  ) as Record<string, { file: string }>;
  const entry = manifest['src/bridge/simulation-client.ts'];
  if (!entry) throw new Error('Missing bridge entry');
  await page.goto('/');
  const result = await page.evaluate(
    async ({ url, inputs }) => {
      const module = (await import(url)) as typeof Bridge;
      const client = module.createSimulationClient('transport-performance');
      const acknowledgements: number[] = [],
        details: number[] = [];
      await client.request({
        type: 'INIT',
        city: inputs.city,
        scenario: inputs.scenario,
        manifest: inputs.manifest,
        expectedHashes: inputs.hashes,
        compatibility: client.identity,
      });
      for (let i = 0; i < 1200; i += 20)
        await Promise.all(Array.from({ length: 20 }, () => client.request({ type: 'STEP' })));
      const inNetwork =
        client
          .bufferedSnapshots()
          .at(-1)
          ?.agents.filter((a) => a[1] >= 2).length ?? 0;
      await client.request({ type: 'SET_SPEED', speed: 1 });
      await client.request({ type: 'PLAY' });
      for (let i = 0; i < 30; i++) {
        const before = performance.now();
        const ack = await client.request({
          type: 'SUBMIT',
          command: {
            commandId: `latency-${i}`,
            desiredTick: 9000,
            intervention: {
              type: 'OPEN_LANES',
              laneIds: ['L:J11>J21'],
              expectedTopologyVersion: 0,
            },
          },
        });
        acknowledgements.push(performance.now() - before);
        if (ack.type !== 'COMMAND_ACK') throw new Error('Missing command acknowledgement');
      }
      for (let i = 0; i < 30; i++) {
        const before = performance.now();
        await client.request({ type: 'GET_DETAILS', entityId: 'V000' });
        details.push(performance.now() - before);
      }
      await client.request({ type: 'PAUSE' });
      await client.request({ type: 'SET_SPEED', speed: 4 });
      const wallStart = performance.now();
      const start = await client.request({ type: 'PLAY' });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const end = await client.request({ type: 'PAUSE' });
      const elapsedMs = performance.now() - wallStart;
      if (start.type !== 'CONTROL_ACK' || end.type !== 'CONTROL_ACK')
        throw new Error('Missing boundary acknowledgements');
      const advancedTicks = end.authoritativeTick - start.authoritativeTick;
      const percentile = (values: number[], p: number) =>
        [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? 0;
      const summary = {
        runtime: client.identity,
        fleet: 300,
        inNetworkAtWarmup: inNetwork,
        asOfTick: end.authoritativeTick,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        commandSamples: acknowledgements.length,
        commandAckP50Ms: percentile(acknowledgements, 0.5),
        commandAckP95Ms: percentile(acknowledgements, 0.95),
        commandAckP99Ms: percentile(acknowledgements, 0.99),
        inspectionSamples: details.length,
        inspectionP95Ms: percentile(details, 0.95),
        fourTimes: { elapsedMs, advancedTicks, achievedSpeed: (advancedTicks * 100) / elapsedMs },
        maxBufferedSnapshots: client.bufferedSnapshots().length,
      };
      client.dispose();
      return summary;
    },
    { url: `/${entry.file}`, inputs },
  );
  expect(result.inNetworkAtWarmup).toBeGreaterThanOrEqual(100);
  expect(result.commandAckP95Ms).toBeLessThanOrEqual(250);
  expect(result.inspectionP95Ms).toBeLessThanOrEqual(100);
  expect(result.fourTimes.achievedSpeed).toBeGreaterThanOrEqual(3.6);
  expect(
    Math.abs(result.fourTimes.advancedTicks - (result.fourTimes.elapsedMs * 4) / 100),
  ).toBeLessThanOrEqual(2);
  expect(result.maxBufferedSnapshots).toBeLessThanOrEqual(3);
  await mkdir('artifacts/local/b02-b05/browser', { recursive: true });
  await writeFile(
    `artifacts/local/b02-b05/browser/${browserName}-transport.json`,
    JSON.stringify(
      {
        ...result,
        browser: browserName,
        browserVersion: page.context().browser()?.version(),
        scope:
          'Preliminary worker transport after 1200 exact warm-up steps; full renderer/frame protocol deferred to B06–B08',
      },
      null,
      2,
    ) + '\n',
  );
});
