import { describe, it, expect } from 'vitest';
import {
  Simulation,
  prepareAster,
  Router,
  compileCity,
  ballistic,
  idm,
  canonical,
} from '@civitas/simulation';
import type { EngineState } from '@civitas/contracts';
import { digest } from '../../scripts/runtime';
import { controlledInputs } from '../fixtures/traffic';

describe('B03 analytical dynamics and deterministic routing', () => {
  it('integrates prescribed acceleration and stops within quantization tolerance without reversing', () => {
    let speed = 0,
      distance = 0;
    for (let i = 0; i < 100; i++) {
      const result = ballistic(speed, 2000);
      speed = result.speed;
      distance += result.distance;
    }
    expect(speed).toBeCloseTo(20000, 6);
    expect(Math.abs(distance - 100000)).toBeLessThan(100);
    speed = 10000;
    distance = 0;
    for (let i = 0; i < 100; i++) {
      const result = ballistic(speed, -2000);
      expect(result.speed).toBeGreaterThanOrEqual(0);
      distance += result.distance;
      speed = result.speed;
    }
    expect(speed).toBe(0);
    expect(Math.abs(distance - 25000)).toBeLessThan(100);
    const stop = ballistic(100, -6000);
    expect(stop.speed).toBe(0);
    expect(stop.distance).toBeGreaterThan(0);
  });
  it('approaches the limit in free-road IDM, and brakes for a stopped leader', () => {
    const profile = { a: 1500, b: 2000, headway: 1.2, minimumGap: 2000 };
    let speed = 0;
    for (let i = 0; i < 1000; i++) {
      const acceleration = idm(speed, 13889, undefined, 0, profile);
      const next = ballistic(speed, acceleration).speed;
      expect(next).toBeGreaterThanOrEqual(speed - 0.001);
      expect(next).toBeLessThanOrEqual(13890);
      speed = next;
    }
    expect(speed).toBeGreaterThan(13880);
    expect(idm(10000, 13889, 20000, 0, profile)).toBeLessThan(0);
  });
  it('has known one-lane/straight-two-lane costs and preserves current closed edges', async () => {
    const { city } = await prepareAster(digest);
    const graph = compileCity(city);
    const router = new Router(graph);
    expect(router.route('J00', 'J10')?.cost).toBe(113);
    expect(router.route('J00', 'J20')?.cost).toBe(270);
    const closed = new Set(['L:J00>J10']);
    expect(router.route('J00', 'J10', closed, 1)?.cost).toBeGreaterThan(113);
    expect(router.route('J10', 'J10', closed, 2, 'L:J00>J10')?.edges).toEqual(['L:J00>J10']);
  });
  it('resolves analytical 20/40 tick alternatives and lexicographic ties', async () => {
    const { city } = await prepareAster(digest);
    const graph = compileCity(city);
    for (const edge of graph.edges.values()) {
      edge.lengthMm = 100000;
      edge.limit = 100;
    }
    const short = ['L:J00>J10', 'M:L:J00>J10>L:J10>J11', 'L:J10>J11'];
    const long = ['L:J00>J01', 'M:L:J00>J01>L:J01>J11', 'L:J01>J11'];
    for (const id of short) {
      const e = graph.edges.get(id)!;
      e.limit = 1000;
      e.lengthMm = e.kind === 'LANE' ? 900 : 200;
    }
    for (const id of long) {
      const e = graph.edges.get(id)!;
      e.limit = 1000;
      e.lengthMm = e.kind === 'LANE' ? 1900 : 200;
    }
    const router = new Router(graph);
    expect(router.route('J00', 'J11')?.cost).toBe(20);
    expect(router.route('J00', 'J11', new Set([short[0]!]), 1)?.cost).toBe(40);
    for (const id of long) {
      const e = graph.edges.get(id)!;
      e.lengthMm = e.kind === 'LANE' ? 900 : 200;
    }
    expect(new Router(graph).route('J00', 'J11')?.edges).toEqual(long);
  });
});

describe('B03 operational traffic and interventions', () => {
  it('forms and releases a sustained-demand red-gate queue through real detector crossings', async () => {
    const e = new Simulation(
      await controlledInputs(
        Array.from({ length: 12 }, (_, i) => ({ origin: 'J10', destination: 'J12', tick: i * 5 })),
      ),
    );
    while (e.tick < 300) e.step();
    expect(e.stats().queued).toBeGreaterThan(0);
    while (e.tick < 650) e.step();
    expect(e.stats().completed).toBeGreaterThan(0);
    const flow = e
      .metrics()
      .find(
        (m) => m.metricId === 'lane_flow' && m.scope.kind === 'LANE' && m.scope.id === 'L:J10>J11',
      );
    expect(flow?.sampleCount).toBeGreaterThan(0);
    expect(e.events().filter((event) => event.type === 'TRIP_ARRIVED').length).toBe(
      e.stats().completed,
    );
    while (e.tick < 9000 && e.stats().completed < 12) e.step();
    expect(e.stats().completed).toBe(12);
    expect(e.stats().queued).toBe(0);
    expect(e.stats().inNetwork).toBe(0);
    expect(e.stats().backlog).toBe(0);
  });
  it('extends all-red until the reserved vehicle rear clears the junction', async () => {
    const inputs = await controlledInputs();
    const original = new Simulation(inputs);
    while (original.tick < 350) original.step();
    const state = original.state();
    expect(state.reservations).toHaveLength(1);
    const signal = state.signals.find((s) => s.id === 'S:J11')!;
    signal.phase = 'ALL_RED';
    signal.remainingTicks = 0;
    const e = new Simulation(inputs, {
      state,
      events: original.events(),
      ledger: original.metricLedger(),
    });
    let waited = 0;
    while (e.state().reservations.length) {
      e.step();
      expect(e.state().signals.find((s) => s.id === 'S:J11')!.phase).toBe('ALL_RED');
      waited++;
      if (waited > 200) throw new Error('Reservation failed to clear');
    }
    expect(waited).toBeGreaterThan(20);
    e.step();
    expect(e.state().signals.find((s) => s.id === 'S:J11')!.phase).toBe('GREEN');
  });
  it('retains prior junction commitments while repairing the uncommitted suffix', async () => {
    const e = new Simulation(await controlledInputs([{ origin: 'J00', destination: 'J30' }]));
    while (e.tick < 341) e.step();
    const owner = e.state().reservations[0];
    expect(owner?.outgoingLaneId).toBe('L:J10>J20');
    e.accept({
      commandId: 'close-committed',
      intervention: {
        type: 'CLOSE_LANES',
        laneIds: ['L:J10>J20', 'L:J20>J30'],
        expectedTopologyVersion: 0,
      },
    });
    e.step();
    const route = e.state().agents[0]!.route!.edges.map((edge) => edge.id);
    expect(route).toContain('L:J10>J20');
    expect(route).not.toContain('L:J20>J30');
    expect(
      e
        .events()
        .some((event) => event.type === 'CLOSURE_DRAIN_EXCEPTION' && event.entityId === 'V000'),
    ).toBe(true);
    while (e.tick < 1600) e.step();
    expect(e.stats().safetyCorrections).toBe(0);
    expect(
      e
        .events()
        .some((event) => event.type === 'RESERVATION_RELEASED' && event.reason === owner?.id),
    ).toBe(true);
  });
  it('uses exactly 120/30/20 transition phases, forms a queue, and grants only on green', async () => {
    const e = new Simulation(await controlledInputs());
    const signalIndex = e.graph.city.intersections.findIndex((i) => i.nodeId === 'J11');
    const phase = (state: EngineState) => state.signals[signalIndex]!.phase;
    for (let i = 0; i < 119; i++) e.step();
    expect(phase(e.state())).toBe('GREEN');
    e.step();
    expect(phase(e.state())).toBe('GREEN');
    e.step();
    expect(phase(e.state())).toBe('AMBER');
    for (let i = 122; i <= 150; i++) e.step();
    expect(phase(e.state())).toBe('AMBER');
    e.step();
    expect(phase(e.state())).toBe('ALL_RED');
    for (let i = 152; i <= 170; i++) e.step();
    expect(phase(e.state())).toBe('ALL_RED');
    e.step();
    expect(phase(e.state())).toBe('GREEN');
    while (e.tick < 300) e.step();
    expect(e.stats().queued).toBeGreaterThan(0);
    expect(e.events().filter((x) => x.type === 'RESERVATION_GRANTED')).toHaveLength(0);
    while (e.tick < 650) e.step();
    expect(e.events().some((x) => x.type === 'RESERVATION_GRANTED' && x.tick >= 341)).toBe(true);
    expect(e.stats().completed).toBe(1);
    expect(e.stats().safetyCorrections).toBe(0);
    expect(e.stats().emergencyViolations).toBe(0);
  });
  it('prevents reservation when downstream entrance storage is full', async () => {
    const inputs = await controlledInputs([
      { origin: 'J10', destination: 'J12' },
      { origin: 'J11', destination: 'J12' },
    ]);
    const initial = new Simulation(inputs);
    const state = initial.state();
    state.agents.slice(0, 2).forEach((a, i) => {
      const trip = inputs.manifest.requests[i]!;
      const path = new Router(initial.graph).route(
        trip.originGatewayId,
        trip.destinationGatewayId,
      )!;
      a.activeTripId = trip.id;
      a.location = { kind: 'ON_LANE', laneId: path.edges[0]!, frontMm: i === 0 ? 150000 : 4500 };
      a.route = {
        edges: path.edges.map((id) => ({ kind: initial.graph.edges.get(id)!.kind, id })),
        freeFlowTicks: path.cost,
        topologyVersion: 0,
      };
      state.trips[i] = [3, 0, 0, -1];
    });
    state.sourceQueues = initial.graph.laneList.map(() => []);
    const signal = state.signals.find((s) => s.id === 'S:J11')!;
    signal.phase = 'GREEN';
    signal.approach = 'S';
    signal.remainingTicks = 120;
    const e = new Simulation(inputs, { state, events: initial.events(), ledger: [] });
    e.step();
    expect(e.state().reservations.some((r) => r.agentId === 'V000')).toBe(false);
  });
  it('closes directions, repairs routes, preserves commitments, rejects invalid/duplicate mutations and reopens', async () => {
    const input = await controlledInputs();
    const e = new Simulation(input);
    const close = {
      commandId: 'close',
      desiredTick: 1,
      intervention: {
        type: 'CLOSE_LANES' as const,
        laneIds: ['L:J10>J11'],
        expectedTopologyVersion: 0,
      },
    };
    const accepted = e.accept(close);
    expect(e.accept(close)).toEqual(accepted);
    expect(() =>
      e.accept({
        ...close,
        commandId: 'unknown',
        intervention: { ...close.intervention, laneIds: ['unknown'] },
      }),
    ).toThrow('Unknown');
    e.step();
    expect(e.state().commands).toHaveLength(1);
    expect(e.state().agents[0]!.route?.edges.some((x) => x.id === 'L:J10>J11')).toBe(false);
    expect(() => e.accept({ ...close, commandId: 'stale' })).toThrow('Stale');
    e.accept({
      commandId: 'reopen',
      intervention: { type: 'OPEN_LANES', laneIds: ['L:J10>J11'], expectedTopologyVersion: 1 },
    });
    e.step();
    expect(e.state().laneClosed[e.graph.edges.get('L:J10>J11')!.index]).toBe(false);
    expect(e.events().filter((x) => x.type === 'CLOSURE_APPLIED')).toHaveLength(1);
  });
  it('accounts for disconnected demand for 1000 ticks and retries immediately after reopening', async () => {
    const e = new Simulation(await controlledInputs());
    const lanes = e.graph.nodes.get('J10')!.outgoingLaneIds;
    for (let i = 0; i < lanes.length; i += 2)
      e.accept({
        commandId: `cut-${i}`,
        desiredTick: 1,
        intervention: {
          type: 'CLOSE_LANES',
          laneIds: lanes.slice(i, i + 2),
          expectedTopologyVersion: 0,
        },
      });
    for (let i = 0; i < 1000; i++) e.step();
    expect(e.stats().backlog).toBe(1);
    expect(e.stats().inNetwork).toBe(0);
    expect(e.stats().fleet).toBe(100);
    expect(e.state().trips[0]![1]).toBe(1);
    e.accept({
      commandId: 'restore',
      intervention: {
        type: 'OPEN_LANES',
        laneIds: ['L:J10>J11'],
        expectedTopologyVersion: e.state().topologyVersion,
      },
    });
    e.step();
    expect(e.stats().inNetwork).toBe(1);
  });
  it('keeps 300-agent baseline safe and genuinely places at least 100 in the network', async () => {
    const input = await prepareAster(digest, 300);
    const e = new Simulation(input);
    for (let i = 0; i < 1600; i++) e.step();
    expect(e.stats().inNetwork).toBeGreaterThanOrEqual(100);
    expect(e.stats().safetyCorrections).toBe(0);
    expect(e.stats().emergencyViolations).toBe(0);
    const first = e.state();
    const second = new Simulation(input);
    for (let i = 0; i < 1600; i++) second.step();
    expect(canonical(second.state())).toBe(canonical(first));
  }, 15000);
});
