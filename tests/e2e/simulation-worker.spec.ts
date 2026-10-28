import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareAster, Simulation, canonical } from '@civitas/simulation';
import { digest } from '../../scripts/runtime';
import type { EngineArtifact } from '@civitas/contracts';
import type * as Bridge from '../../apps/web/src/bridge/simulation-client';

test('production simulation worker controls, export/replay, epochs and explicit recovery', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const inputs = await prepareAster(digest, 100);
  const manifest: unknown = JSON.parse(await readFile('apps/web/dist/.vite/manifest.json', 'utf8'));
  const entries = manifest as Record<string, { file: string }>;
  const entry = entries['src/bridge/simulation-client.ts'];
  if (!entry) throw new Error('Missing production bridge entry');
  await page.goto('/');
  const result = await page.evaluate(
    async ({ url, inputs }) => {
      // The bridge is a production entry; only typed transport is exposed, never main-thread physics.
      const module = (await import(url)) as typeof Bridge;
      const NativeWorker = window.Worker;
      const workers: Worker[] = [];
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          workers.push(this);
        }
      };
      const client = module.createSimulationClient('browser-evidence');
      let regular = 0;
      let maxBytes = 0;
      const encoder = new TextEncoder();
      client.subscribe((m) => {
        if (m.type === 'SNAPSHOT') {
          regular++;
          maxBytes = Math.max(maxBytes, encoder.encode(JSON.stringify(m.snapshot)).byteLength);
        }
      });
      const ready = await client.request({
        type: 'INIT',
        city: inputs.city,
        scenario: inputs.scenario,
        manifest: inputs.manifest,
        expectedHashes: inputs.hashes,
        compatibility: client.identity,
      });
      for (let i = 0; i < 100; i++) await client.request({ type: 'STEP' });
      const accepted = await client.request({
        type: 'SUBMIT',
        command: {
          commandId: 'browser-close',
          intervention: { type: 'CLOSE_LANES', laneIds: ['L:J11>J21'], expectedTopologyVersion: 0 },
        },
      });
      for (let i = 0; i < 100; i++) await client.request({ type: 'STEP' });
      await client.request({ type: 'SET_SPEED', speed: 4 });
      await client.request({ type: 'PLAY' });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const stallStart = performance.now();
      while (performance.now() - stallStart < 350) {
        /* deliberate main-thread stall */
      }
      const hiddenPause = new Promise<void>((resolve) => {
        const unsubscribe = client.subscribe((m) => {
          if (m.type === 'CONTROL_ACK' && m.mode === 'PAUSED') {
            unsubscribe();
            resolve();
          }
        });
      });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await hiddenPause;
      Reflect.deleteProperty(document, 'visibilityState');
      const pause = await client.request({ type: 'PAUSE' });
      const beforeReorder = client.bufferedSnapshots().at(-1)?.tick;
      if (ready.type === 'READY')
        workers[0]?.dispatchEvent(
          new MessageEvent('message', {
            data: { ...ready, type: 'SNAPSHOT', requestId: 'stream' },
          }),
        );
      const reorderIgnored = client.bufferedSnapshots().at(-1)?.tick === beforeReorder;
      const exported = await client.request({ type: 'EXPORT' });
      if (exported.type !== 'ARTIFACT') throw new Error('Missing artifact');
      const restored = await client.request({
        type: 'IMPORT',
        json: exported.json,
        compatibility: client.identity,
      });
      const second = await client.request({ type: 'EXPORT' });
      if (second.type !== 'ARTIFACT') throw new Error('Missing repeated artifact');
      workers[0]?.dispatchEvent(new ErrorEvent('error', { message: 'injected worker failure' }));
      let failureRejected = false;
      try {
        await client.request({ type: 'STEP' });
      } catch {
        failureRejected = true;
      }
      const recovered = await client.recover(exported.json);
      workers[0]?.dispatchEvent(new ErrorEvent('error', { message: 'retired worker error' }));
      const third = await client.request({ type: 'EXPORT' });
      if (third.type !== 'ARTIFACT') throw new Error('Missing recovered artifact');
      let invalidRejected = false;
      try {
        await client.request({ type: 'IMPORT', json: '{}', compatibility: client.identity });
      } catch {
        invalidRejected = true;
      }
      const afterInvalid = await client.request({ type: 'STEP' });
      const buffer = client.bufferedSnapshots().length;
      const reset = await client.request({ type: 'RESET' });
      if (pause.type === 'CONTROL_ACK' && ready.type === 'READY')
        workers.at(-1)?.dispatchEvent(
          new MessageEvent('message', {
            data: {
              ...ready,
              type: 'SNAPSHOT',
              requestId: 'stream',
              snapshot: {
                ...ready.snapshot,
                tick: pause.authoritativeTick,
                simTimeMs: pause.authoritativeTick * 100,
              },
            },
          }),
        );
      const staleIgnored = client.bufferedSnapshots().at(-1)?.tick === 0;
      client.dispose();
      window.Worker = NativeWorker;
      let disposedRejected = false;
      try {
        await client.request({ type: 'PLAY' });
      } catch {
        disposedRejected = true;
      }
      return {
        ready,
        accepted,
        pause,
        restored,
        recovered,
        afterInvalid,
        reset,
        buffer,
        regular,
        maxBytes,
        invalidRejected,
        disposedRejected,
        reorderIgnored,
        staleIgnored,
        failureRejected,
        equal: exported.json === second.json && second.json === third.json,
        json: exported.json,
      };
    },
    { url: `/${entry.file}`, inputs },
  );
  expect(result.ready.type).toBe('READY');
  expect(result.accepted).toMatchObject({
    type: 'COMMAND_ACK',
    command: { acceptedAtTick: 100, acceptedTick: 101 },
  });
  expect(result.pause.type).toBe('CONTROL_ACK');
  expect(result.restored.type).toBe('RESTORED');
  expect(result.recovered.type).toBe('RESTORED');
  expect(result.reset).toMatchObject({ snapshot: { tick: 0 } });
  expect(result.buffer).toBeLessThanOrEqual(3);
  expect(result.maxBytes).toBeLessThanOrEqual(32768);
  expect(result.equal).toBe(true);
  expect(result.invalidRejected).toBe(true);
  expect(result.disposedRejected).toBe(true);
  expect(result.reorderIgnored && result.staleIgnored).toBe(true);
  expect(result.failureRejected).toBe(true);
  const artifact = JSON.parse(result.json) as EngineArtifact;
  const engine = new Simulation(inputs);
  while (engine.tick < artifact.outcome.finalTick) {
    for (const command of artifact.commands)
      if (command.acceptedAtTick === engine.tick)
        engine.accept({
          commandId: command.commandId,
          desiredTick: command.acceptedTick,
          intervention: command.intervention,
        });
    engine.step();
  }
  // Compare causal state across engines; this is observed evidence, not a cross-engine guarantee.
  const last = artifact.checkpoints.at(-1);
  expect(last).toBeDefined();
  const { metricFrames, ...state } = engine.state();
  const { metricFrames: storedFrames, ...storedState } = last!.state;
  expect(storedFrames).toEqual([]);
  expect(canonical(state)).toBe(canonical(storedState));
  expect(metricFrames.length).toBe(Math.min(700, engine.tick));
  await testInfo.attach('worker-evidence', {
    body: JSON.stringify(
      {
        ...result,
        json: undefined,
        finalHash: artifact.outcome.finalHash,
        runtime: artifact.compatibility,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
