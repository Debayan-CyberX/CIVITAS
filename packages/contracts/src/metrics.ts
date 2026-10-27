import { z } from 'zod';
import {
  DistrictIdSchema,
  CounterSchema,
  FiniteSchema,
  LaneIdSchema,
  RunIdSchema,
  TickSchema,
  TripIdSchema,
  ReasonSchema,
} from './primitives';
import { METRIC_DEFINITION_VERSION } from './versions';

export const MetricIdSchema = z.enum([
  'fleet',
  'in_network',
  'source_backlog',
  'lane_queue',
  'network_queued_share',
  'network_mean_speed',
  'lane_flow',
  'trip_duration',
  'network_travel_time',
  'delay',
  'completed_throughput',
  'unfinished_requests',
  'congested_lane_time_share',
]);
export const MetricUnitSchema = z.enum(['count', 'percent', 'km/h', 'veh/h', 'seconds']);
export const MetricScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('NETWORK') }),
  z.strictObject({ kind: z.literal('DISTRICT'), id: DistrictIdSchema }),
  z.strictObject({ kind: z.literal('LANE'), id: LaneIdSchema }),
  z.strictObject({ kind: z.literal('TRIP'), id: TripIdSchema }),
]);
export const MetricDefinitionSchema = z.strictObject({
  id: MetricIdSchema,
  version: z.literal(METRIC_DEFINITION_VERSION),
  unit: MetricUnitSchema,
  numerator: ReasonSchema,
  denominator: ReasonSchema,
  windowTicks: CounterSchema.max(600),
  undefinedWhen: ReasonSchema,
});

type DefinitionInput = Omit<z.input<typeof MetricDefinitionSchema>, 'version'>;
const definitions: DefinitionInput[] = [
  {
    id: 'fleet',
    unit: 'count',
    numerator: 'Configured finite vehicle agents',
    denominator: 'One',
    windowTicks: 0,
    undefinedWhen: 'Never after valid initialization',
  },
  {
    id: 'in_network',
    unit: 'count',
    numerator: 'Unique ON_LANE and ON_CONNECTOR agents',
    denominator: 'One',
    windowTicks: 0,
    undefinedWhen: 'Never after valid initialization',
  },
  {
    id: 'source_backlog',
    unit: 'count',
    numerator: 'Due requests not yet admitted; split source queued and waiting for agent',
    denominator: 'One',
    windowTicks: 0,
    undefinedWhen: 'Never after valid initialization',
  },
  {
    id: 'lane_queue',
    unit: 'count',
    numerator: 'Lane-front agents below 0.5 m/s for ten consecutive ticks',
    denominator: 'One',
    windowTicks: 0,
    undefinedWhen: 'Never for a valid lane',
  },
  {
    id: 'network_queued_share',
    unit: 'percent',
    numerator: 'Unique queued lane agents times 100',
    denominator: 'Unique in-network agents',
    windowTicks: 0,
    undefinedWhen: 'No in-network agents',
  },
  {
    id: 'network_mean_speed',
    unit: 'km/h',
    numerator: 'Actual in-network distance converted from meters to kilometers',
    denominator: 'In-network vehicle-time converted from seconds to hours',
    windowTicks: 600,
    undefinedWhen: 'No vehicle-time in window',
  },
  {
    id: 'lane_flow',
    unit: 'veh/h',
    numerator: 'Front-bumper exit detector crossings times 3600',
    denominator: 'Actual window seconds',
    windowTicks: 600,
    undefinedWhen: 'Zero-duration window',
  },
  {
    id: 'trip_duration',
    unit: 'seconds',
    numerator: 'Nearest-rank median and p95 of completed request-to-arrival durations',
    denominator: 'Completed request sample; expose n and statistic',
    windowTicks: 600,
    undefinedWhen: 'No completed requests in window',
  },
  {
    id: 'network_travel_time',
    unit: 'seconds',
    numerator: 'Arrival time minus admission time',
    denominator: 'Selected completed trip',
    windowTicks: 0,
    undefinedWhen: 'Trip has not arrived',
  },
  {
    id: 'delay',
    unit: 'seconds',
    numerator: 'Sum max(0, request-to-arrival seconds minus frozen base free-flow seconds)',
    denominator: 'Completed requests in window; expose n',
    windowTicks: 600,
    undefinedWhen: 'No completed requests in window',
  },
  {
    id: 'completed_throughput',
    unit: 'veh/h',
    numerator: 'Arrivals times 3600; expose raw count',
    denominator: 'Actual window seconds',
    windowTicks: 600,
    undefinedWhen: 'Zero-duration window',
  },
  {
    id: 'unfinished_requests',
    unit: 'count',
    numerator: 'Due requests without arrival; expose request age and admission status',
    denominator: 'One',
    windowTicks: 0,
    undefinedWhen: 'Never after valid initialization',
  },
  {
    id: 'congested_lane_time_share',
    unit: 'percent',
    numerator: 'Eligible lane-ticks with trailing 100-tick mean speed below 50% of limit times 100',
    denominator: 'Lane-ticks having positive trailing vehicle-time; expose coverage',
    windowTicks: 600,
    undefinedWhen: 'No eligible lane-time',
  },
];

// Definitions are specification metadata. No reducer or simulated reading is supplied by B01.
export const METRIC_DEFINITIONS = Object.freeze(
  definitions.map((definition) =>
    Object.freeze(
      MetricDefinitionSchema.parse({ ...definition, version: METRIC_DEFINITION_VERSION }),
    ),
  ),
);
export const MetricSampleSchema = z
  .strictObject({
    runId: RunIdSchema,
    metricId: MetricIdSchema,
    definitionVersion: z.literal(METRIC_DEFINITION_VERSION),
    unit: MetricUnitSchema,
    scope: MetricScopeSchema,
    asOfTick: TickSchema,
    windowStartTick: TickSchema,
    windowEndTick: TickSchema,
    sampleCount: CounterSchema,
    denominator: FiniteSchema.nonnegative(),
    value: FiniteSchema.nonnegative().nullable(),
    statistic: z.enum(['COUNT', 'RATE', 'SHARE', 'MEAN', 'MEDIAN', 'P95', 'TRIP']),
    qualityFlags: z
      .array(z.enum(['WARM_UP', 'NO_SAMPLES', 'UNAVAILABLE', 'STALE', 'CENSORED']))
      .max(5),
  })
  .superRefine((sample, context) => {
    if (sample.windowStartTick > sample.windowEndTick || sample.windowEndTick > sample.asOfTick) {
      context.addIssue({ code: 'custom', message: 'Invalid metric time window' });
    }
    const definition = METRIC_DEFINITIONS.find((item) => item.id === sample.metricId);
    if (definition?.unit !== sample.unit)
      context.addIssue({ code: 'custom', message: 'Metric unit mismatch' });
    if (sample.unit === 'percent' && sample.value !== null && sample.value > 100) {
      context.addIssue({ code: 'custom', message: 'Share cannot exceed 100 percent' });
    }
    if (sample.value === null && sample.qualityFlags.length === 0) {
      context.addIssue({ code: 'custom', message: 'Unavailable values require a quality reason' });
    }
    if (
      sample.value !== null &&
      sample.denominator === 0 &&
      [
        'network_mean_speed',
        'network_queued_share',
        'congested_lane_time_share',
        'delay',
        'lane_flow',
        'completed_throughput',
      ].includes(sample.metricId)
    ) {
      context.addIssue({ code: 'custom', message: 'Undefined ratio must be null' });
    }
    if (
      sample.value !== null &&
      sample.sampleCount === 0 &&
      ['trip_duration', 'network_travel_time', 'delay'].includes(sample.metricId)
    ) {
      context.addIssue({ code: 'custom', message: 'Missing trip sample must be null' });
    }
  });
export const UnavailableModelSchema = z.strictObject({
  model: z.enum(['ENERGY', 'POLLUTION']),
  status: z.literal('UNAVAILABLE'),
  reason: ReasonSchema,
});
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;
export type MetricSample = z.infer<typeof MetricSampleSchema>;
