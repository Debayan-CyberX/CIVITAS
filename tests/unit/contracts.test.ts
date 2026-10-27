import { describe, expect, it } from 'vitest';
import {
  AcceptedCommandSchema,
  CheckpointSchema,
  CityDefinitionSchema,
  DemandManifestSchema,
  FoundationProbeSchema,
  FoundationReplySchema,
  InterventionSchema,
  LaneIdSchema,
  METRIC_DEFINITIONS,
  MetricSampleSchema,
  PrngStateSchema,
  PROTOCOL_VERSION,
  ScenarioSchema,
  SnapshotSchema,
  TickSchema,
  TripRequestSchema,
  UnavailableModelSchema,
  WorkerCommandSchema,
  WorkerObservationSchema,
} from '@civitas/contracts';
import {
  checkpointFixture,
  cityFixture,
  manifestFixture,
  scenarioFixture,
} from '../fixtures/contracts';

const envelope = {
  protocolVersion: PROTOCOL_VERSION,
  runId: 'run-1',
  epoch: 0,
  requestId: 'request-1',
};
const intervention = { type: 'CLOSE_LANES', laneIds: ['L:A>B'], expectedTopologyVersion: 0 };

describe('structural input boundaries', () => {
  it('accepts reviewed shape fixtures without claiming graph or hash validity', () => {
    expect(CityDefinitionSchema.safeParse(cityFixture()).success).toBe(true);
    expect(ScenarioSchema.safeParse(scenarioFixture()).success).toBe(true);
    expect(DemandManifestSchema.safeParse(manifestFixture()).success).toBe(true);
  });
  it.each(['future/2', 1, null])('rejects unsupported city version %s', (schemaVersion) => {
    expect(CityDefinitionSchema.safeParse({ ...cityFixture(), schemaVersion }).success).toBe(false);
  });
  it('rejects undeclared units, unknown fields, invalid geometry, and oversized tables', () => {
    const city = cityFixture();
    expect(
      CityDefinitionSchema.safeParse({ ...city, frame: { ...city.frame, units: 'degrees' } })
        .success,
    ).toBe(false);
    expect(
      CityDefinitionSchema.safeParse({ ...city, externalUrl: 'https://example.com' }).success,
    ).toBe(false);
    expect(
      CityDefinitionSchema.safeParse({ ...city, bounds: { ...city.bounds, maxEastM: 0 } }).success,
    ).toBe(false);
    expect(
      CityDefinitionSchema.safeParse({
        ...city,
        nodes: Array.from({ length: 257 }, () => city.nodes[0]),
      }).success,
    ).toBe(false);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid tick %s',
    (value) => {
      expect(TickSchema.safeParse(value).success).toBe(false);
    },
  );
  it.each(['', 'L: A>B', '车辆', 'https://city.test'])(
    'rejects malformed entity ID %s',
    (value) => {
      expect(LaneIdSchema.safeParse(value).success).toBe(false);
    },
  );
  it('rejects variable dt, bad seed, invalid warm-up and fleet, and manifest count mismatch', () => {
    const scenario = scenarioFixture();
    expect(ScenarioSchema.safeParse({ ...scenario, tickDurationMs: 16 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, seed: 0x100000000 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...scenario, warmupTicks: 9000 }).success).toBe(false);
    expect(
      ScenarioSchema.safeParse({ ...scenario, demand: { ...scenario.demand, fleetSize: 99 } })
        .success,
    ).toBe(false);
    expect(DemandManifestSchema.safeParse({ ...manifestFixture(), agents: [] }).success).toBe(
      false,
    );
  });
  it('rejects same-gateway trips and all-zero imported generator state', () => {
    expect(
      TripRequestSchema.safeParse({
        id: 'T1',
        agentId: 'A1',
        requestedDepartureTick: 0,
        originGatewayId: 'A',
        destinationGatewayId: 'A',
        baseFreeFlowTicks: 1,
      }).success,
    ).toBe(false);
    expect(PrngStateSchema.safeParse([0, 0, 0, 0]).success).toBe(false);
    expect(PrngStateSchema.safeParse([0, 0, 0, 1]).success).toBe(true);
  });
});

describe('commands and observations', () => {
  it('validates discriminated messages and preserves command identity', () => {
    const submit = WorkerCommandSchema.parse({
      ...envelope,
      type: 'SUBMIT',
      command: { commandId: 'C1', intervention },
    });
    expect(submit.type).toBe('SUBMIT');
    expect(
      WorkerCommandSchema.safeParse({ ...envelope, type: 'TELEPORT', position: 10 }).success,
    ).toBe(false);
    expect(WorkerCommandSchema.safeParse({ ...envelope, type: 'STEP', epoch: -1 }).success).toBe(
      false,
    );
    expect(
      WorkerCommandSchema.safeParse({ ...envelope, type: 'STEP', protocolVersion: 'protocol/2' })
        .success,
    ).toBe(false);
  });
  it('rejects duplicate targets and execution at or before acceptance', () => {
    expect(
      InterventionSchema.safeParse({ ...intervention, laneIds: ['L:A>B', 'L:A>B'] }).success,
    ).toBe(false);
    expect(
      AcceptedCommandSchema.safeParse({
        commandId: 'C1',
        acceptedTick: 10,
        acceptedAtTick: 10,
        seq: 0,
        intervention,
      }).success,
    ).toBe(false);
  });
  it.each([0.25, 1, 2, 4])('accepts specified speed %s', (speed) => {
    expect(WorkerCommandSchema.safeParse({ ...envelope, type: 'SET_SPEED', speed }).success).toBe(
      true,
    );
  });
  it('rejects unspecified speed and incomplete acknowledgement', () => {
    expect(
      WorkerCommandSchema.safeParse({ ...envelope, type: 'SET_SPEED', speed: 3 }).success,
    ).toBe(false);
    expect(
      WorkerObservationSchema.safeParse({ ...envelope, type: 'CONTROL_ACK', mode: 'RUNNING' })
        .success,
    ).toBe(false);
  });
  it('keeps diagnostic transport separate from run commands', () => {
    const probe = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'FOUNDATION_PROBE',
      requestId: 'probe',
    };
    expect(FoundationProbeSchema.safeParse(probe).success).toBe(true);
    expect(WorkerCommandSchema.safeParse(probe).success).toBe(false);
    expect(
      FoundationReplySchema.safeParse({
        ...probe,
        type: 'FOUNDATION_READY',
        specVersion: 'sim-spec/1',
        tickDurationMs: 100,
        implementation: 'contracts-only',
      }).success,
    ).toBe(true);
  });
  it('ties snapshot time to authoritative ticks', () => {
    const snapshot = {
      tick: 2,
      simTimeMs: 200,
      agents: [],
      traversals: [],
      signals: [],
      lanes: [],
    };
    expect(SnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(SnapshotSchema.safeParse({ ...snapshot, simTimeMs: 201 }).success).toBe(false);
  });
});

describe('checkpoint and metric contracts', () => {
  it('requires complete restore categories, compatible version, and valid hash shape', () => {
    const checkpoint = checkpointFixture();
    expect(CheckpointSchema.safeParse(checkpoint).success).toBe(true);
    const { sourceQueues: omitted, ...incomplete } = checkpoint.state;
    expect(omitted).toEqual([]);
    expect(CheckpointSchema.safeParse({ ...checkpoint, state: incomplete }).success).toBe(false);
    expect(CheckpointSchema.safeParse({ ...checkpoint, stateHash: 'not-a-hash' }).success).toBe(
      false,
    );
    expect(
      CheckpointSchema.safeParse({ ...checkpoint, schemaVersion: 'checkpoint/2' }).success,
    ).toBe(false);
  });
  it('has unique versioned metric definitions and no energy/pollution reading', () => {
    expect(new Set(METRIC_DEFINITIONS.map((d) => d.id)).size).toBe(METRIC_DEFINITIONS.length);
    expect(
      UnavailableModelSchema.safeParse({
        model: 'ENERGY',
        status: 'UNAVAILABLE',
        reason: 'Model not enabled',
      }).success,
    ).toBe(true);
    expect(
      UnavailableModelSchema.safeParse({
        model: 'POLLUTION',
        status: 'UNAVAILABLE',
        reason: 'Model not enabled',
        value: 0,
      }).success,
    ).toBe(false);
  });
  it('preserves null and explicit sample/window metadata rather than inventing zero', () => {
    const sample = {
      runId: 'R1',
      metricId: 'network_mean_speed',
      definitionVersion: 'metrics/1',
      unit: 'km/h',
      scope: { kind: 'NETWORK' },
      asOfTick: 20,
      windowStartTick: 0,
      windowEndTick: 20,
      sampleCount: 0,
      denominator: 0,
      value: null,
      statistic: 'MEAN',
      qualityFlags: ['NO_SAMPLES'],
    };
    expect(MetricSampleSchema.parse(sample).value).toBeNull();
    expect(MetricSampleSchema.safeParse({ ...sample, value: 0 }).success).toBe(false);
    expect(MetricSampleSchema.safeParse({ ...sample, qualityFlags: [] }).success).toBe(false);
    expect(MetricSampleSchema.safeParse({ ...sample, unit: 'seconds' }).success).toBe(false);
    expect(MetricSampleSchema.safeParse({ ...sample, windowEndTick: 21 }).success).toBe(false);
  });
});
