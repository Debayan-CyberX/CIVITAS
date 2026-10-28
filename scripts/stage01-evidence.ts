import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sourceId } from './source-id';

const directory = 'docs/b06-b08/evidence';
await mkdir(directory, { recursive: true });
const read = async (name: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await readFile(`${directory}/${name}`, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const unresolved: string[] = [];
const validation = await read('validation.json');
const finalValidation = await read('final-validation.json');
if (!validation) unresolved.push('BUILD-01: validation report missing');
else {
  const checks = validation['results'] as { command: string; exitCode: number | null }[];
  if (checks.length < 6 || checks.slice(0, 5).some((c) => c.exitCode !== 0))
    unresolved.push('BUILD-01: one or more validation commands failed or were not run');
}
const browsers = await read('browser-results.json');
const finalBrowsers = await read('final-ui-browser-results.json');
const reentryBrowsers = await read('reentry-browser-results.json');
interface Suite {
  suites?: Suite[];
  specs?: { title: string; file: string; tests: { projectName: string; status: string }[] }[];
}
const combined = new Map<string, string>();
function gather(suites: Suite[]) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests)
        combined.set(`${t.projectName}:${spec.file}:${spec.title}`, t.status);
    gather(suite.suites ?? []);
  }
}
if (browsers) gather(browsers['suites'] as Suite[]);
if (finalBrowsers) gather(finalBrowsers['suites'] as Suite[]);
if (reentryBrowsers) gather(reentryBrowsers['suites'] as Suite[]);
const browserStats = {
  expected: [...combined.values()].filter((s) => s === 'expected').length,
  skipped: [...combined.values()].filter((s) => s === 'skipped').length,
  unexpected: [...combined.values()].filter((s) => s !== 'expected' && s !== 'skipped').length,
};
if (!browsers) unresolved.push('Browser evidence missing');
else {
  if (browserStats.unexpected)
    unresolved.push(
      'Browser suite has unresolved failures/flaky cases after the explicitly recorded follow-up run',
    );
}
if (
  !finalValidation ||
  (finalValidation['results'] as unknown[]).length !== 5 ||
  (finalValidation['results'] as { exitCode: number | null }[]).some((r) => r.exitCode !== 0)
)
  unresolved.push('BUILD-01: final source checks missing or failed');
const headless = await read('headless-performance.json');
if (!headless) unresolved.push('PERF-01/08: current headless measurement missing');
else if (
  Number(headless['p95Ms']) > 2 ||
  Number(headless['p99Ms']) > 5 ||
  Number(headless['elapsedMs']) > 30000 ||
  Number(headless['artifactBytes']) > 32 * 1024 * 1024
)
  unresolved.push('PERF-01/08: measured headless budget exceeded');
const performance = [];
const preliminaryAssetHistory: string[] = [];
const trace = await readFile(`${directory}/main-thread-work.json`, 'utf8')
  .then(
    (json) =>
      JSON.parse(json) as {
        speed: number;
        gpu: { samples: number };
        workMsPerFrame: { p95: number | null; n: number };
        assets?: { name: string; raw: number; sha256: string }[];
        heap?: { usedSize: number }[];
      }[],
  )
  .catch(() => []);
for (const quality of ['standard', 'reduced'])
  for (const speed of [1, 4]) {
    const name = `render-${quality}-${speed}x.json`,
      report = await read(name);
    if (!report) {
      unresolved.push(`Performance evidence missing: ${name}`);
      continue;
    }
    performance.push(report);
    const p95 = (key: string) => (report[key] as { p95: number | null }).p95;
    if (p95('renderLoopWorkMs') === null || p95('renderLoopWorkMs')! > 6)
      unresolved.push(`PERF-03: ${name} renderer JS p95 exceeds 6 ms or is unavailable`);
    if (p95('selectionFeedbackMs') === null || p95('selectionFeedbackMs')! > 100)
      unresolved.push(`PERF-03: ${name} selection feedback p95 exceeds 100 ms or is unavailable`);
    if (p95('commandAckMs') === null || p95('commandAckMs')! > 250)
      unresolved.push(
        `PERF-03: ${name} command acknowledgement p95 exceeds 250 ms or is unavailable`,
      );
    if (
      (report['ordinaryInteractionLongTasks'] as { duration: number }[]).some(
        (t) => t.duration > 50,
      )
    )
      unresolved.push(
        `PERF-03: ${name} ordinary interaction includes main-thread long tasks above 50 ms`,
      );
    if (
      (report['heap'] as { totalBytes: number }).totalBytes > 256 * 1024 * 1024 ||
      Number(report['maxSnapshotBytes']) > 32768
    )
      unresolved.push(`PERF-05: ${name} memory or snapshot budget exceeded`);
    for (const asset of report['assets'] as { name: string; raw: number }[]) {
      try {
        if ((await readFile(`apps/web/dist/assets/${asset.name}`)).byteLength !== asset.raw)
          preliminaryAssetHistory.push(`Earlier uninstrumented render sample: ${asset.name}`);
      } catch {
        preliminaryAssetHistory.push(`Earlier uninstrumented render sample: ${asset.name}`);
      }
    }
  }
// These cannot be replaced by emulation, a newer CPU, or an automated axe score.
const limitations = [
  'Measurements certify only the available i5-1335U / Iris Xe host. The specified i5-1135G7 reference machine, actual mid-range mobile device and manual NVDA review are unavailable; emulation and automated axe do not replace those reviews.',
];
for (const speed of [1, 4]) {
  const sample = trace.find((s) => s.speed === speed);
  if (!sample?.assets?.length || !sample.heap?.length)
    unresolved.push(`Final build/memory attribution missing at ${speed}x`);
  if (
    (sample?.heap?.reduce((sum, isolate) => sum + isolate.usedSize, 0) ?? Infinity) >
    256 * 1024 * 1024
  )
    unresolved.push(`PERF-05: final build heap exceeds 256 MiB or is unavailable at ${speed}x`);
  for (const asset of sample?.assets ?? []) {
    try {
      const content = await readFile(`apps/web/dist/assets/${asset.name}`);
      if (
        content.byteLength !== asset.raw ||
        createHash('sha256').update(content).digest('hex') !== asset.sha256
      )
        unresolved.push(`Final build trace is stale: ${asset.name}`);
    } catch {
      unresolved.push(`Final build trace asset missing: ${asset.name}`);
    }
  }
  if (!sample || sample.workMsPerFrame.p95 === null || sample.workMsPerFrame.n < 100)
    unresolved.push(`PERF-03: complete main-thread task attribution missing at ${speed}x`);
  else if (sample.workMsPerFrame.p95 > 6)
    unresolved.push(
      `PERF-03: complete main-thread task work p95 ${sample.workMsPerFrame.p95.toFixed(2)} ms exceeds 6 ms at ${speed}x`,
    );
}
const gpuEstimates = performance.map((report) => {
  const browser = report['browser'] as { backingWidth: number; backingHeight: number };
  const standard = report['quality'] === 'standard';
  const samples = standard ? (trace[0]?.gpu.samples ?? 4) : 0;
  const bytes =
    browser.backingWidth * browser.backingHeight * (8 * Math.max(1, samples) + 8) +
    (standard ? 2048 * 2048 * 8 : 0) +
    4 * 1024 * 1024;
  if (bytes > 128 * 1024 * 1024)
    unresolved.push(
      `PERF-05: conservative GPU resource estimate exceeds 128 MiB for ${String(report['quality'])} ${String(report['requestedSpeed'])}x`,
    );
  return {
    quality: report['quality'],
    speed: report['requestedSpeed'],
    bytes,
    samples,
    method:
      'Conservative color+depth multisample buffers, resolve/swap color buffers, shadow color+depth and 4 MiB geometry allowance; uses observed Standard default-framebuffer MSAA samples from CPU trace setup. Estimate only; supersedes the simpler raw collector approximation.',
  };
});
const lock = createHash('sha256')
  .update(await readFile('package-lock.json'))
  .digest('hex');
const report = {
  stage: '01',
  status: unresolved.length ? 'VERIFIED_PROGRESS_WITH_UNRESOLVED_GATES' : 'COMPLETE',
  engineSourceId: sourceId(),
  lockfileSha256: lock,
  validation,
  finalValidation,
  browserStats,
  measuredPerformanceReports: performance.length,
  preliminaryAssetHistory: [...new Set(preliminaryAssetHistory)],
  measurementProvenance:
    'Uninstrumented Standard/Reduced frame samples preceded the final same-interval trip re-admission interpolation correction. They remain preliminary Stage 01 renderer evidence, with their original asset identities retained. Final-build complete main-thread traces, frame intervals, heap, draw counts and SHA-256 asset identities are recorded separately after that correction. Worker transport, geometry, materials and simulation code were unchanged by the correction.',
  mainThreadTrace: trace,
  conservativeGpuEstimates: gpuEstimates,
  limitations,
  unresolved,
};
await writeFile(`${directory}/stage01-status.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (unresolved.length) process.exitCode = 1;
