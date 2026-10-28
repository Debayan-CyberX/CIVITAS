import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { EngineArtifactSchema, RuntimeIdentitySchema } from '@civitas/contracts';
import type { RuntimeIdentity } from '@civitas/contracts';
import { canonical } from '@civitas/simulation';
import { digest } from './runtime';
import { sourceId } from './source-id';

interface Report {
  runId: string;
  compatibility: RuntimeIdentity;
  verified: boolean;
  finalHash: string;
  eventDigest: string;
  artifactBytes: number;
  p95Ms: number;
  p99Ms: number;
  elapsedMs: number;
  retainedHeapBytes: number;
  stats: {
    tick: number;
    fleet: number;
    completed: number;
    inNetwork: number;
    sourceQueued: number;
    parked: number;
    backlog: number;
    peakInNetwork: number;
    peakTick: number;
    safetyCorrections: number;
    emergencyViolations: number;
  };
}
interface TestResult {
  success: boolean;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
}
interface BrowserResult {
  browser: string;
  runtime: RuntimeIdentity;
  finalHash: string;
  eventDigest: string;
  metricsHash: string;
  checkpointHashes: { tick: number; hash: string }[];
  artifactBytes: number;
  maxSnapshotBytes: number;
  maxBufferedSnapshots: number;
  heaps: { totalUsedBytes: number } | null;
}
const root = 'artifacts/local/b02-b05';
const output = 'docs/b02-b05';
const read = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, 'utf8')) as unknown;
const reports = (await read(`${root}/final/verify-summary.json`)) as Report[];
if (reports.length !== 18) throw new Error('Missing complete 18-case verification matrix');
const build = sourceId();
const rows: unknown[] = [];
const seen = new Set<string>();
let nodeCheckpointHashes: { tick: number; hash: string }[] = [];
let nodeMetricHash = '';
let nodeFinalHash = '';
let nodeEventDigest = '';
for (const report of reports) {
  if (seen.has(report.runId) || !report.verified || report.compatibility.engineBuildSha !== build)
    throw new Error('Duplicate, unverified, or stale build evidence');
  seen.add(report.runId);
  const text = await readFile(`${root}/final/${report.runId}.json`, 'utf8');
  const artifact = EngineArtifactSchema.parse(JSON.parse(text));
  const state = artifact.checkpoints.at(-1)?.state;
  if (!state) throw new Error('Missing final checkpoint');
  if (
    artifact.outcome.finalTick !== 9000 ||
    artifact.outcome.finalHash !== report.finalHash ||
    artifact.outcome.eventDigest !== report.eventDigest ||
    artifact.outcome.diagnostics.length ||
    report.stats.safetyCorrections ||
    report.stats.emergencyViolations ||
    Buffer.byteLength(text) !== report.artifactBytes ||
    report.artifactBytes > 32 * 1024 * 1024
  )
    throw new Error(`Invalid run evidence ${report.runId}`);
  if (
    report.stats.inNetwork + report.stats.sourceQueued + report.stats.parked !==
      report.stats.fleet ||
    state.totals[2] !== report.stats.completed
  )
    throw new Error('Conservation evidence mismatch');
  const closure = report.runId.endsWith('closure');
  const due = artifact.events.filter((e) => e.type === 'TRIP_DUE').length,
    admitted = artifact.events.filter((e) => e.type === 'TRIP_ADMITTED').length,
    arrived = artifact.events.filter((e) => e.type === 'TRIP_ARRIVED').length;
  if (
    due !== state.dueCursor ||
    arrived !== state.totals[2] ||
    due - admitted !== report.stats.backlog ||
    admitted - arrived !== report.stats.inNetwork ||
    artifact.metricLedger.reduce((n, f) => n + f[1], 0) !== state.totals[0] ||
    artifact.metricLedger.reduce((n, f) => n + f[2], 0) !== state.totals[1] ||
    artifact.metricLedger.some(
      (f) => f[6].reduce((a, b) => a + b, 0) !== f[1] || f[7].reduce((a, b) => a + b, 0) !== f[2],
    )
  )
    throw new Error('Independent event/ledger reconciliation failed');
  const lane = 'L:J11>J21';
  const forbidden = artifact.events.filter(
    (e) =>
      e.tick >= 3000 &&
      e.tick < 6000 &&
      ((e.type === 'RESERVATION_GRANTED' && e.relatedIds[1] === lane) ||
        (e.type === 'TRIP_ADMITTED' && e.relatedIds[1] === lane)),
  );
  if (
    closure &&
    (forbidden.length ||
      artifact.events.filter((e) => e.type === 'CLOSURE_APPLIED' && e.tick === 3000).length !== 1 ||
      artifact.events.filter((e) => e.type === 'LANE_REOPENED' && e.tick === 6000).length !== 1)
  )
    throw new Error('Closure commitment/effective-tick evidence failed');
  const before = EngineArtifactSchema.parse(await read(`${root}/${report.runId}.json`));
  const hashes = artifact.checkpoints.map((cp) => ({ tick: cp.state.tick, hash: cp.stateHash }));
  if (
    canonical(hashes) !==
      canonical(before.checkpoints.map((cp) => ({ tick: cp.state.tick, hash: cp.stateHash }))) ||
    canonical(artifact.events) !== canonical(before.events) ||
    canonical(artifact.metrics) !== canonical(before.metrics)
  )
    throw new Error('Optimization changed previously verified outcomes');
  if (report.runId === 'aster-300-104729-closure') {
    nodeCheckpointHashes = hashes.filter((cp) => cp.tick % 100 === 0);
    nodeMetricHash = await digest(canonical(artifact.metrics));
    nodeFinalHash = report.finalHash;
    nodeEventDigest = report.eventDigest;
  }
  const baseline = reports.find((r) => r.runId === report.runId.replace(/closure$/, 'baseline'));
  if (closure && baseline) {
    const base = EngineArtifactSchema.parse(await read(`${root}/final/${baseline.runId}.json`));
    if (canonical(base.manifest) !== canonical(artifact.manifest))
      throw new Error('Paired demand changed');
  }
  rows.push({
    ...report,
    checkpointContinuationTicks: [100, 2990, 3010, 6010],
    unchangedFromPreOptimization: true,
    closureEvidence: closure
      ? {
          newClosedLaneCommitments: forbidden.length,
          drainingExceptions: artifact.events.filter((e) => e.type === 'CLOSURE_DRAIN_EXCEPTION')
            .length,
          postReopenReservations: artifact.events.filter(
            (e) => e.type === 'RESERVATION_GRANTED' && e.tick >= 6000 && e.relatedIds[1] === lane,
          ).length,
        }
      : null,
  });
}
const browsers: unknown[] = [];
const transports: unknown[] = [];
for (const name of ['chromium', 'firefox', 'webkit']) {
  const transport = (await read(`${root}/browser/${name}-transport.json`)) as {
    runtime: RuntimeIdentity;
    commandAckP95Ms: number;
    inspectionP95Ms: number;
    inNetworkAtWarmup: number;
    fourTimes: { achievedSpeed: number };
  };
  if (
    transport.runtime.engineBuildSha !== build ||
    transport.commandAckP95Ms > 250 ||
    transport.inspectionP95Ms > 100 ||
    transport.inNetworkAtWarmup < 100 ||
    transport.fourTimes.achievedSpeed < 3.6
  )
    throw new Error('Missing/failed preliminary transport evidence');
  transports.push(transport);
  const result = (await read(`${root}/browser/${name}.json`)) as BrowserResult;
  RuntimeIdentitySchema.parse(result.runtime);
  if (
    result.runtime.engineBuildSha !== build ||
    result.checkpointHashes.length !== 91 ||
    result.maxSnapshotBytes > 32768 ||
    result.maxBufferedSnapshots > 3
  )
    throw new Error('Missing/stale browser evidence');
  browsers.push({
    ...result,
    nodeCheckpointMatch: canonical(result.checkpointHashes) === canonical(nodeCheckpointHashes),
    nodeCheckpointsAfterS0Match:
      canonical(result.checkpointHashes.filter((cp) => cp.tick > 0)) ===
      canonical(nodeCheckpointHashes.filter((cp) => cp.tick > 0)),
    initialCheckpointContext:
      'CLI checkpoint S0 follows preacceptance of the scripted commands; worker INIT checkpoint S0 precedes SUBMIT. Compare equal command prefixes from tick 100 onward.',
    nodeMetricsMatch: result.metricsHash === nodeMetricHash,
    nodeFinalMatch: result.finalHash === nodeFinalHash,
    nodeEventsMatch: result.eventDigest === nodeEventDigest,
    crossRuntimeImportAllowed: false,
  });
}
const unit = (await read(`${root}/unit-results.json`)) as TestResult;
const properties = (await read(`${root}/property-results.json`)) as TestResult;
if (!unit.success || unit.numFailedTests || !properties.success || properties.numFailedTests)
  throw new Error('Missing/pending unit or property pass');
const [performance] = (await read(`${root}/final-performance/perf-summary.json`)) as Report[];
if (!performance || performance.compatibility.engineBuildSha !== build)
  throw new Error('Missing final performance evidence');
const performancePass =
  performance.p95Ms <= 2 &&
  performance.p99Ms <= 5 &&
  performance.elapsedMs <= 30000 &&
  performance.artifactBytes <= 32 * 1024 * 1024;
await mkdir(output, { recursive: true });
await writeFile(`${output}/headless-results.json`, JSON.stringify(rows, null, 2) + '\n');
await writeFile(`${output}/browser-results.json`, JSON.stringify(browsers, null, 2) + '\n');
await writeFile(`${output}/transport-results.json`, JSON.stringify(transports, null, 2) + '\n');
await writeFile(
  `${output}/performance-results.json`,
  JSON.stringify(
    {
      ...performance,
      observedBudgetPass: performancePass,
      referenceRenderingGate:
        'Deferred to B06–B08; actual hardware is recorded, no GPU/frame claim',
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  `${output}/test-results.json`,
  JSON.stringify(
    {
      engineBuildSha: build,
      unit: {
        passed: unit.numPassedTests,
        failed: unit.numFailedTests,
        pending: unit.numPendingTests,
      },
      properties: {
        passed: properties.numPassedTests,
        failed: properties.numFailedTests,
        pending: properties.numPendingTests,
        generatedCommandCases: 100,
        generatedGraphCases: 100,
        ticksPerCase: 1000,
        seeds: [155921, 130363],
      },
      fullBrowserReplayCases: 3,
      headlessCases: 18,
      performancePass,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    engineBuildSha: build,
    headlessCases: 18,
    fullBrowserReplayCases: 3,
    unit: unit.numPassedTests,
    properties: properties.numPassedTests,
    performancePass,
  }),
);
if (!performancePass) process.exitCode = 1;
