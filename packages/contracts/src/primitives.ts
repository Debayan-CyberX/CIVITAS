import { z } from 'zod';

const identifier = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:>/-]*$/)
  .refine((value) => !value.includes('://'), 'Identifiers cannot be external URLs');
export const EntityIdSchema = identifier.brand<'EntityId'>();
export const CityIdSchema = identifier.brand<'CityId'>();
export const NodeIdSchema = identifier.brand<'NodeId'>();
export const SegmentIdSchema = identifier.brand<'SegmentId'>();
export const LaneIdSchema = identifier.brand<'LaneId'>();
export const MovementIdSchema = identifier.brand<'MovementId'>();
export const DistrictIdSchema = identifier.brand<'DistrictId'>();
export const BuildingIdSchema = identifier.brand<'BuildingId'>();
export const SignalIdSchema = identifier.brand<'SignalId'>();
export const AgentIdSchema = identifier.brand<'AgentId'>();
export const TripIdSchema = identifier.brand<'TripId'>();
export const RunIdSchema = identifier.brand<'RunId'>();
export const CommandIdSchema = identifier.brand<'CommandId'>();
export const RequestIdSchema = identifier.brand<'RequestId'>();
export const ReservationIdSchema = identifier.brand<'ReservationId'>();

export const CounterSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const PositiveCounterSchema = CounterSchema.min(1);
export const TickSchema = CounterSchema.brand<'Tick'>();
export const PositiveTickSchema = PositiveCounterSchema.brand<'Tick'>();
export const UInt32Schema = CounterSchema.max(0xffffffff);
export const FiniteSchema = z.number().finite();
export const MetersSchema = FiniteSchema.brand<'Meters'>();
export const PositiveMetersSchema = FiniteSchema.positive().brand<'Meters'>();
export const MillimetersSchema = CounterSchema.brand<'Millimeters'>();
export const SpeedSchema = CounterSchema.brand<'MillimetersPerSecond'>();
export const AccelerationSchema = z.number().int().safe().brand<'MillimetersPerSecondSquared'>();
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const BuildShaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const VersionLabelSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[A-Za-z0-9_.:/+-]+$/);
export const LabelSchema = z.string().min(1).max(160);
export const ReasonSchema = z.string().min(1).max(512);
export const FleetSizeSchema = z.union([z.literal(100), z.literal(200), z.literal(300)]);
export const PlaybackSpeedSchema = z.union([
  z.literal(0.25),
  z.literal(1),
  z.literal(2),
  z.literal(4),
]);
export const ApproachSchema = z.enum(['N', 'E', 'S', 'W']);
export const EntryModeSchema = z.enum(['OPEN', 'CLOSED_TO_ENTRY']);
export const SignalPhaseSchema = z.enum(['GREEN', 'AMBER', 'ALL_RED']);
export const PrngStateSchema = z
  .tuple([UInt32Schema, UInt32Schema, UInt32Schema, UInt32Schema])
  .refine((words) => words.some((word) => word !== 0), 'PRNG state cannot be all zero');

export const InputHashesSchema = z.strictObject({
  city: Sha256Schema,
  scenario: Sha256Schema,
  manifest: Sha256Schema,
});
export const EdgeReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('LANE'), id: LaneIdSchema }),
  z.strictObject({ kind: z.literal('MOVEMENT'), id: MovementIdSchema }),
]);
export const EntityReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('LANE'), id: LaneIdSchema }),
  z.strictObject({ kind: z.literal('SEGMENT'), id: SegmentIdSchema }),
  z.strictObject({ kind: z.literal('INTERSECTION'), id: NodeIdSchema }),
  z.strictObject({ kind: z.literal('DISTRICT'), id: DistrictIdSchema }),
  z.strictObject({ kind: z.literal('BUILDING'), id: BuildingIdSchema }),
  z.strictObject({ kind: z.literal('AGENT'), id: AgentIdSchema }),
  z.strictObject({ kind: z.literal('TRIP'), id: TripIdSchema }),
]);

export type CityId = z.infer<typeof CityIdSchema>;
export type EntityId = z.infer<typeof EntityIdSchema>;
export type NodeId = z.infer<typeof NodeIdSchema>;
export type SegmentId = z.infer<typeof SegmentIdSchema>;
export type LaneId = z.infer<typeof LaneIdSchema>;
export type MovementId = z.infer<typeof MovementIdSchema>;
export type DistrictId = z.infer<typeof DistrictIdSchema>;
export type BuildingId = z.infer<typeof BuildingIdSchema>;
export type SignalId = z.infer<typeof SignalIdSchema>;
export type AgentId = z.infer<typeof AgentIdSchema>;
export type TripId = z.infer<typeof TripIdSchema>;
export type RunId = z.infer<typeof RunIdSchema>;
export type CommandId = z.infer<typeof CommandIdSchema>;
export type RequestId = z.infer<typeof RequestIdSchema>;
export type ReservationId = z.infer<typeof ReservationIdSchema>;
export type Tick = z.infer<typeof TickSchema>;
export type Meters = z.infer<typeof MetersSchema>;
export type Millimeters = z.infer<typeof MillimetersSchema>;
export type MillimetersPerSecond = z.infer<typeof SpeedSchema>;
export type MillimetersPerSecondSquared = z.infer<typeof AccelerationSchema>;
export type DeepReadonly<T> = T extends string | number | boolean | null | undefined
  ? T
  : { readonly [Key in keyof T]: DeepReadonly<T[Key]> };
