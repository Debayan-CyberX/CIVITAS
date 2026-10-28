import { describe, it, expect } from 'vitest';
import {
  Simulation,
  RunSession,
  restoreCheckpoint,
  stateEvidence,
  canonical,
  nearestRank,
  metricSamples,
  tripMetrics,
} from '@civitas/simulation';
import { digest, identity } from '../../scripts/runtime';
import { controlledInputs } from '../fixtures/traffic';

describe('authoritative metrics and canonical replay', () => {
  it('matches independent metric arithmetic and exposes unavailable values', async () => {
    const inputs = await controlledInputs();
    const engine = new Simulation(inputs);
    const state = engine.state();
    expect(engine.metrics().find((s) => s.metricId === 'network_mean_speed')?.value).toBeNull();
    state.tick = 220;
    state.trips[0] = [4, 0, 20, 220];
    state.totals[2] = 1;
    inputs.manifest.requests[0]!.baseFreeFlowTicks = 100;
    state.metricFrames = [[220, 100000, 20000000, [], [], [], [], [], 2, 1, 200, [], [], []]];
    const samples = metricSamples(state, inputs, engine.graph);
    const find = (id: string, stat?: string) =>
      samples.find(
        (s) => s.metricId === id && (!stat || s.statistic === stat) && s.scope.kind === 'NETWORK',
      );
    expect(find('network_mean_speed')?.value).toBe(18);
    expect(find('trip_duration', 'MEDIAN')?.value).toBe(22);
    expect(find('delay')?.value).toBe(12);
    expect(tripMetrics(state, inputs, inputs.manifest.requests[0]!.id).map((m) => m.value)).toEqual(
      [22, 20, 12],
    );
    expect(find('completed_throughput')?.sampleCount).toBe(1);
    expect(find('congested_lane_time_share')?.value).toBe(50);
    expect(nearestRank([9, 1, 7, 3], 0.5)).toBe(3);
    expect(nearestRank([9, 1, 7, 3], 0.95)).toBe(9);
    expect(nearestRank([], 0.95)).toBeNull();
    state.tick = 820;
    expect(
      metricSamples(state, inputs, engine.graph).find((s) => s.metricId === 'trip_duration')?.value,
    ).toBeNull();
  });
  it('counts only ten consecutive low-speed lane observations and counts each detector once', async () => {
    const e = new Simulation(await controlledInputs());
    let consecutive = 0;
    let sawNine = false,
      sawTen = false,
      reset = false;
    let exits = 0;
    for (let i = 0; i < 700; i++) {
      e.step();
      const state = e.state();
      const agent = state.agents[0]!;
      consecutive =
        agent.location.kind === 'ON_LANE' && agent.speedMmPerSecond < 500 ? consecutive + 1 : 0;
      // Admission occurs after motion; the first observation contributes on the following transition.
      if (state.trips[0]![2] === e.tick) consecutive = 0;
      expect(agent.lowSpeedTicks).toBe(consecutive);
      const share = e.metrics().find((m) => m.metricId === 'network_queued_share');
      if (consecutive === 9) {
        sawNine = true;
        expect(share?.value).toBe(0);
      }
      if (consecutive === 10) {
        sawTen = true;
        expect(share?.value).toBe(100);
      }
      if (sawTen && consecutive === 0 && agent.location.kind === 'ON_LANE') {
        reset = true;
        expect(share?.value).toBe(0);
      }
      exits += e
        .recentTraversals()
        .filter(
          (t) =>
            e.graph.edges.get(t.edgeId)?.kind === 'LANE' &&
            t.endMm === e.graph.edges.get(t.edgeId)?.lengthMm,
        ).length;
      expect(state.metricFrames.at(-1)![5].reduce((a, b) => a + b, 0)).toBe(
        e
          .recentTraversals()
          .filter(
            (t) =>
              e.graph.edges.get(t.edgeId)?.kind === 'LANE' &&
              t.endMm === e.graph.edges.get(t.edgeId)?.lengthMm,
          ).length,
      );
    }
    expect(sawNine && sawTen && reset).toBe(true);
    expect(exits).toBe(2);
  });
  it('conserves distance and vehicle-time through district boundary splits', async () => {
    const e = new Simulation(await controlledInputs([{ origin: 'J00', destination: 'J30' }]));
    for (let i = 0; i < 1200; i++) {
      e.step();
      for (const f of e.state().metricFrames.slice(-1)) {
        expect(f[6].reduce((a, b) => a + b, 0)).toBe(f[1]);
        expect(f[7].reduce((a, b) => a + b, 0)).toBe(f[2]);
        const traversals = e.recentTraversals();
        expect(traversals.reduce((n, t) => n + t.endMm - t.startMm, 0)).toBe(f[1]);
        expect(traversals.reduce((n, t) => n + t.timeUs, 0)).toBe(f[2]);
      }
    }
    expect(e.stats().completed).toBe(1);
  });
  it('rejects noncanonical numbers and orders keys without locale dependence', () => {
    expect(canonical({ z: 1, a: [-0, { b: 2, a: 3 }] })).toBe('{"a":[0,{"a":3,"b":2}],"z":1}');
    expect(() => canonical({ n: NaN })).toThrow();
    expect(() => canonical({ x: undefined })).toThrow();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => canonical(cyclic)).toThrow();
  });
  it('restores occupied checkpoints, replays accepted boundaries, and rejects tampering', async () => {
    const inputs = await controlledInputs();
    const runtime = identity();
    const run = await RunSession.create(inputs, digest, runtime, 'replay-test');
    await run.advanceTo(100);
    run.engine.accept({
      commandId: 'close',
      desiredTick: 300,
      intervention: { type: 'CLOSE_LANES', laneIds: ['L:J11>J21'], expectedTopologyVersion: 0 },
    });
    await run.checkpoint();
    await run.advanceTo(350);
    await run.checkpoint();
    await run.advanceTo(700);
    const artifact = await run.artifact();
    expect(artifact.checkpoints.some((c) => c.state.reservations.length > 0)).toBe(true);
    for (const cp of artifact.checkpoints) {
      const restored = await restoreCheckpoint(
        cp,
        inputs,
        artifact.metricLedger,
        artifact.events,
        digest,
        runtime,
      );
      while (restored.tick < 700) {
        for (const c of artifact.commands)
          if (c.acceptedAtTick === restored.tick && c.seq >= restored.state().nextCommandSeq)
            restored.accept({
              commandId: c.commandId,
              desiredTick: c.acceptedTick,
              intervention: c.intervention,
            });
        restored.step();
      }
      expect((await stateEvidence(restored, digest)).stateHash).toBe(artifact.outcome.finalHash);
    }
    const json = await run.exportJson();
    const replay = await RunSession.importJson(json, digest, runtime);
    expect(await replay.exportJson()).toBe(json);
    const corrupt = JSON.parse(json) as { outcome: { finalHash: string } };
    corrupt.outcome.finalHash = '0'.repeat(64);
    await expect(RunSession.importJson(JSON.stringify(corrupt), digest, runtime)).rejects.toThrow();
    await expect(
      RunSession.importJson(json, digest, { ...runtime, runtimeVersion: 'incompatible' }),
    ).rejects.toThrow('Incompatible');
    await expect(
      RunSession.importJson(' '.repeat(32 * 1024 * 1024 + 1), digest, runtime),
    ).rejects.toThrow('32 MiB');
  }, 30000);
});
