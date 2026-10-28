import { test, expect } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { measureBrowserHeap } from './heap-measurement';

interface TraceEvent {
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  args?: { name?: string };
}
function analyze(events: TraceEvent[]) {
  const candidates = new Map<string, TraceEvent[]>();
  for (const event of events)
    if (event.name === 'FireAnimationFrame') {
      const key = `${event.pid}:${event.tid}`;
      const list = candidates.get(key) ?? [];
      list.push(event);
      candidates.set(key, list);
    }
  const main = [...candidates.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!main || main[1].length < 100)
    throw new Error('Trace lacks actual animation-frame boundaries');
  const boundaries = main[1]
    .map((e) => e.ts)
    .sort((a, b) => a - b)
    .filter((time, i, times) => !i || time - times[i - 1]! > 4000);
  const tasks = events
    .filter(
      (e) => `${e.pid}:${e.tid}` === main[0] && e.ph === 'X' && /RunTask$/.test(e.name) && e.dur,
    )
    .map((e) => [e.ts, e.ts + e.dur!] as const)
    .sort((a, b) => a[0] - b[0]);
  if (!tasks.length) throw new Error('Trace lacks top-level main-thread task slices');
  const union: [number, number][] = [];
  for (const task of tasks) {
    const previous = union.at(-1);
    if (previous && task[0] <= previous[1]) previous[1] = Math.max(previous[1], task[1]);
    else union.push([task[0], task[1]]);
  }
  const work: number[] = [];
  let cursor = 0;
  for (let i = 1; i < boundaries.length; i++) {
    const start = boundaries[i - 1]!,
      end = boundaries[i]!;
    let busy = 0;
    while (cursor < union.length && union[cursor]![1] <= start) cursor++;
    for (let j = cursor; j < union.length && union[j]![0] < end; j++)
      busy += Math.max(0, Math.min(end, union[j]![1]) - Math.max(start, union[j]![0]));
    work.push(busy / 1000);
  }
  work.sort((a, b) => a - b);
  const p = (fraction: number) => work[Math.ceil(work.length * fraction) - 1] ?? null;
  const intervals = boundaries
    .slice(1)
    .map((time, i) => (time - boundaries[i]!) / 1000)
    .sort((a, b) => a - b);
  return {
    n: work.length,
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    max: work.at(-1),
    taskSlices: tasks.length,
    rendererThread: main[0],
    frameIntervalMs: {
      p50: intervals[Math.ceil(intervals.length * 0.5) - 1],
      p95: intervals[Math.ceil(intervals.length * 0.95) - 1],
      p99: intervals[Math.ceil(intervals.length * 0.99) - 1],
      max: intervals.at(-1),
    },
    method:
      'Union of all top-level renderer-main RunTask slices intersected with actual FireAnimationFrame boundaries. Includes React, message parsing, browser work and tracing overhead; conservative upper bound for application JS, not just Three.js callbacks.',
  };
}

test('complete main-thread task attribution at 300 agents, Standard 1x and 4x', async ({
  page,
  browserName,
  browser,
}, info) => {
  test.skip(
    process.env['CIVITAS_MAIN_TRACE'] !== '1' || browserName !== 'chromium',
    'Explicit Chromium CPU trace after uninstrumented frame measurement.',
  );
  test.setTimeout(420000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Laboratory', exact: true }).click();
  const lab = page.getByRole('complementary', { name: 'Simulation laboratory' });
  await lab.getByRole('button', { name: 'Experiment', exact: true }).click();
  await lab.getByLabel('Configured vehicle agents').selectOption('300');
  await lab.getByRole('button', { name: 'Start new experiment' }).click();
  await expect(page.getByRole('button', { name: 'Play simulation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close laboratory' }).click();
  await page.getByRole('button', { name: 'Play simulation' }).click();
  console.log('Full main-thread trace: 60 s warm-up started.');
  await page.waitForTimeout(60000);
  const gpu = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')!;
    return {
      samples: Number(gl.getParameter(gl.SAMPLES)),
      antialias: gl.getContextAttributes()?.antialias,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
    };
  });
  const reports = [];
  const assets = await Promise.all(
    (await readdir('apps/web/dist/assets')).map(async (name) => {
      const content = await readFile(`apps/web/dist/assets/${name}`);
      return {
        name,
        raw: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      };
    }),
  );
  await mkdir('docs/b06-b08/evidence', { recursive: true });
  for (const speed of [1, 4]) {
    await page.getByLabel('Simulation speed').selectOption(String(speed));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Tracing.start', {
      categories: 'toplevel,devtools.timeline,blink.user_timing',
      transferMode: 'ReturnAsStream',
    });
    console.log(`Full main-thread trace: ${speed}x 120 s sample started.`);
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(30000);
      console.log(`Full main-thread trace ${speed}x: ${(i + 1) * 30} / 120 s.`);
    }
    const complete = new Promise<string>((resolve) =>
      cdp.once('Tracing.tracingComplete', (event) => resolve(event.stream!)),
    );
    await cdp.send('Tracing.end');
    const stream = await complete;
    const chunks: Buffer[] = [];
    while (true) {
      const part = await cdp.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'));
      if (part.eof) break;
    }
    await cdp.send('IO.close', { handle: stream });
    await cdp.detach();
    const raw = Buffer.concat(chunks);
    await writeFile(`docs/b06-b08/evidence/main-thread-${speed}x.trace.json.gz`, gzipSync(raw));
    const parsed = JSON.parse(raw.toString('utf8')) as { traceEvents: TraceEvent[] };
    const result = {
      speed,
      sampleSeconds: 120,
      warmupSeconds: 60,
      viewport: { width: 1920, height: 1080 },
      fleet: 300,
      quality: 'standard',
      gpu,
      assets,
      workMsPerFrame: analyze(parsed.traceEvents),
      heap: await measureBrowserHeap(browser),
      render: await page.locator('canvas').evaluate((canvas) => ({
        calls: Number(canvas.getAttribute('data-render-calls')),
        triangles: Number(canvas.getAttribute('data-triangles')),
      })),
      rawTraceBytes: raw.length,
    };
    reports.push(result);
    await writeFile(
      'docs/b06-b08/evidence/main-thread-work.json',
      JSON.stringify(reports, null, 2) + '\n',
    );
  }
  await page.getByRole('button', { name: 'Pause simulation' }).click();
  await info.attach('full-main-thread-work', {
    body: JSON.stringify(reports, null, 2),
    contentType: 'application/json',
  });
});
