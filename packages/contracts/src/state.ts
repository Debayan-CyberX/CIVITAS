import { z } from 'zod';
import { AcceptedCommandSchema } from './commands';
import { MetricIdSchema, MetricScopeSchema } from './metrics';
import {
  AccelerationSchema,
  AgentIdSchema,
  ApproachSchema,
  CounterSchema,
  EdgeReferenceSchema,
  EntryModeSchema,
  InputHashesSchema,
  LaneIdSchema,
  MillimetersSchema,
  MovementIdSchema,
  NodeIdSchema,
  PrngStateSchema,
  ReservationIdSchema,
  Sha256Schema,
  SignalIdSchema,
  SignalPhaseSchema,
  SpeedSchema,
  TickSchema,
  TripIdSchema,
  BuildShaSchema,
  VersionLabelSchema,
} from './primitives';
import { CHECKPOINT_SCHEMA_VERSION, LIMITS, NUMERIC_CONTRACT_VERSION } from './versions';

export const RuntimeIdentitySchema = z.strictObject({
  engineVersion: VersionLabelSchema,
  engineBuildSha: BuildShaSchema,
  runtimeEngine: z.enum(['V8', 'SPIDERMONKEY', 'JAVASCRIPTCORE']),
  runtimeVersion: VersionLabelSchema,
  platform: VersionLabelSchema,
  numericContractVersion: z.literal(NUMERIC_CONTRACT_VERSION),
});
export const AgentLocationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('PARKED'), gatewayId: NodeIdSchema }),
  z.strictObject({ kind: z.literal('SOURCE_QUEUED'), gatewayId: NodeIdSchema }),
  z.strictObject({ kind: z.literal('ON_LANE'), laneId: LaneIdSchema, frontMm: MillimetersSchema }),
  z.strictObject({
    kind: z.literal('ON_CONNECTOR'),
    movementId: MovementIdSchema,
    frontMm: MillimetersSchema,
  }),
]);
export const RouteSchema = z.strictObject({
  edges: z.array(EdgeReferenceSchema).min(1).max(512),
  freeFlowTicks: CounterSchema,
  topologyVersion: CounterSchema,
});
export const AgentStateSchema = z.strictObject({
  id: AgentIdSchema,
  slot: CounterSchema.max(LIMITS.agents - 1),
  location: AgentLocationSchema,
  speedMmPerSecond: SpeedSchema,
  accelerationMmPerSecondSquared: AccelerationSchema,
  activeTripId: TripIdSchema.nullable(),
  itineraryCursor: CounterSchema,
  route: RouteSchema.nullable(),
  routeCursor: CounterSchema,
  reservationId: ReservationIdSchema.nullable(),
  lowSpeedTicks: CounterSchema,
  firstEligibleTick: TickSchema.nullable(),
});
export const SignalStateSchema = z.strictObject({
  id: SignalIdSchema,
  approach: ApproachSchema,
  phase: SignalPhaseSchema,
  remainingTicks: CounterSchema,
  cycleCount: CounterSchema,
});
export const FootprintSchema = z
  .strictObject({
    agentId: AgentIdSchema,
    edge: EdgeReferenceSchema,
    rearMm: MillimetersSchema,
    frontMm: MillimetersSchema,
  })
  .refine((f) => f.rearMm <= f.frontMm, 'Footprint endpoints out of order');
export const ReservationSchema = z.strictObject({
  id: ReservationIdSchema,
  nodeId: NodeIdSchema,
  agentId: AgentIdSchema,
  movementId: MovementIdSchema,
  outgoingLaneId: LaneIdSchema,
  committedTick: TickSchema,
  heldEntranceMm: MillimetersSchema,
});
export const TripStateSchema = z.strictObject({
  id: TripIdSchema,
  status: z.enum(['FUTURE', 'WAITING_FOR_AGENT', 'SOURCE_QUEUED', 'IN_NETWORK', 'COMPLETED']),
  blockedReason: z.enum(['NO_ROUTE', 'SOURCE_FULL', 'AGENT_BUSY']).nullable(),
  admissionTick: TickSchema.nullable(),
  arrivalTick: TickSchema.nullable(),
});
export const MetricContributionSchema = z.strictObject({
  tick: TickSchema,
  distanceMm: CounterSchema,
  vehicleTimeMicroseconds: CounterSchema,
  arrivals: CounterSchema,
  detectorCrossings: CounterSchema,
  eligibleLaneTicks: CounterSchema,
  congestedLaneTicks: CounterSchema,
});
export const RunStateSchema = z.strictObject({
  tick: TickSchema,
  topologyVersion: CounterSchema,
  agents: z.array(AgentStateSchema).max(LIMITS.agents),
  laneModes: z
    .array(z.strictObject({ laneId: LaneIdSchema, mode: EntryModeSchema }))
    .max(LIMITS.lanes),
  footprints: z.array(FootprintSchema).max(LIMITS.agents * 3),
  signals: z.array(SignalStateSchema).max(LIMITS.nodes),
  reservations: z.array(ReservationSchema).max(LIMITS.nodes),
  trips: z.array(TripStateSchema).max(LIMITS.tripRequests),
  sourceQueues: z
    .array(
      z.strictObject({
        laneId: LaneIdSchema,
        tripIds: z.array(TripIdSchema).max(LIMITS.tripRequests),
      }),
    )
    .max(LIMITS.lanes),
  blockedRetries: z
    .array(z.strictObject({ tripId: TripIdSchema, nextRetryTick: TickSchema }))
    .max(LIMITS.tripRequests),
  pendingCommands: z.array(AcceptedCommandSchema).max(LIMITS.commands),
  prngState: PrngStateSchema,
  metricAccumulators: z
    .array(
      z.strictObject({
        metricId: MetricIdSchema,
        scope: MetricScopeSchema,
        totalDistanceMm: CounterSchema,
        totalVehicleTimeMicroseconds: CounterSchema,
        ring: z.array(MetricContributionSchema).max(600),
      }),
    )
    .max(LIMITS.lanes * 16),
  eventSequence: CounterSchema,
  eventPrefixDigest: Sha256Schema,
  acceptedCommandCursor: CounterSchema,
});
export const CheckpointSchema = z.strictObject({
  schemaVersion: z.literal(CHECKPOINT_SCHEMA_VERSION),
  inputHashes: InputHashesSchema,
  compatibility: RuntimeIdentitySchema,
  state: RunStateSchema,
  stateHash: Sha256Schema,
});
export type AgentState = z.infer<typeof AgentStateSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
