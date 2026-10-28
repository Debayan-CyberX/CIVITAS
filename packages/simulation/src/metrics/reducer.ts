import { METRIC_DEFINITIONS, MetricSampleSchema } from '@civitas/contracts';
import type { EngineState, MetricSample } from '@civitas/contracts';
import type { CompiledCity } from '../city/compile';
import type { SimulationInputs } from '../city/inputs';

export function nearestRank(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p <= 0 || p > 1) throw new Error('Invalid percentile');
  return [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1] ?? null;
}
export function metricSamples(
  state: EngineState,
  inputs: SimulationInputs,
  graph: CompiledCity,
  runId = 'headless',
): MetricSample[] {
  const tick = state.tick;
  const start = Math.max(0, tick - 600);
  const frames = state.metricFrames.filter((f) => f[0] > start && f[0] <= tick);
  const seconds = (tick - start) * 0.1;
  const samples: MetricSample[] = [];
  const add = (
    id: MetricSample['metricId'],
    value: number | null,
    n: number,
    denominator: number,
    statistic: MetricSample['statistic'],
    scope: unknown = { kind: 'NETWORK' },
    windowStart = start,
  ) => {
    const def = METRIC_DEFINITIONS.find((d) => d.id === id);
    if (!def) throw new Error('Missing metric definition');
    const qualityFlags: string[] = [];
    if (value === null) qualityFlags.push('NO_SAMPLES');
    if (def.windowTicks > 0 && tick < 600) qualityFlags.push('WARM_UP');
    samples.push(
      MetricSampleSchema.parse({
        runId,
        metricId: id,
        definitionVersion: def.version,
        unit: def.unit,
        scope,
        asOfTick: tick,
        windowStartTick: windowStart,
        windowEndTick: tick,
        sampleCount: n,
        denominator,
        value,
        statistic,
        qualityFlags,
      }),
    );
  };
  const active = state.agents.filter(
    (a) => a.location.kind === 'ON_LANE' || a.location.kind === 'ON_CONNECTOR',
  );
  const queued = state.agents.filter(
    (a) => a.location.kind === 'ON_LANE' && a.lowSpeedTicks >= 10,
  ).length;
  const backlog = state.trips.filter((t) => t[0] === 1 || t[0] === 2).length;
  add('fleet', state.agents.length, state.agents.length, 1, 'COUNT', undefined, tick);
  add('in_network', active.length, active.length, 1, 'COUNT', undefined, tick);
  add('source_backlog', backlog, state.dueCursor, 1, 'COUNT', undefined, tick);
  add(
    'unfinished_requests',
    state.dueCursor - state.totals[2],
    state.dueCursor,
    1,
    'COUNT',
    undefined,
    tick,
  );
  add(
    'network_queued_share',
    active.length ? (100 * queued) / active.length : null,
    active.length,
    active.length,
    'SHARE',
    undefined,
    tick,
  );
  const totalDistance = frames.reduce((n, f) => n + f[1], 0);
  const totalTime = frames.reduce((n, f) => n + f[2], 0);
  const observations = frames.reduce((n, f) => n + f[10], 0);
  add(
    'network_mean_speed',
    totalTime ? totalDistance / 1000000 / (totalTime / 3600000000) : null,
    observations,
    totalTime / 3600000000,
    'MEAN',
  );
  const completed = state.trips
    .map((row, i) => ({ row, request: inputs.manifest.requests[i] }))
    .filter(({ row }) => row[0] === 4 && row[3] > start && row[3] <= tick);
  const durations = completed.map(
    ({ row, request }) => (row[3] - (request?.requestedDepartureTick ?? 0)) * 0.1,
  );
  const delays = completed.map(({ row, request }) =>
    Math.max(
      0,
      (row[3] - (request?.requestedDepartureTick ?? 0) - (request?.baseFreeFlowTicks ?? 0)) * 0.1,
    ),
  );
  add('trip_duration', nearestRank(durations, 0.5), durations.length, durations.length, 'MEDIAN');
  add('trip_duration', nearestRank(durations, 0.95), durations.length, durations.length, 'P95');
  add(
    'delay',
    delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    delays.length,
    delays.length,
    'MEAN',
  );
  add(
    'completed_throughput',
    seconds ? (completed.length / seconds) * 3600 : null,
    completed.length,
    seconds,
    'RATE',
  );
  const eligible = frames.reduce((n, f) => n + f[8], 0);
  const congested = frames.reduce((n, f) => n + f[9], 0);
  add(
    'congested_lane_time_share',
    eligible ? (congested / eligible) * 100 : null,
    graph.laneList.length * (tick - start),
    eligible,
    'SHARE',
  );
  for (const [i, lane] of graph.laneList.entries()) {
    const count = state.agents.filter(
      (a) =>
        a.location.kind === 'ON_LANE' && a.location.laneId === lane.id && a.lowSpeedTicks >= 10,
    ).length;
    add('lane_queue', count, 1, 1, 'COUNT', { kind: 'LANE', id: lane.id }, tick);
    const crossings = frames.reduce((n, f) => n + (f[5][i] ?? 0), 0);
    add('lane_flow', seconds ? (crossings / seconds) * 3600 : null, crossings, seconds, 'RATE', {
      kind: 'LANE',
      id: lane.id,
    });
  }
  for (const [i, id] of [...graph.districts.keys()].sort().entries()) {
    const distance = frames.reduce((n, f) => n + (f[6][i] ?? 0), 0);
    const time = frames.reduce((n, f) => n + (f[7][i] ?? 0), 0);
    const n = frames.reduce((sum, f) => sum + (f[12][i] ?? 0), 0);
    add(
      'network_mean_speed',
      time ? distance / 1000000 / (time / 3600000000) : null,
      n,
      time / 3600000000,
      'MEAN',
      { kind: 'DISTRICT', id },
    );
  }
  return samples;
}
export function tripMetrics(
  state: EngineState,
  inputs: SimulationInputs,
  tripId: string,
  runId = 'headless',
): MetricSample[] {
  const index = inputs.manifest.requests.findIndex((r) => r.id === tripId);
  const request = inputs.manifest.requests[index];
  const row = state.trips[index];
  if (!request || !row) throw new Error('Unknown trip');
  const complete = row[0] === 4;
  const duration = complete ? (row[3] - request.requestedDepartureTick) * 0.1 : null;
  return (['trip_duration', 'network_travel_time', 'delay'] as const).map((metricId) =>
    MetricSampleSchema.parse({
      runId,
      metricId,
      definitionVersion: 'metrics/1',
      unit: 'seconds',
      scope: { kind: 'TRIP', id: tripId },
      asOfTick: state.tick,
      windowStartTick: complete ? row[3] : state.tick,
      windowEndTick: complete ? row[3] : state.tick,
      sampleCount: complete ? 1 : 0,
      denominator: complete ? 1 : 0,
      value: !complete
        ? null
        : metricId === 'trip_duration'
          ? duration
          : metricId === 'network_travel_time'
            ? (row[3] - row[2]) * 0.1
            : Math.max(0, (duration ?? 0) - request.baseFreeFlowTicks * 0.1),
      statistic: 'TRIP',
      qualityFlags: complete ? [] : ['NO_SAMPLES'],
    }),
  );
}
