import { z } from 'zod';
import { CityDefinitionSchema } from './city';
import { AcceptedCommandSchema } from './commands';
import { MetricDefinitionSchema, MetricSampleSchema } from './metrics';
import {
  CommandIdSchema,
  CounterSchema,
  EntityReferenceSchema,
  InputHashesSchema,
  ReasonSchema,
  RunIdSchema,
  Sha256Schema,
  TickSchema,
} from './primitives';
import { DemandManifestSchema, ScenarioSchema } from './scenario';
import { CheckpointSchema, RuntimeIdentitySchema } from './state';
import { ARTIFACT_SCHEMA_VERSION, LIMITS, SIMULATION_SPEC_VERSION } from './versions';

export const DerivedEventSchema = z.strictObject({
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
    'LANE_REOPENED',
    'SAFETY_DIAGNOSTIC',
  ]),
  entity: EntityReferenceSchema,
  commandId: CommandIdSchema.nullable(),
  reason: ReasonSchema.nullable(),
  relatedEntities: z.array(EntityReferenceSchema).max(16),
});
export const RunArtifactSchema = z.strictObject({
  schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
  specVersion: z.literal(SIMULATION_SPEC_VERSION),
  runId: RunIdSchema,
  parentRunId: RunIdSchema.nullable(),
  branchTick: TickSchema.nullable(),
  compatibility: RuntimeIdentitySchema,
  inputHashes: InputHashesSchema,
  city: CityDefinitionSchema,
  scenario: ScenarioSchema,
  manifest: DemandManifestSchema,
  commands: z.array(AcceptedCommandSchema).max(LIMITS.commands),
  events: z.array(DerivedEventSchema).max(LIMITS.events),
  checkpoints: z.array(CheckpointSchema).max(LIMITS.checkpoints),
  metricDefinitions: z.array(MetricDefinitionSchema).max(32),
  metrics: z.array(MetricSampleSchema).max(100000),
  outcome: z.strictObject({
    finalTick: TickSchema,
    finalHash: Sha256Schema,
    status: z.enum(['PAUSED', 'COMPLETED', 'ERROR']),
    diagnostics: z.array(ReasonSchema).max(1000),
    evidenceComplete: z.boolean(),
  }),
});
export type RunArtifact = z.infer<typeof RunArtifactSchema>;
