import { expect, test } from '@playwright/test';
import { cpus, release, totalmem } from 'node:os';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import type { EngineArtifact } from '@civitas/contracts';
import { measureBrowserHeap } from './heap-measurement';

interface Measurements {
  active: boolean;
  intervals: number[];
  work: number[];
  longTasks: { start: number; duration: number }[];
  acknowledgements: { type: string; ms: number }[];
  maxSnapshotBytes: number;
  snapshots: number;
  maxInNetwork: number;
  selections: number[];
}
declare global {
  interface Window {
    civitasMeasurements: Measurements;
  }
}
const distribution = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return {
    n: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1) ?? null,
  };
};

for (const quality of ['standard', 'reduced'])
  for (const speed of [1, 4])
    test(`render measurement ${quality} ${speed}x`, async ({
      page,
      browserName,
      browser,
    }, info) => {
      test.skip(
        process.env['CIVITAS_RENDER_PERF'] !== '1' || browserName !== 'chromium',
        'Explicit hardware measurement run, Chromium CDP memory after frame sampling.',
      );
      test.setTimeout(300000);
      const viewport =
        quality === 'standard' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        window.civitasMeasurements = {
          active: false,
          intervals: [],
          work: [],
          longTasks: [],
          acknowledgements: [],
          maxSnapshotBytes: 0,
          snapshots: 0,
          maxInNetwork: 0,
          selections: [],
        };
        const m = window.civitasMeasurements;
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(url: string | URL, options?: WorkerOptions) {
            super(url, options);
            const pending = new Map<string, { type: string; now: number }>();
            const original = this.postMessage.bind(this);
            this.postMessage = (message: unknown) => {
              const c = message as { requestId: string; type: string };
              pending.set(c.requestId, { type: c.type, now: performance.now() });
              original(message);
            };
            this.addEventListener('message', (event: MessageEvent<unknown>) => {
              const message = event.data as {
                type: string;
                requestId: string;
                snapshot?: { agents: number[][] };
              };
              const p = pending.get(message.requestId);
              if (p) {
                if (m.active)
                  m.acknowledgements.push({ type: p.type, ms: performance.now() - p.now });
                pending.delete(message.requestId);
              }
              if (message.snapshot) {
                m.maxSnapshotBytes = Math.max(
                  m.maxSnapshotBytes,
                  new TextEncoder().encode(JSON.stringify(message.snapshot)).byteLength,
                );
                m.maxInNetwork = Math.max(
                  m.maxInNetwork,
                  message.snapshot.agents.filter((a) => (a[1] ?? 0) >= 2).length,
                );
                if (m.active) m.snapshots++;
              }
            });
          }
        };
        let last = 0;
        const frame = (now: number) => {
          if (last && m.active) m.intervals.push(now - last);
          last = now;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        if (PerformanceObserver.supportedEntryTypes.includes('longtask'))
          new PerformanceObserver((list) => {
            if (m.active)
              for (const entry of list.getEntries())
                m.longTasks.push({ start: entry.startTime, duration: entry.duration });
          }).observe({ type: 'longtask', buffered: false });
      });
      const startupSession = await page.context().newCDPSession(page);
      await startupSession.send('Network.enable');
      await startupSession.send('Network.clearBrowserCache');
      await startupSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 100,
        downloadThroughput: 1250000,
        uploadThroughput: 625000,
      });
      const startupStart = performance.now();
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
      const coldInteractiveMs = performance.now() - startupStart;
      await startupSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await startupSession.detach();
      await page.getByRole('button', { name: 'Laboratory', exact: true }).click();
      const lab = page.getByRole('complementary', { name: 'Simulation laboratory' });
      await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
      await lab.getByLabel('Configured vehicle agents').selectOption('300');
      await lab.getByRole('button', { name: 'Start new experiment' }).click();
      await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
      await lab.getByRole('button', { name: 'Display', exact: true }).click();
      await lab.getByLabel('City quality').selectOption(quality);
      await page.getByRole('button', { name: 'Close laboratory' }).click();
      await page.getByLabel('Simulation speed').selectOption(String(speed));
      await page.getByRole('button', { name: 'Play simulation' }).click();
      console.log(`Hardware sample ${quality} ${speed}x: 60 s warm-up started.`);
      // Full prescribed warm-up. Keep browser tooling closed during frame sampling.
      await page.waitForTimeout(60000);
      console.log(`Hardware sample ${quality} ${speed}x: 120 s frame measurement started.`);
      const identity = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext('webgl2')!;
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: extension
            ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
            : 'Unavailable',
          dpr: devicePixelRatio,
          backingWidth: canvas.width,
          backingHeight: canvas.height,
          ua: navigator.userAgent,
        };
      });
      await page.locator('canvas').evaluate((canvas) => {
        canvas.setAttribute('data-measure-frames', 'true');
        canvas.addEventListener('civitas:frame', (event) => {
          const m = window.civitasMeasurements;
          if (m.active) m.work.push((event as CustomEvent<number>).detail);
        });
        window.civitasMeasurements.active = true;
      });
      // Four 30 s waits keep orchestration responsive without touching the sampled page.
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(30000);
        console.log(`Hardware sample ${quality} ${speed}x: ${(i + 1) * 30} / 120 s sampled.`);
      }
      await page.evaluate(() => {
        window.civitasMeasurements.active = false;
      });
      const frameData = await page.evaluate(() => window.civitasMeasurements);
      const render = await page.locator('canvas').evaluate((canvas) => ({
        calls: Number(canvas.getAttribute('data-render-calls')),
        triangles: Number(canvas.getAttribute('data-triangles')),
        geometries: Number(canvas.getAttribute('data-geometries')),
        textures: Number(canvas.getAttribute('data-textures')),
      }));
      await page.getByRole('button', { name: 'Pause simulation' }).click();
      await page.getByLabel('Simulation speed').selectOption('1');
      await page.getByRole('button', { name: 'Laboratory', exact: true }).click();
      await lab.getByRole('button', { name: 'Explore', exact: true }).click();
      await lab.getByRole('searchbox').fill('R:J11:J21');
      const feedback: number[] = [];
      await page.evaluate(() => {
        window.civitasMeasurements.active = true;
      });
      for (let i = 0; i < 30; i++) {
        const elapsed = await page.evaluate(async () => {
          const start = performance.now();
          const button = [
            ...document.querySelectorAll<HTMLButtonElement>('.entity-list button'),
          ].find((b) => b.textContent?.includes('J11 ↔ J21'))!;
          button.click();
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return performance.now() - start;
        });
        feedback.push(elapsed);
        await page.getByRole('button', { name: 'Close inspector' }).click();
      }
      await lab.getByRole('button', { name: /Road J11 ↔ J21/ }).click();
      await page.getByRole('button', { name: 'Play simulation' }).click();
      for (let i = 0; i < 30; i++) {
        await page
          .getByRole('button', {
            name: i % 2 === 0 ? 'Close J11 → J21' : 'Reopen J11 → J21',
            exact: true,
          })
          .click();
        await expect(
          page.getByRole('button', {
            name: i % 2 === 0 ? 'Reopen J11 → J21' : 'Close J11 → J21',
            exact: true,
          }),
        ).toBeEnabled();
      }
      await page.getByRole('button', { name: 'Pause simulation' }).click();
      const interaction = await page.evaluate(() => {
        window.civitasMeasurements.active = false;
        return window.civitasMeasurements;
      });
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export run', exact: false }).first().click();
      const download = await downloadPromise;
      const artifact = JSON.parse(await readFile(await download.path(), 'utf8')) as EngineArtifact;
      const finalState = artifact.checkpoints.at(-1)!.state;
      // CDP starts only after frame/interaction sampling; include page AND worker isolates.
      const isolates = await measureBrowserHeap(browser);
      const directory = 'docs/b06-b08/evidence';
      await mkdir(directory, { recursive: true });
      const assets = [];
      for (const name of await readdir('apps/web/dist/assets')) {
        const buffer = await readFile(`apps/web/dist/assets/${name}`);
        assets.push({ name, raw: buffer.byteLength, gzip: gzipSync(buffer).byteLength });
      }
      const inputs = await readFile('apps/web/dist/inputs/300-104729.json');
      const report = {
        date: new Date().toISOString(),
        commitBeforeChanges: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        hardware: {
          cpu: cpus()[0]?.model,
          memory: totalmem(),
          os: release(),
          power: execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8' }).trim(),
        },
        browser: { name: browserName, version: browser.version(), ...identity },
        viewport,
        quality,
        fleet: 300,
        seed: 104729,
        requestedSpeed: speed,
        warmupSeconds: 60,
        sampleSeconds: 120,
        coldInteractiveMs,
        coldNetwork:
          'CDP cold cache, 10 Mbps download / 100 ms latency; production Vite preview serves uncompressed files',
        frameIntervalMs: distribution(frameData.intervals),
        fps: distribution(frameData.intervals.map((ms) => 1000 / ms)),
        missedFramesOver20Ms:
          frameData.intervals.filter((ms) => ms > 20).length / frameData.intervals.length,
        renderLoopWorkMs: distribution(frameData.work),
        frameLongTasks: frameData.longTasks,
        ordinaryInteractionLongTasks: interaction.longTasks.slice(frameData.longTasks.length),
        selectionFeedbackMs: distribution(feedback),
        commandAckMs: distribution(
          interaction.acknowledgements.filter((a) => a.type === 'SUBMIT').map((a) => a.ms),
        ),
        maxSnapshotBytes: interaction.maxSnapshotBytes,
        snapshotsDuringFrameSample: frameData.snapshots,
        peakInNetwork: interaction.maxInNetwork,
        causalObservation: {
          finalTick: finalState.tick,
          finalHash: artifact.outcome.finalHash,
          eventDigest: artifact.outcome.eventDigest,
          commands: artifact.commands.length,
          appliedClosures: artifact.events.filter((e) => e.type === 'CLOSURE_APPLIED').length,
          reopenings: artifact.events.filter((e) => e.type === 'LANE_REOPENED').length,
          reroutes: artifact.events.filter((e) => e.type === 'ROUTE_CHANGED').length,
          drainingExceptions: artifact.events.filter((e) => e.type === 'CLOSURE_DRAIN_EXCEPTION')
            .length,
          routeBlockedEvents: artifact.events.filter((e) => e.type === 'ROUTE_BLOCKED').length,
          safetyDiagnostics: artifact.outcome.diagnostics,
          inNetwork: finalState.agents.filter(
            (a) => a.location.kind === 'ON_LANE' || a.location.kind === 'ON_CONNECTOR',
          ).length,
          sourceQueued: finalState.agents.filter((a) => a.location.kind === 'SOURCE_QUEUED').length,
          completed: finalState.trips.filter((t) => t[0] === 4).length,
          unfinished: finalState.trips.filter((t) => t[0] > 0 && t[0] < 4).length,
        },
        render,
        heap: {
          isolates: isolates.map((i) => i.usedSize),
          totalBytes: isolates.reduce((sum, i) => sum + i.usedSize, 0),
          targets: isolates,
          note: 'Page and worker sampled after explicit GC. Not main-thread-only.',
        },
        gpuAllocationEstimateBytes:
          identity.backingWidth * identity.backingHeight * 12 +
          (quality === 'standard' ? 2048 * 2048 * 8 : 0) +
          4 * 1024 * 1024,
        gpuEstimateNote:
          'Framebuffer/color/depth approximation, shadow color+depth, 4 MiB conservative geometry allowance. Not a measured GPU allocation.',
        gpuTiming: 'Unavailable',
        assets,
        selectedInputsGzipBytes: gzipSync(inputs).byteLength,
      };
      await writeFile(
        `${directory}/render-${quality}-${speed}x.json`,
        JSON.stringify(report, null, 2) + '\n',
      );
      await page.screenshot({ path: `${directory}/render-${quality}-${speed}x.png` });
      await info.attach('render-performance', {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json',
      });
      expect(report.maxSnapshotBytes).toBeLessThanOrEqual(32768);
      // Record budget failures as evidence; aggregate release verifier decides completion.
    });
