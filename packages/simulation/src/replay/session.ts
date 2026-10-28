import {
  EngineArtifactSchema,
  EngineCheckpointSchema,
  EngineStateSchema,
  METRIC_DEFINITIONS,
  LIMITS,
} from '@civitas/contracts';
import type {
  EngineArtifact,
  EngineCheckpoint,
  EngineState,
  RuntimeIdentity,
  MetricRow,
  MetricSample,
  MetricFrame,
  SubmittedCommandInput,
} from '@civitas/contracts';
import { Simulation } from '../engine';
import { verifyInputs } from '../city/inputs';
import type { SimulationInputs } from '../city/inputs';
import { ENGINE_VERSION } from '../city/aster';
import { canonical } from './canonical';
import type { Digest } from './canonical';
import { clone, required } from '../util';
import { packMetrics, unpackMetrics } from '../metrics/encoding';

export function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const c of text) {
    const code = c.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function compatible(recorded: RuntimeIdentity, current: RuntimeIdentity) {
  if (!same(recorded, current)) throw new Error('Incompatible exact replay runtime/build');
}
export async function stateEvidence(engine: Simulation, digest: Digest) {
  const state = engine.state();
  const eventPrefixDigest = await digest(canonical(engine.events()));
  const stateHash = await digest(
    canonical({ inputHashes: engine.inputs.hashes, state, eventPrefixDigest }),
  );
  return { state, eventPrefixDigest, stateHash };
}
export async function restoreCheckpoint(
  checkpoint: EngineCheckpoint,
  inputs: SimulationInputs,
  ledger: MetricFrame[],
  events: EngineArtifact['events'],
  digest: Digest,
  identity: RuntimeIdentity,
): Promise<Simulation> {
  const cp = EngineCheckpointSchema.parse(checkpoint);
  compatible(cp.compatibility, identity);
  if (!same(cp.inputHashes, inputs.hashes) || cp.state.metricFrames.length !== 0)
    throw new Error('Invalid checkpoint input/history reference');
  const tick = cp.state.tick;
  const start = tick === 0 ? 0 : Math.max(1, tick - 699);
  if (cp.metricRange[0] !== start || cp.metricRange[1] !== tick)
    throw new Error('Invalid checkpoint metric range');
  const frames = ledger.filter((f) => f[0] >= start && f[0] <= tick);
  if (frames.length !== Math.min(700, tick) || frames.some((f, i) => f[0] !== start + i))
    throw new Error('Incomplete metric history');
  const prefix = events.slice(0, cp.state.eventSequence);
  if (
    prefix.length !== cp.state.eventSequence ||
    prefix.some((e, i) => e.seq !== i || e.tick > tick)
  )
    throw new Error('Incomplete event prefix');
  if (
    (await digest(canonical(frames))) !== cp.metricHistoryHash ||
    (await digest(canonical(prefix))) !== cp.eventPrefixDigest
  )
    throw new Error('Checkpoint evidence digest mismatch');
  const state: EngineState = EngineStateSchema.parse({ ...cp.state, metricFrames: frames });
  if (
    (await digest(
      canonical({ inputHashes: inputs.hashes, state, eventPrefixDigest: cp.eventPrefixDigest }),
    )) !== cp.stateHash
  )
    throw new Error('Checkpoint state hash mismatch');
  return new Simulation(inputs, {
    state,
    events: prefix,
    ledger: ledger.filter((f) => f[0] <= tick),
  });
}
export class RunSession {
  private checkpoints: EngineCheckpoint[] = [];
  private samples: MetricRow[] = [];
  private constructor(
    readonly engine: Simulation,
    readonly digest: Digest,
    readonly identity: RuntimeIdentity,
    readonly runId: string,
  ) {}
  static async create(
    inputs: SimulationInputs,
    digest: Digest,
    identity: RuntimeIdentity,
    runId = 'headless',
    commands: SubmittedCommandInput[] = [],
  ): Promise<RunSession> {
    if (
      identity.engineVersion !== ENGINE_VERSION ||
      inputs.scenario.engineVersion !== ENGINE_VERSION
    )
      throw new Error('Unsupported engine version');
    await verifyInputs(inputs, digest);
    const session = new RunSession(new Simulation(inputs), digest, identity, runId);
    for (const command of commands) session.engine.accept(command);
    await session.checkpoint();
    session.samples.push(...packMetrics(session.engine.metrics(runId)));
    return session;
  }
  async checkpoint(): Promise<EngineCheckpoint> {
    const { state, eventPrefixDigest, stateHash } = await stateEvidence(this.engine, this.digest);
    const frames = state.metricFrames;
    const cp: EngineCheckpoint = {
      schemaVersion: 'checkpoint/2',
      inputHashes: this.engine.inputs.hashes,
      compatibility: this.identity,
      state: { ...state, metricFrames: [] },
      metricRange: [
        this.engine.tick === 0 ? 0 : Math.max(1, this.engine.tick - 699),
        this.engine.tick,
      ],
      metricHistoryHash: await this.digest(canonical(frames)),
      eventPrefixDigest,
      stateHash,
    };
    const previous = this.checkpoints.at(-1);
    if (previous?.stateHash === stateHash) return clone(previous);
    this.checkpoints.push(cp);
    return clone(cp);
  }
  async advance(profile?: { before(): void; after(): void }): Promise<void> {
    profile?.before();
    this.engine.step();
    profile?.after();
    if (this.engine.tick % 10 === 0)
      this.samples.push(...packMetrics(this.engine.metrics(this.runId)));
    if (this.engine.tick % 100 === 0) await this.checkpoint();
  }
  async advanceTo(tick: number): Promise<void> {
    if (!Number.isInteger(tick) || tick < this.engine.tick || tick > this.engine.horizon)
      throw new Error('Invalid target tick');
    while (this.engine.tick < tick) await this.advance();
  }
  checkpointRecords() {
    return clone(this.checkpoints);
  }
  async artifact(): Promise<EngineArtifact> {
    const final = await this.checkpoint();
    return {
      schemaVersion: 'artifact/2',
      runId: this.runId,
      compatibility: this.identity,
      inputHashes: this.engine.inputs.hashes,
      city: clone(this.engine.inputs.city),
      scenario: clone(this.engine.inputs.scenario),
      manifest: clone(this.engine.inputs.manifest),
      commands: this.engine.state().commands,
      events: this.engine.events(),
      metricLedger: this.engine.metricLedger(),
      checkpoints: clone(this.checkpoints),
      metricDefinitions: clone([...METRIC_DEFINITIONS]),
      metrics: clone(this.samples),
      outcome: {
        finalTick: this.engine.tick,
        finalHash: final.stateHash,
        eventDigest: final.eventPrefixDigest,
        status: this.engine.tick === this.engine.horizon ? 'COMPLETED' : 'PAUSED',
        diagnostics: this.engine
          .events()
          .filter((e) => e.type === 'SAFETY_DIAGNOSTIC')
          .map((e) => `${e.tick}:${e.entityId}:${e.reason}`),
        evidenceComplete: true,
      },
    };
  }
  async exportJson(): Promise<string> {
    const text = canonical(await this.artifact());
    if (utf8Bytes(text) > LIMITS.artifactBytes) throw new Error('Artifact exceeds 32 MiB');
    return text;
  }
  static async importJson(
    text: string,
    digest: Digest,
    identity: RuntimeIdentity,
  ): Promise<RunSession> {
    if (utf8Bytes(text) > LIMITS.artifactBytes) throw new Error('Artifact exceeds 32 MiB');
    const raw: unknown = JSON.parse(text);
    const artifact = EngineArtifactSchema.parse(raw);
    compatible(artifact.compatibility, identity);
    if (
      artifact.scenario.engineVersion !== ENGINE_VERSION ||
      !same(artifact.metricDefinitions, METRIC_DEFINITIONS)
    )
      throw new Error('Unsupported engine/metric definition');
    const inputs: SimulationInputs = {
      city: artifact.city,
      scenario: artifact.scenario,
      manifest: artifact.manifest,
      hashes: artifact.inputHashes,
    };
    await verifyInputs(inputs, digest);
    if (
      artifact.metricLedger.length !== artifact.outcome.finalTick ||
      artifact.metricLedger.some((f, i) => f[0] !== i + 1)
    )
      throw new Error('Invalid metric ledger timeline');
    if (
      artifact.events.some(
        (event, i) =>
          event.seq !== i || (i > 0 && event.tick < (artifact.events[i - 1]?.tick ?? 0)),
      )
    )
      throw new Error('Invalid event timeline');
    for (let tick = 0; tick <= artifact.outcome.finalTick; tick += 100)
      if (!artifact.checkpoints.some((cp) => cp.state.tick === tick))
        throw new Error('Missing periodic checkpoint');
    const expectedStatus =
      artifact.outcome.finalTick === inputs.scenario.horizonTicks ? 'COMPLETED' : 'PAUSED';
    if (
      artifact.outcome.status !== expectedStatus ||
      !artifact.outcome.evidenceComplete ||
      !same(
        artifact.outcome.diagnostics,
        artifact.events
          .filter((e) => e.type === 'SAFETY_DIAGNOSTIC')
          .map((e) => `${e.tick}:${e.entityId}:${e.reason}`),
      )
    )
      throw new Error('Invalid outcome evidence');
    const byAcceptance = [...artifact.commands].sort((a, b) => a.seq - b.seq);
    if (
      byAcceptance.some(
        (c, i) =>
          c.seq !== i || (i > 0 && c.acceptedAtTick < (byAcceptance[i - 1]?.acceptedAtTick ?? 0)),
      )
    )
      throw new Error('Invalid accepted-command sequence');
    let previousTick = -1,
      previousCount = -1;
    for (const checkpoint of artifact.checkpoints) {
      if (checkpoint.state.tick < previousTick || checkpoint.state.nextCommandSeq < previousCount)
        throw new Error('Out-of-order checkpoint');
      previousTick = checkpoint.state.tick;
      previousCount = checkpoint.state.nextCommandSeq;
      const expected = artifact.commands.filter((c) => c.seq < checkpoint.state.nextCommandSeq);
      if (!same(expected, checkpoint.state.commands))
        throw new Error('Checkpoint command prefix mismatch');
      await restoreCheckpoint(
        checkpoint,
        inputs,
        artifact.metricLedger,
        artifact.events,
        digest,
        identity,
      );
    }
    // Hash validation proves integrity; replay additionally proves that observations came from this engine.
    const engine = new Simulation(inputs);
    let accepted = 0;
    let checkpointIndex = 0;
    const samples: MetricSample[] = [];
    const acceptUntil = (count: number) => {
      while (accepted < count) {
        const c = required(byAcceptance[accepted], 'replay command');
        if (c.acceptedAtTick !== engine.tick)
          throw new Error('Command acceptance boundary mismatch');
        const replayed = engine.accept({
          commandId: c.commandId,
          desiredTick: c.acceptedTick,
          intervention: c.intervention,
        });
        if (!same(replayed, c)) throw new Error('Accepted command replay mismatch');
        accepted++;
      }
    };
    for (let tick = 0; tick <= artifact.outcome.finalTick; tick++) {
      while (artifact.checkpoints[checkpointIndex]?.state.tick === tick) {
        const checkpoint = required(artifact.checkpoints[checkpointIndex], 'checkpoint');
        acceptUntil(checkpoint.state.nextCommandSeq);
        const evidence = await stateEvidence(engine, digest);
        if (evidence.stateHash !== checkpoint.stateHash)
          throw new Error(`Replay checkpoint mismatch at ${tick}`);
        checkpointIndex++;
      }
      let count = accepted;
      while (byAcceptance[count]?.acceptedAtTick === tick) count++;
      acceptUntil(count);
      if (tick % 10 === 0) samples.push(...engine.metrics(artifact.runId));
      if (tick < artifact.outcome.finalTick) engine.step();
    }
    if (
      checkpointIndex !== artifact.checkpoints.length ||
      accepted !== artifact.commands.length ||
      !same(engine.events(), artifact.events) ||
      !same(engine.metricLedger(), artifact.metricLedger) ||
      !same(samples, unpackMetrics(artifact.metrics, artifact.runId))
    )
      throw new Error('Replay event/metric/command evidence mismatch');
    const final = await stateEvidence(engine, digest);
    if (
      final.stateHash !== artifact.outcome.finalHash ||
      final.eventPrefixDigest !== artifact.outcome.eventDigest
    )
      throw new Error('Replay final hash mismatch');
    const last = artifact.checkpoints.at(-1);
    if (
      !last ||
      last.state.tick !== artifact.outcome.finalTick ||
      last.stateHash !== artifact.outcome.finalHash
    )
      throw new Error('Missing final checkpoint');
    const result = new RunSession(engine, digest, identity, artifact.runId);
    result.checkpoints = clone(artifact.checkpoints);
    result.samples = packMetrics(samples);
    return result;
  }
}
