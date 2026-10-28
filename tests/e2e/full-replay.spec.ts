import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { prepareAster, canonical } from '@civitas/simulation';
import { digest } from '../../scripts/runtime';
import type * as Bridge from '../../apps/web/src/bridge/simulation-client';
import type { EngineArtifact } from '@civitas/contracts';

test('9000-tick worker closure experiment repeats and replays exactly', async ({
  page,
  browserName,
}, testInfo) => {
  test.setTimeout(600000);
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
      const client = module.createSimulationClient('full-browser');
      let maxBytes = 0;
      const encoder = new TextEncoder();
      client.subscribe((m) => {
        if (m.type === 'SNAPSHOT')
          maxBytes = Math.max(maxBytes, encoder.encode(JSON.stringify(m.snapshot)).byteLength);
      });
      await client.request({
        type: 'INIT',
        city: inputs.city,
        scenario: inputs.scenario,
        manifest: inputs.manifest,
        expectedHashes: inputs.hashes,
        compatibility: client.identity,
      });
      const run = async () => {
        await client.request({
          type: 'SUBMIT',
          command: {
            commandId: 'close-3000',
            desiredTick: 3000,
            intervention: {
              type: 'CLOSE_LANES',
              laneIds: ['L:J11>J21'],
              expectedTopologyVersion: 0,
            },
          },
        });
        await client.request({
          type: 'SUBMIT',
          command: {
            commandId: 'reopen-6000',
            desiredTick: 6000,
            intervention: {
              type: 'OPEN_LANES',
              laneIds: ['L:J11>J21'],
              expectedTopologyVersion: 0,
            },
          },
        });
        for (let i = 0; i < 9000; i += 20)
          await Promise.all(Array.from({ length: 20 }, () => client.request({ type: 'STEP' })));
        const result = await client.request({ type: 'EXPORT' });
        if (result.type !== 'ARTIFACT') throw new Error('Missing artifact');
        return result.json;
      };
      const first = await run();
      await client.request({ type: 'IMPORT', json: first, compatibility: client.identity });
      const replay = await client.request({ type: 'EXPORT' });
      if (replay.type !== 'ARTIFACT' || replay.json !== first) throw new Error('Replay mismatch');
      await client.request({ type: 'RESET' });
      const repeat = await run();
      if (first !== repeat) throw new Error('Independent repeat mismatch');
      // Retain the completed worker for CDP heap measurement; no direct simulation mutation is exposed.
      return {
        json: first,
        maxBytes,
        buffer: client.bufferedSnapshots().length,
        runtime: client.identity,
      };
    },
    { url: `/${entry.file}`, inputs },
  );
  expect(result.maxBytes).toBeLessThanOrEqual(32768);
  expect(result.buffer).toBeLessThanOrEqual(3);
  const artifact = JSON.parse(result.json) as EngineArtifact;
  expect(artifact.outcome.finalTick).toBe(9000);
  expect(artifact.outcome.diagnostics).toEqual([]);
  expect(artifact.checkpoints).toHaveLength(91);
  let heaps: unknown = null;
  if (browserName === 'chromium') {
    const browser = page.context().browser();
    if (!browser) throw new Error('Missing browser');
    const cdp = await browser.newBrowserCDPSession();
    const targets = await cdp.send('Target.getTargets');
    const usages: { type: string; url: string; usedSize: number; totalSize: number }[] = [];
    for (const target of targets.targetInfos.filter(
      (t) => t.type === 'page' || t.type === 'worker',
    )) {
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId: target.targetId,
        flatten: false,
      });
      let serial = 0;
      const command = async (method: string) =>
        new Promise<Record<string, number>>((resolve, reject) => {
          const id = ++serial;
          const timeout = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 10000);
          const listener = (event: { sessionId: string; message: string }) => {
            if (event.sessionId !== sessionId) return;
            const message = JSON.parse(event.message) as {
              id: number;
              result?: Record<string, number>;
              error?: unknown;
            };
            if (message.id !== id) return;
            clearTimeout(timeout);
            cdp.off('Target.receivedMessageFromTarget', listener);
            if (message.error) reject(new Error(JSON.stringify(message.error)));
            else resolve(message.result ?? {});
          };
          cdp.on('Target.receivedMessageFromTarget', listener);
          void cdp
            .send('Target.sendMessageToTarget', {
              sessionId,
              message: JSON.stringify({ id, method }),
            })
            .catch(reject);
        });
      await command('HeapProfiler.collectGarbage');
      const usage = await command('Runtime.getHeapUsage');
      usages.push({
        type: target.type,
        url: target.url,
        usedSize: usage['usedSize'] ?? 0,
        totalSize: usage['totalSize'] ?? 0,
      });
      await cdp.send('Target.detachFromTarget', { sessionId });
    }
    expect(usages.some((u) => u.type === 'worker' && u.url.includes('simulation.worker'))).toBe(
      true,
    );
    const totalUsed = usages.reduce((sum, u) => sum + u.usedSize, 0);
    expect(totalUsed).toBeLessThanOrEqual(256 * 1024 * 1024);
    heaps = {
      method: 'CDP Runtime.getHeapUsage after HeapProfiler.collectGarbage, page and worker targets',
      totalUsedBytes: totalUsed,
      targets: usages,
    };
    await cdp.detach();
  }
  const summary = {
    browser: browserName,
    browserVersion: page.context().browser()?.version() ?? 'unavailable',
    runtime: artifact.compatibility,
    finalHash: artifact.outcome.finalHash,
    eventDigest: artifact.outcome.eventDigest,
    checkpointHashes: artifact.checkpoints.map((cp) => ({
      tick: cp.state.tick,
      hash: cp.stateHash,
    })),
    artifactBytes: Buffer.byteLength(result.json),
    maxSnapshotBytes: result.maxBytes,
    maxBufferedSnapshots: result.buffer,
    metricsHash: await digest(canonical(artifact.metrics)),
    heaps,
  };
  await mkdir('artifacts/local/b02-b05/browser', { recursive: true });
  await writeFile(
    `artifacts/local/b02-b05/browser/${browserName}.json`,
    JSON.stringify(summary, null, 2) + '\n',
  );
  await testInfo.attach('full-worker-evidence', {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
});
