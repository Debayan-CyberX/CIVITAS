import { z } from 'zod';
import {
  AgentIdSchema,
  CityIdSchema,
  CounterSchema,
  DistrictIdSchema,
  EntityIdSchema,
  FleetSizeSchema,
  LabelSchema,
  NodeIdSchema,
  PositiveCounterSchema,
  Sha256Schema,
  TickSchema,
  TripIdSchema,
  UInt32Schema,
  VersionLabelSchema,
} from './primitives';
import {
  FIXED_TIMESTEP_MS,
  LIMITS,
  MANIFEST_SCHEMA_VERSION,
  PRNG_VERSION,
  SCENARIO_SCHEMA_VERSION,
  SIMULATION_SPEC_VERSION,
} from './versions';

export const VehicleProfileSchema = z
  .strictObject({
    id: EntityIdSchema,
    lengthMm: PositiveCounterSchema,
    minimumGapMm: PositiveCounterSchema,
    desiredHeadwayMs: PositiveCounterSchema,
    accelerationMmPerSecondSquared: PositiveCounterSchema,
    comfortableBrakingMmPerSecondSquared: PositiveCounterSchema,
    emergencyBrakingMmPerSecondSquared: PositiveCounterSchema,
    exponent: z.literal(4),
  })
  .refine(
    (p) => p.emergencyBrakingMmPerSecondSquared >= p.comfortableBrakingMmPerSecondSquared,
    'Emergency braking must cover comfortable braking',
  );
const WeightSchema = CounterSchema.max(1000000);
export const DemandProfileSchema = z.strictObject({
  fleetSize: FleetSizeSchema,
  firstDepartureSpreadTicks: PositiveCounterSchema,
  itineraryIntervalTicks: PositiveCounterSchema,
  originWeights: z
    .array(z.strictObject({ districtId: DistrictIdSchema, weight: WeightSchema }))
    .min(1)
    .max(LIMITS.districts),
  destinationWeights: z
    .array(
      z.strictObject({
        originDistrictId: DistrictIdSchema,
        destinations: z
          .array(z.strictObject({ districtId: DistrictIdSchema, weight: WeightSchema }))
          .min(1)
          .max(LIMITS.districts),
      }),
    )
    .min(1)
    .max(LIMITS.districts),
});
export const ScenarioSchema = z
  .strictObject({
    schemaVersion: z.literal(SCENARIO_SCHEMA_VERSION),
    id: EntityIdSchema,
    version: VersionLabelSchema,
    name: LabelSchema,
    cityId: CityIdSchema,
    cityVersion: VersionLabelSchema,
    cityHash: Sha256Schema,
    specVersion: z.literal(SIMULATION_SPEC_VERSION),
    engineVersion: VersionLabelSchema,
    tickDurationMs: z.literal(FIXED_TIMESTEP_MS),
    seed: UInt32Schema,
    prngVersion: z.literal(PRNG_VERSION),
    horizonTicks: PositiveCounterSchema.max(9000),
    warmupTicks: TickSchema,
    demand: DemandProfileSchema,
    vehicleProfiles: z.array(VehicleProfileSchema).min(1).max(8),
  })
  .refine((s) => s.warmupTicks < s.horizonTicks, 'Warm-up must be shorter than the horizon');
export const TripRequestSchema = z
  .strictObject({
    id: TripIdSchema,
    agentId: AgentIdSchema,
    requestedDepartureTick: TickSchema,
    originGatewayId: NodeIdSchema,
    destinationGatewayId: NodeIdSchema,
    baseFreeFlowTicks: PositiveCounterSchema,
  })
  .refine((t) => t.originGatewayId !== t.destinationGatewayId, 'Trip gateways must differ');
export const ManifestAgentSchema = z.strictObject({
  id: AgentIdSchema,
  initialGatewayId: NodeIdSchema,
  profileId: EntityIdSchema,
  itineraryTripIds: z.array(TripIdSchema).max(100),
});
export const DemandManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    cityHash: Sha256Schema,
    scenarioHash: Sha256Schema,
    seed: UInt32Schema,
    prngVersion: z.literal(PRNG_VERSION),
    fleetSize: FleetSizeSchema,
    agents: z.array(ManifestAgentSchema).max(LIMITS.agents),
    requests: z.array(TripRequestSchema).max(LIMITS.tripRequests),
  })
  .refine((m) => m.agents.length === m.fleetSize, 'Agent count must match fleet size');
export type Scenario = z.infer<typeof ScenarioSchema>;
export type DemandManifest = z.infer<typeof DemandManifestSchema>;
export type TripRequest = z.infer<typeof TripRequestSchema>;
