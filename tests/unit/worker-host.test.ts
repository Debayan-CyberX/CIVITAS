import { describe, it, expect } from 'vitest';
import { WorkerHost } from '../../packages/simulation-worker/src/host';
import type { EngineCommand, EngineObservation } from '@civitas/contracts';
import {
  canonical,
  compileCity,
  generateManifest,
  prepareAster,
  RunSession,
} from '@civitas/simulation';
import { ScenarioSchema } from '@civitas/contracts';
import { digest, identity } from '../../scripts/runtime';

async function fixture(horizon = 9000) {
  let wall = 0;
  let callback: (() => void) | undefined;
  const output: EngineObservation[] = [];
  const clock = {
    now: () => wall,
    schedule: (cb: () => void) => {
      callback = cb;
      return cb;
    },
    cancel: () => {
      callback = undefined;
    },
  };
  const host = new WorkerHost(clock, digest, identity(), (m) => output.push(m));
  const inputs = await prepareAster(digest, 100);
  if (horizon !== 9000) {
    inputs.scenario = ScenarioSchema.parse({
      ...inputs.scenario,
      horizonTicks: horizon,
      warmupTicks: 0,
    });
    inputs.hashes.scenario = await digest(canonical(inputs.scenario));
    inputs.manifest = generateManifest(
      compileCity(inputs.city),
      inputs.scenario,
      inputs.hashes.scenario,
    );
    inputs.hashes.manifest = await digest(canonical(inputs.manifest));
  }
  let serial = 0;
  let epoch = 1;
  type Payload<T = EngineCommand> = T extends EngineCommand
    ? Omit<T, 'protocolVersion' | 'runId' | 'epoch' | 'requestId'>
    : never;
  const send = async (payload: Payload, explicitEpoch = epoch) => {
    const requestId = `r-${serial++}`;
    await host.receive({
      ...payload,
      protocolVersion: 'protocol/2',
      runId: 'worker-test',
      epoch: explicitEpoch,
      requestId,
    });
    return output.findLast((m) => m.requestId === requestId);
  };
  await send({
    type: 'INIT',
    city: inputs.city,
    scenario: inputs.scenario,
    manifest: inputs.manifest,
    expectedHashes: inputs.hashes,
    compatibility: identity(),
  });
  const advance = async (ms: number) => {
    wall += ms;
    const cb = callback;
    callback = undefined;
    cb?.();
    await send({ type: 'GET_DETAILS', entityId: 'V000' });
  };
  return {
    host,
    output,
    send,
    advance,
    jump: (ms: number) => {
      wall += ms;
    },
    nextEpoch: () => ++epoch,
  };
}
describe('worker authoritative clock and lifecycle', () => {
  it('publishes the exact odd-tick snapshot when a wall gap pauses the run', async () => {
    const f = await fixture();
    await f.send({ type: 'PLAY' });
    await f.advance(100);
    await f.advance(501);
    expect(f.output.findLast((m) => m.type === 'SNAPSHOT')).toMatchObject({
      snapshot: { tick: 1 },
    });
    expect(f.output.findLast((m) => m.type === 'CONTROL_ACK')).toMatchObject({
      mode: 'PAUSED',
      authoritativeTick: 1,
    });
    f.host.dispose();
  });
  it('acknowledges horizon completion and publishes its exact endpoint', async () => {
    const f = await fixture(3);
    await f.send({ type: 'PLAY' });
    await f.advance(400);
    expect(f.output.findLast((m) => m.type === 'SNAPSHOT')).toMatchObject({
      snapshot: { tick: 3 },
    });
    expect(f.output.findLast((m) => m.type === 'CONTROL_ACK')).toMatchObject({
      mode: 'PAUSED',
      authoritativeTick: 3,
    });
    f.host.dispose();
  });
  it('does not hide a long wall gap behind a speed command', async () => {
    const f = await fixture();
    await f.send({ type: 'PLAY' });
    f.jump(501);
    expect(await f.send({ type: 'SET_SPEED', speed: 4 })).toMatchObject({
      mode: 'PAUSED',
      authoritativeTick: 0,
    });
    await f.send({ type: 'PLAY' });
    await f.advance(100);
    expect(await f.send({ type: 'PAUSE' })).toMatchObject({ authoritativeTick: 4 });
    f.host.dispose();
  });
  it('produces the headless checkpoint hash at equal ticks under all scheduler speeds', async () => {
    const commands = [
      {
        commandId: 'timed-close',
        desiredTick: 50,
        intervention: {
          type: 'CLOSE_LANES' as const,
          laneIds: ['L:J11>J21'],
          expectedTopologyVersion: 0,
        },
      },
      {
        commandId: 'timed-open',
        desiredTick: 75,
        intervention: {
          type: 'OPEN_LANES' as const,
          laneIds: ['L:J11>J21'],
          expectedTopologyVersion: 0,
        },
      },
    ];
    const headless = await RunSession.create(
      await prepareAster(digest, 100),
      digest,
      identity(),
      'worker-test',
      commands,
    );
    await headless.advanceTo(100);
    const expected = (await headless.artifact()).outcome.finalHash;
    for (const speed of [0.25, 1, 2, 4] as const) {
      const f = await fixture();
      for (const command of commands) await f.send({ type: 'SUBMIT', command });
      await f.send({ type: 'SET_SPEED', speed });
      await f.send({ type: 'PLAY' });
      for (let i = 0; i < 100 / speed; i++) await f.advance(100);
      await f.send({ type: 'PAUSE' });
      const exported = await f.send({ type: 'EXPORT' });
      if (exported?.type !== 'ARTIFACT') throw new Error('Missing artifact');
      const artifact = JSON.parse(exported.json) as {
        outcome: { finalHash: string; finalTick: number };
      };
      expect(artifact.outcome.finalTick).toBe(100);
      expect(artifact.outcome.finalHash).toBe(expected);
      f.host.dispose();
    }
  }, 30000);
  it.each([0.25, 1, 2, 4] as const)(
    'advances exact fixed ticks at speed %s without a rendering clock',
    async (speed) => {
      const f = await fixture();
      await f.send({ type: 'SET_SPEED', speed });
      await f.send({ type: 'PLAY' });
      for (let i = 0; i < 100; i++) await f.advance(10);
      const ack = await f.send({ type: 'PAUSE' });
      expect(ack).toMatchObject({
        type: 'CONTROL_ACK',
        authoritativeTick: Math.floor(10 * speed),
        mode: 'PAUSED',
      });
      const snapshots = f.output.filter((m) => m.type === 'SNAPSHOT');
      expect(snapshots.length).toBeLessThanOrEqual(23);
      await f.advance(1000);
      const step = await f.send({ type: 'STEP' });
      expect(step).toMatchObject({ authoritativeTick: Math.floor(10 * speed) + 1 });
      f.host.dispose();
    },
  );
  it('auto-pauses wall gaps, rejects stale epochs, and keeps import failure recoverable', async () => {
    const f = await fixture();
    await f.send({ type: 'PLAY' });
    await f.advance(501);
    expect(f.output.some((m) => m.type === 'STATUS' && m.reason === 'WALL_GAP_AUTO_PAUSE')).toBe(
      true,
    );
    expect(await f.send({ type: 'STEP' })).toMatchObject({ authoritativeTick: 1 });
    const artifact = await f.send({ type: 'EXPORT' });
    if (artifact?.type !== 'ARTIFACT') throw new Error('Missing artifact');
    f.nextEpoch();
    expect(await f.send({ type: 'IMPORT', json: '{}', compatibility: identity() })).toMatchObject({
      type: 'ERROR',
    });
    expect(await f.send({ type: 'STEP' })).toMatchObject({ authoritativeTick: 2 });
    f.nextEpoch();
    expect(
      await f.send({ type: 'IMPORT', json: artifact.json, compatibility: identity() }),
    ).toMatchObject({ type: 'RESTORED', snapshot: { tick: 1 } });
    expect(await f.send({ type: 'STEP' }, 1)).toMatchObject({ type: 'ERROR', code: 'STALE_EPOCH' });
    expect(await f.send({ type: 'STEP' })).toMatchObject({ authoritativeTick: 2 });
    f.nextEpoch();
    expect(await f.send({ type: 'RESET' })).toMatchObject({ snapshot: { tick: 0 } });
    f.host.dispose();
  });
  it('acknowledges an intervention before its exact next-tick effect and bounds snapshots', async () => {
    const f = await fixture();
    const ack = await f.send({
      type: 'SUBMIT',
      command: {
        commandId: 'close',
        intervention: { type: 'CLOSE_LANES', laneIds: ['L:J11>J21'], expectedTopologyVersion: 0 },
      },
    });
    expect(ack).toMatchObject({
      type: 'COMMAND_ACK',
      command: { acceptedAtTick: 0, acceptedTick: 1 },
    });
    expect(
      f.output
        .flatMap((m) => (m.type === 'EVENT_BATCH' ? m.events : []))
        .some((e) => e.type === 'CLOSURE_APPLIED'),
    ).toBe(false);
    await f.send({ type: 'STEP' });
    expect(
      f.output
        .flatMap((m) => (m.type === 'EVENT_BATCH' ? m.events : []))
        .some((e) => e.type === 'CLOSURE_APPLIED' && e.tick === 1),
    ).toBe(true);
    for (const m of f.output)
      if (m.type === 'SNAPSHOT')
        expect(Buffer.byteLength(JSON.stringify(m.snapshot))).toBeLessThanOrEqual(32768);
    f.host.dispose();
  });
});
