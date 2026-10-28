import { z } from 'zod';
import { CityDefinitionSchema } from './city';
import { ScenarioSchema, DemandManifestSchema } from './scenario';
import { AcceptedCommandSchema, SubmittedCommandSchema } from './commands';
import type { FootprintSchema } from './state';
import {
  AgentStateSchema,
  RuntimeIdentitySchema,
  SignalStateSchema,
  ReservationSchema,
} from './state';
import {
  CounterSchema,
  EntityIdSchema,
  InputHashesSchema,
  PrngStateSchema,
  ReasonSchema,
  RequestIdSchema,
  RunIdSchema,
  Sha256Schema,
  TickSchema,
  PlaybackSpeedSchema,
} from './primitives';
import {
  MetricSampleSchema,
  MetricDefinitionSchema,
  MetricIdSchema,
  MetricScopeSchema,
} from './metrics';
import { LIMITS } from './versions';

// B01's shape-only v1 contracts remain available. Operational restore data is explicitly v2.
export const ENGINE_PROTOCOL_VERSION = 'protocol/2' as const;
export const ENGINE_CHECKPOINT_VERSION = 'checkpoint/2' as const;
export const ENGINE_ARTIFACT_VERSION = 'artifact/2' as const;
export const EngineAgentSchema = AgentStateSchema.extend({
  trail: z.array(EntityIdSchema).max(3),
  retryAt: CounterSchema,
  routeTopology: CounterSchema,
  reservationStallTicks: CounterSchema,
});
// Trip rows are in immutable manifest order: status, blocked reason, admitted tick, arrival tick.
export const TripRowSchema = z.tuple([
  CounterSchema.max(4),
  CounterSchema.max(3),
  z.number().int().min(-1).safe(),
  z.number().int().min(-1).safe(),
]);
export const MetricFrameSchema = z.tuple([
  TickSchema,
  CounterSchema,
  CounterSchema,
  z.array(CounterSchema).max(LIMITS.lanes),
  z.array(CounterSchema).max(LIMITS.lanes),
  z.array(CounterSchema).max(LIMITS.lanes),
  z.array(CounterSchema).max(LIMITS.districts),
  z.array(CounterSchema).max(LIMITS.districts),
  CounterSchema,
  CounterSchema,
  CounterSchema,
  z.array(CounterSchema).max(LIMITS.lanes),
  z.array(CounterSchema).max(LIMITS.districts),
  // Detector crossings: agent slot, lane index, microseconds from transition start.
  z.array(z.tuple([CounterSchema, CounterSchema, CounterSchema.max(100000)])).max(LIMITS.agents),
]);
export const EngineStateSchema = z.strictObject({
  tick: TickSchema,
  topologyVersion: CounterSchema,
  agents: z.array(EngineAgentSchema).max(LIMITS.agents),
  laneClosed: z.array(z.boolean()).max(LIMITS.lanes),
  signals: z.array(SignalStateSchema).max(LIMITS.nodes),
  reservations: z.array(ReservationSchema).max(LIMITS.nodes),
  trips: z.array(TripRowSchema).max(LIMITS.tripRequests),
  sourceQueues: z.array(z.array(CounterSchema).max(LIMITS.agents)).max(LIMITS.lanes),
  dueCursor: CounterSchema,
  commands: z.array(AcceptedCommandSchema).max(LIMITS.commands),
  commandCursor: CounterSchema,
  nextCommandSeq: CounterSchema,
  eventSequence: CounterSchema,
  prngState: PrngStateSchema,
  metricFrames: z.array(MetricFrameSchema).max(700),
  totals: z.tuple([
    CounterSchema,
    CounterSchema,
    CounterSchema,
    CounterSchema,
    CounterSchema,
    CounterSchema,
    CounterSchema,
    CounterSchema,
  ]),
});
export const EngineEventSchema = z.strictObject({
  tick: TickSchema,
  seq: CounterSchema,
  type: z.enum([
    'TRIP_DUE',
    'TRIP_ADMITTED',
    'TRIP_ARRIVED',
    'SOURCE_BLOCKED',
    'SOURCE_UNBLOCKED',
    'ROUTE_CHANGED',
    'ROUTE_BLOCKED',
    'SIGNAL_CHANGED',
    'RESERVATION_GRANTED',
    'RESERVATION_RELEASED',
    'CLOSURE_APPLIED',
    'CLOSURE_DRAIN_EXCEPTION',
    'LANE_REOPENED',
    'SAFETY_DIAGNOSTIC',
  ]),
  entityId: EntityIdSchema,
  commandId: EntityIdSchema.nullable(),
  reason: ReasonSchema.nullable(),
  relatedIds: z.array(EntityIdSchema).max(16),
});
export const EngineCheckpointSchema = z.strictObject({
  schemaVersion: z.literal(ENGINE_CHECKPOINT_VERSION),
  inputHashes: InputHashesSchema,
  compatibility: RuntimeIdentitySchema,
  state: EngineStateSchema,
  metricRange: z.tuple([TickSchema, TickSchema]),
  metricHistoryHash: Sha256Schema,
  eventPrefixDigest: Sha256Schema,
  stateHash: Sha256Schema,
});
// Repeated metadata comes from metricDefinitions and the artifact runId. No readings are discarded.
export const MetricRowSchema = z.tuple([
  MetricIdSchema,
  MetricScopeSchema,
  TickSchema,
  TickSchema,
  CounterSchema,
  z.number().finite().nonnegative(),
  z.number().finite().nonnegative().nullable(),
  MetricSampleSchema.shape.statistic,
  MetricSampleSchema.shape.qualityFlags,
]);
export type MetricRow = z.input<typeof MetricRowSchema>;
export const EngineArtifactSchema = z.strictObject({
  schemaVersion: z.literal(ENGINE_ARTIFACT_VERSION),
  runId: RunIdSchema,
  compatibility: RuntimeIdentitySchema,
  inputHashes: InputHashesSchema,
  city: CityDefinitionSchema,
  scenario: ScenarioSchema,
  manifest: DemandManifestSchema,
  commands: z.array(AcceptedCommandSchema).max(LIMITS.commands),
  events: z.array(EngineEventSchema).max(LIMITS.events),
  metricLedger: z.array(MetricFrameSchema).max(9000),
  checkpoints: z.array(EngineCheckpointSchema).max(LIMITS.checkpoints),
  metricDefinitions: z.array(MetricDefinitionSchema).max(32),
  metrics: z.array(MetricRowSchema).max(100000),
  outcome: z.strictObject({
    finalTick: TickSchema,
    finalHash: Sha256Schema,
    eventDigest: Sha256Schema,
    status: z.enum(['PAUSED', 'COMPLETED', 'ERROR']),
    diagnostics: z.array(ReasonSchema).max(1000),
    evidenceComplete: z.boolean(),
  }),
});
export const EngineSnapshotSchema = z.strictObject({
  tick: TickSchema,
  simTimeMs: CounterSchema,
  // slot, location kind (parked/source/lane/connector), edge/gateway index, front mm, speed mm/s
  agents: z
    .array(
      z.tuple([CounterSchema, CounterSchema.max(3), CounterSchema, CounterSchema, CounterSchema]),
    )
    .max(LIMITS.agents),
  // slot, edge kind (lane=0/connector=1), edge index, start mm, end mm, effective tick
  traversals: z
    .array(
      z.tuple([
        CounterSchema,
        CounterSchema.max(1),
        CounterSchema,
        CounterSchema,
        CounterSchema,
        TickSchema,
      ]),
    )
    .max(LIMITS.agents * 4),
  signals: z
    .array(z.tuple([CounterSchema, CounterSchema.max(2), CounterSchema.max(3), CounterSchema]))
    .max(LIMITS.nodes),
  laneClosed: z.array(z.boolean()).max(LIMITS.lanes),
});
const envelope = {
  protocolVersion: z.literal(ENGINE_PROTOCOL_VERSION),
  runId: RunIdSchema,
  epoch: CounterSchema,
  requestId: RequestIdSchema,
};
export const EngineCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('INIT'),
    city: CityDefinitionSchema,
    scenario: ScenarioSchema,
    manifest: DemandManifestSchema,
    expectedHashes: InputHashesSchema,
    compatibility: RuntimeIdentitySchema,
  }),
  ...(['PLAY', 'PAUSE', 'STEP', 'RESET', 'EXPORT'] as const).map((type) =>
    z.strictObject({ ...envelope, type: z.literal(type) }),
  ),
  z.strictObject({ ...envelope, type: z.literal('SET_SPEED'), speed: PlaybackSpeedSchema }),
  z.strictObject({ ...envelope, type: z.literal('SUBMIT'), command: SubmittedCommandSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('IMPORT'),
    json: z.string().max(LIMITS.artifactBytes),
    compatibility: RuntimeIdentitySchema,
  }),
  z.strictObject({ ...envelope, type: z.literal('GET_DETAILS'), entityId: EntityIdSchema }),
]);
export const EngineObservationSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('READY'), snapshot: EngineSnapshotSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('CONTROL_ACK'),
    mode: z.enum(['PAUSED', 'RUNNING']),
    authoritativeTick: TickSchema,
    requestedSpeed: PlaybackSpeedSchema,
  }),
  z.strictObject({ ...envelope, type: z.literal('COMMAND_ACK'), command: AcceptedCommandSchema }),
  z.strictObject({ ...envelope, type: z.literal('COMMAND_REJECTED'), reason: ReasonSchema }),
  z.strictObject({ ...envelope, type: z.literal('SNAPSHOT'), snapshot: EngineSnapshotSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('METRICS'),
    samples: z.array(MetricSampleSchema).max(10000),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('EVENT_BATCH'),
    events: z.array(EngineEventSchema).max(10000),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('ARTIFACT'),
    json: z.string().max(LIMITS.artifactBytes),
  }),
  z.strictObject({ ...envelope, type: z.literal('RESTORED'), snapshot: EngineSnapshotSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('DETAILS'),
    asOfTick: TickSchema,
    entityId: EntityIdSchema,
    facts: z.array(ReasonSchema).max(32),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('STATUS'),
    authoritativeTick: TickSchema,
    achievedSpeed: z.number().finite().nonnegative(),
    lagTicks: CounterSchema,
    reason: ReasonSchema.nullable(),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('ERROR'),
    code: z.enum(['INVALID_INPUT', 'INCOMPATIBLE_RUNTIME', 'STALE_EPOCH', 'INTERNAL_ERROR']),
    reason: ReasonSchema,
  }),
]);
export type EngineState = z.input<typeof EngineStateSchema>;
export type EngineAgent = EngineState['agents'][number];
export type EngineEvent = z.input<typeof EngineEventSchema>;
export type MetricFrame = z.input<typeof MetricFrameSchema>;
export type EngineCheckpoint = z.input<typeof EngineCheckpointSchema>;
export type EngineArtifact = z.input<typeof EngineArtifactSchema>;
export type EngineCommand = z.input<typeof EngineCommandSchema>;
export type EngineObservation = z.input<typeof EngineObservationSchema>;
export type EngineSnapshot = z.input<typeof EngineSnapshotSchema>;
export type RuntimeIdentity = z.input<typeof RuntimeIdentitySchema>;
export type AcceptedCommandInput = z.input<typeof AcceptedCommandSchema>;
export type SubmittedCommandInput = z.input<typeof SubmittedCommandSchema>;
export type PhysicalFootprint = z.input<typeof FootprintSchema>;
