import { z } from 'zod';
import type { DeepReadonly } from './primitives';
import { DerivedEventSchema, RunArtifactSchema } from './artifact';
import { CityDefinitionSchema } from './city';
import { AcceptedCommandSchema, SubmittedCommandSchema } from './commands';
import { MetricSampleSchema } from './metrics';
import {
  AgentIdSchema,
  CounterSchema,
  EdgeReferenceSchema,
  EntityReferenceSchema,
  EntryModeSchema,
  InputHashesSchema,
  LaneIdSchema,
  MillimetersSchema,
  PlaybackSpeedSchema,
  ReasonSchema,
  RequestIdSchema,
  RunIdSchema,
  SpeedSchema,
  TickSchema,
} from './primitives';
import { DemandManifestSchema, ScenarioSchema } from './scenario';
import {
  AgentLocationSchema,
  RunStateSchema,
  RuntimeIdentitySchema,
  SignalStateSchema,
} from './state';
import { FIXED_TIMESTEP_MS, LIMITS, PROTOCOL_VERSION, SIMULATION_SPEC_VERSION } from './versions';

const envelope = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  runId: RunIdSchema,
  epoch: CounterSchema,
  requestId: RequestIdSchema,
};
export const WorkerCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('INIT'),
    city: CityDefinitionSchema,
    scenario: ScenarioSchema,
    manifest: DemandManifestSchema,
    expectedHashes: InputHashesSchema,
  }),
  ...(['PLAY', 'PAUSE', 'STEP', 'RESET', 'EXPORT'] as const).map((type) =>
    z.strictObject({ ...envelope, type: z.literal(type) }),
  ),
  z.strictObject({ ...envelope, type: z.literal('SET_SPEED'), speed: PlaybackSpeedSchema }),
  z.strictObject({ ...envelope, type: z.literal('SUBMIT'), command: SubmittedCommandSchema }),
  z.strictObject({ ...envelope, type: z.literal('IMPORT'), artifact: RunArtifactSchema }),
  // Reserved for Stage 03; B01 implements no command handler or seek behavior.
  z.strictObject({ ...envelope, type: z.literal('SEEK'), targetTick: TickSchema }),
  z.strictObject({ ...envelope, type: z.literal('GET_DETAILS'), entity: EntityReferenceSchema }),
]);
export const SnapshotSchema = z
  .strictObject({
    tick: TickSchema,
    simTimeMs: CounterSchema,
    agents: z
      .array(
        z.strictObject({
          id: AgentIdSchema,
          location: AgentLocationSchema,
          speedMmPerSecond: SpeedSchema,
        }),
      )
      .max(LIMITS.agents),
    traversals: z
      .array(
        z.strictObject({
          agentId: AgentIdSchema,
          edges: z
            .array(
              z.strictObject({
                edge: EdgeReferenceSchema,
                startMm: MillimetersSchema,
                endMm: MillimetersSchema,
              }),
            )
            .max(4),
          admittedTick: TickSchema.nullable(),
          arrivalTick: TickSchema.nullable(),
        }),
      )
      .max(LIMITS.agents),
    signals: z.array(SignalStateSchema).max(LIMITS.nodes),
    lanes: z.array(z.strictObject({ id: LaneIdSchema, mode: EntryModeSchema })).max(LIMITS.lanes),
  })
  .refine((s) => s.simTimeMs === s.tick * FIXED_TIMESTEP_MS, 'Snapshot time must match fixed tick')
  .readonly();
export const WorkerObservationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('READY'),
    compatibility: RuntimeIdentitySchema,
    state: RunStateSchema,
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('CONTROL_ACK'),
    mode: z.enum(['PAUSED', 'RUNNING']),
    authoritativeTick: TickSchema,
    requestedSpeed: PlaybackSpeedSchema,
  }),
  z.strictObject({ ...envelope, type: z.literal('COMMAND_ACK'), command: AcceptedCommandSchema }),
  z.strictObject({ ...envelope, type: z.literal('COMMAND_REJECTED'), reason: ReasonSchema }),
  z.strictObject({ ...envelope, type: z.literal('SNAPSHOT'), snapshot: SnapshotSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('METRICS'),
    samples: z.array(MetricSampleSchema).max(10000),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('EVENT_BATCH'),
    events: z.array(DerivedEventSchema).max(10000),
  }),
  z.strictObject({ ...envelope, type: z.literal('ARTIFACT'), artifact: RunArtifactSchema }),
  z.strictObject({ ...envelope, type: z.literal('RESTORED'), authoritativeTick: TickSchema }),
  z.strictObject({
    ...envelope,
    type: z.literal('DETAILS'),
    asOfTick: TickSchema,
    entity: EntityReferenceSchema,
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
    code: z.enum(['INVALID_INPUT', 'UNSUPPORTED_VERSION', 'INTERNAL_ERROR']),
    reason: ReasonSchema,
  }),
]);

// A build/transport diagnostic, separate from the run protocol: no run is allocated.
export const FoundationProbeSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal('FOUNDATION_PROBE'),
  requestId: RequestIdSchema,
});
export const FoundationReplySchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal('FOUNDATION_READY'),
  requestId: RequestIdSchema,
  specVersion: z.literal(SIMULATION_SPEC_VERSION),
  tickDurationMs: z.literal(FIXED_TIMESTEP_MS),
  implementation: z.literal('contracts-only'),
});
export type WorkerCommand = z.infer<typeof WorkerCommandSchema>;
export type WorkerObservation = z.infer<typeof WorkerObservationSchema>;
export type Snapshot = DeepReadonly<z.infer<typeof SnapshotSchema>>;
export type FoundationReply = z.infer<typeof FoundationReplySchema>;
