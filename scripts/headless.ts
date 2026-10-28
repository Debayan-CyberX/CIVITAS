import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import {
  RunSession,
  prepareAster,
  restoreCheckpoint,
  stateEvidence,
  canonical,
  compileCity,
  generateManifest,
} from '@civitas/simulation';
import { CityDefinitionSchema, ScenarioSchema, DemandManifestSchema } from '@civitas/contracts';
import type { SubmittedCommandInput } from '@civitas/contracts';
import { digest, identity } from './runtime';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : (args[i + 1] ?? fallback);
};
const mode = args[0] ?? 'run';
const ticks = Number(option('ticks', '9000'));
if (
  !['run', 'verify', 'perf'].includes(mode) ||
  !Number.isInteger(ticks) ||
  ticks < 0 ||
  ticks > 9000
)
  throw new Error('Invalid mode/end tick');
const fleets = option('fleets', option('fleet', '300')).split(',').map(Number);
const seeds = option('seeds', option('seed', '104729')).split(',').map(Number);
const out = option('out', 'artifacts/local/b02-b05');
await mkdir(out, { recursive: true });
const reports: unknown[] = [];
let powerScheme: string | null = null;
if (process.platform === 'win32') {
  try {
    powerScheme = execFileSync('powercfg', ['/getactivescheme'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } catch {
    powerScheme = null;
  }
}
for (const fleet of fleets)
  for (const seed of seeds)
    for (const closure of mode === 'verify'
      ? [false, true]
      : [option('closure', 'false') === 'true']) {
      if (fleet !== 100 && fleet !== 200 && fleet !== 300)
        throw new Error('fleet must be 100/200/300');
      const inputs = await prepareAster(digest, fleet, seed);
      const cityFile = option('city', ''),
        scenarioFile = option('scenario', ''),
        manifestFile = option('manifest', '');
      if (cityFile)
        inputs.city = CityDefinitionSchema.parse(JSON.parse(await readFile(cityFile, 'utf8')));
      if (scenarioFile)
        inputs.scenario = ScenarioSchema.parse(JSON.parse(await readFile(scenarioFile, 'utf8')));
      if (cityFile || scenarioFile || manifestFile) {
        inputs.hashes.city = await digest(canonical(inputs.city));
        inputs.hashes.scenario = await digest(canonical(inputs.scenario));
        inputs.manifest = manifestFile
          ? DemandManifestSchema.parse(JSON.parse(await readFile(manifestFile, 'utf8')))
          : generateManifest(compileCity(inputs.city), inputs.scenario, inputs.hashes.scenario);
        inputs.hashes.manifest = await digest(canonical(inputs.manifest));
      }
      if (ticks > inputs.scenario.horizonTicks)
        throw new Error('End tick exceeds scenario horizon');
      const runtime = identity();
      const commands: SubmittedCommandInput[] = closure
        ? [
            {
              commandId: 'close-3000',
              desiredTick: 3000,
              intervention: {
                type: 'CLOSE_LANES',
                laneIds: ['L:J11>J21'],
                expectedTopologyVersion: 0,
              },
            },
            {
              commandId: 'reopen-6000',
              desiredTick: 6000,
              intervention: {
                type: 'OPEN_LANES',
                laneIds: ['L:J11>J21'],
                expectedTopologyVersion: 0,
              },
            },
          ]
        : [];
      const commandsFile = option('commands', '');
      if (commandsFile) {
        const raw: unknown = JSON.parse(await readFile(commandsFile, 'utf8'));
        if (!Array.isArray(raw)) throw new Error('commands file must contain array');
        commands.splice(0, commands.length, ...(raw as SubmittedCommandInput[]));
      }
      const run = await RunSession.create(
        inputs,
        digest,
        runtime,
        `aster-${fleet}-${seed}-${closure ? 'closure' : 'baseline'}`,
        commands,
      );
      const timings: number[] = [];
      const started = performance.now();
      let peakHeap = 0;
      let before = 0;
      while (run.engine.tick < ticks) {
        await run.advance({
          before: () => {
            before = performance.now();
          },
          after: () => {
            timings.push(performance.now() - before);
          },
        });
        if ([2990, 3010, 6010].includes(run.engine.tick)) await run.checkpoint();
        if (run.engine.tick % 100 === 0)
          peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
      }
      const elapsedMs = performance.now() - started;
      globalThis.gc?.();
      const retainedHeapBytes = process.memoryUsage().heapUsed;
      const json = await run.exportJson();
      const bytes = Buffer.byteLength(json);
      const artifact = await run.artifact();
      const stats = run.engine.stats();
      if (
        stats.safetyCorrections ||
        stats.emergencyViolations ||
        artifact.outcome.diagnostics.length
      )
        throw new Error(`Safety gate failed ${JSON.stringify(stats)}`);
      if (fleet === 300 && !closure && ticks >= 1200 && stats.peakInNetwork < 100)
        throw new Error('In-network population gate failed');
      if (mode === 'verify') {
        const replay = await RunSession.importJson(json, digest, runtime);
        if ((await replay.exportJson()) !== json) throw new Error('Replay/export mismatch');
        const repeat = await RunSession.create(inputs, digest, runtime, artifact.runId, commands);
        while (repeat.engine.tick < ticks) {
          await repeat.advance();
          if ([2990, 3010, 6010].includes(repeat.engine.tick)) await repeat.checkpoint();
        }
        const repeatedArtifact = await repeat.artifact();
        if (
          canonical(repeat.checkpointRecords()) !== canonical(artifact.checkpoints) ||
          canonical(repeat.engine.events()) !== canonical(artifact.events) ||
          canonical(repeatedArtifact.metrics) !== canonical(artifact.metrics)
        )
          throw new Error('Repeatability mismatch');
        for (const target of [100, 2990, 3010, 6010]) {
          const cp = artifact.checkpoints.find((c) => c.state.tick === target);
          if (!cp) continue;
          const restored = await restoreCheckpoint(
            cp,
            inputs,
            artifact.metricLedger,
            artifact.events,
            digest,
            runtime,
          );
          while (restored.tick < ticks) restored.step();
          if ((await stateEvidence(restored, digest)).stateHash !== artifact.outcome.finalHash)
            throw new Error(`Restore mismatch ${target}`);
        }
      }
      timings.sort((a, b) => a - b);
      const percentile = (p: number) => timings[Math.ceil(timings.length * p) - 1] ?? 0;
      const report = {
        runId: artifact.runId,
        compatibility: runtime,
        inputs: inputs.hashes,
        stats,
        elapsedMs,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        artifactBytes: bytes,
        checkpointBytes: Buffer.byteLength(canonical(artifact.checkpoints)),
        eventBytes: Buffer.byteLength(canonical(artifact.events)),
        metricBytes: Buffer.byteLength(canonical(artifact.metrics)),
        metricLedgerBytes: Buffer.byteLength(canonical(artifact.metricLedger)),
        peakObservedHeapBytes: peakHeap,
        retainedHeapBytes,
        explicitGc: typeof globalThis.gc === 'function',
        finalHash: artifact.outcome.finalHash,
        eventDigest: artifact.outcome.eventDigest,
        events: artifact.events.length,
        checkpoints: artifact.checkpoints.length,
        metrics: artifact.metrics.length,
        verified: mode === 'verify',
        hardware: {
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          totalMemoryBytes: totalmem(),
          os: `${platform()} ${release()}`,
          powerScheme,
        },
      };
      await writeFile(`${out}/${artifact.runId}.json`, json);
      await writeFile(
        `${out}/${artifact.runId}.report.json`,
        JSON.stringify(report, null, 2) + '\n',
      );
      reports.push(report);
      console.log(JSON.stringify(report));
    }
await writeFile(`${out}/${mode}-summary.json`, JSON.stringify(reports, null, 2) + '\n');
