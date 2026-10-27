import { z } from 'zod';
import {
  ApproachSchema,
  BuildingIdSchema,
  CityIdSchema,
  DistrictIdSchema,
  EntityIdSchema,
  FiniteSchema,
  LabelSchema,
  LaneIdSchema,
  MetersSchema,
  MovementIdSchema,
  NodeIdSchema,
  PositiveCounterSchema,
  PositiveMetersSchema,
  SegmentIdSchema,
  Sha256Schema,
  SignalIdSchema,
  VersionLabelSchema,
} from './primitives';
import { CITY_SCHEMA_VERSION, LIMITS } from './versions';

export const PositionSchema = z.strictObject({
  eastM: MetersSchema,
  northM: MetersSchema,
  elevationM: MetersSchema,
});
export const PolylineSchema = z.array(PositionSchema).min(2).max(LIMITS.polylinePoints);
export const PolygonSchema = z.array(PositionSchema).min(3).max(LIMITS.polylinePoints);
export const BoundsSchema = z
  .strictObject({
    minEastM: MetersSchema,
    maxEastM: MetersSchema,
    minNorthM: MetersSchema,
    maxNorthM: MetersSchema,
  })
  .refine(
    (b) => b.minEastM < b.maxEastM && b.minNorthM < b.maxNorthM,
    'Bounds must have positive area',
  );
export const LandUseSchema = z.enum([
  'RESIDENTIAL',
  'MIXED',
  'CIVIC',
  'OFFICE',
  'WORKSHOP',
  'WAREHOUSE',
]);
export const RoadNodeSchema = z.strictObject({
  id: NodeIdSchema,
  position: PositionSchema,
  districtId: DistrictIdSchema,
  incomingLaneIds: z.array(LaneIdSchema).max(8),
  outgoingLaneIds: z.array(LaneIdSchema).max(8),
});
export const RoadSegmentSchema = z
  .strictObject({
    id: SegmentIdSchema,
    endpoints: z.tuple([NodeIdSchema, NodeIdSchema]),
    footprint: PolygonSchema,
    laneIds: z.array(LaneIdSchema).length(2),
  })
  .refine((s) => s.endpoints[0] !== s.endpoints[1], 'Segment endpoints must differ');
export const LaneSchema = z
  .strictObject({
    id: LaneIdSchema,
    segmentId: SegmentIdSchema,
    fromNodeId: NodeIdSchema,
    toNodeId: NodeIdSchema,
    centerline: PolylineSchema,
    lengthM: PositiveMetersSchema,
    widthM: PositiveMetersSchema,
    speedLimitMps: FiniteSchema.positive(),
  })
  .refine((lane) => lane.fromNodeId !== lane.toNodeId, 'Lane endpoints must differ');
export const MovementSchema = z
  .strictObject({
    id: MovementIdSchema,
    incomingLaneId: LaneIdSchema,
    outgoingLaneId: LaneIdSchema,
    nodeId: NodeIdSchema,
    centerline: PolylineSchema,
    lengthM: PositiveMetersSchema,
    speedLimitMps: FiniteSchema.positive(),
  })
  .refine((m) => m.incomingLaneId !== m.outgoingLaneId, 'Movement lanes must differ');
export const IntersectionSchema = z
  .strictObject({
    nodeId: NodeIdSchema,
    approaches: z.array(ApproachSchema).min(1).max(4),
    movementIds: z.array(MovementIdSchema).max(12),
    signalId: SignalIdSchema,
  })
  .refine((i) => new Set(i.approaches).size === i.approaches.length, 'Duplicate approach');
export const SignalPlanSchema = z.strictObject({
  id: SignalIdSchema,
  nodeId: NodeIdSchema,
  greenTicks: PositiveCounterSchema,
  amberTicks: PositiveCounterSchema,
  allRedTicks: PositiveCounterSchema,
  initialApproach: ApproachSchema,
  initialOffsetTicks: z.number().int().nonnegative(),
});
export const DistrictSchema = z.strictObject({
  id: DistrictIdSchema,
  name: LabelSchema,
  polygon: PolygonSchema,
  landUse: LandUseSchema,
  syntheticPopulationProfileId: EntityIdSchema.nullable(),
});
export const BuildingSchema = z.strictObject({
  id: BuildingIdSchema,
  districtId: DistrictIdSchema,
  footprint: PolygonSchema,
  elevationM: MetersSchema,
  floors: PositiveCounterSchema.max(200),
  floorHeightM: PositiveMetersSchema,
  use: LandUseSchema,
  gatewayNodeId: NodeIdSchema,
  energyProfileId: EntityIdSchema.nullable(),
});
export const CityDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(CITY_SCHEMA_VERSION),
  id: CityIdSchema,
  version: VersionLabelSchema,
  name: LabelSchema,
  topologyHash: Sha256Schema,
  frame: z.strictObject({
    id: EntityIdSchema,
    kind: z.literal('LOCAL_METRIC'),
    units: z.literal('meters'),
  }),
  bounds: BoundsSchema,
  nodes: z.array(RoadNodeSchema).min(2).max(LIMITS.nodes),
  segments: z.array(RoadSegmentSchema).min(1).max(LIMITS.segments),
  lanes: z.array(LaneSchema).min(2).max(LIMITS.lanes),
  movements: z.array(MovementSchema).max(LIMITS.movements),
  intersections: z.array(IntersectionSchema).min(1).max(LIMITS.nodes),
  signals: z.array(SignalPlanSchema).min(1).max(LIMITS.nodes),
  districts: z.array(DistrictSchema).min(1).max(LIMITS.districts),
  buildings: z.array(BuildingSchema).max(LIMITS.buildings),
});
export type CityDefinition = z.infer<typeof CityDefinitionSchema>;
export type Lane = z.infer<typeof LaneSchema>;
