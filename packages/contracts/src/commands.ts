import { z } from 'zod';
import {
  CommandIdSchema,
  CounterSchema,
  LaneIdSchema,
  PositiveTickSchema,
  TickSchema,
} from './primitives';

// One command represents either a directed closure or an atomic two-direction intervention.
export const InterventionSchema = z
  .strictObject({
    type: z.enum(['CLOSE_LANES', 'OPEN_LANES']),
    laneIds: z.array(LaneIdSchema).min(1).max(2),
    expectedTopologyVersion: CounterSchema,
  })
  .refine((i) => new Set(i.laneIds).size === i.laneIds.length, 'Duplicate lane target');
export const SubmittedCommandSchema = z.strictObject({
  commandId: CommandIdSchema,
  desiredTick: PositiveTickSchema.optional(),
  intervention: InterventionSchema,
});
export const AcceptedCommandSchema = z
  .strictObject({
    commandId: CommandIdSchema,
    acceptedTick: PositiveTickSchema,
    seq: CounterSchema,
    acceptedAtTick: TickSchema,
    intervention: InterventionSchema,
  })
  .refine((c) => c.acceptedTick > c.acceptedAtTick, 'Command must execute after acceptance state');
export type Intervention = z.infer<typeof InterventionSchema>;
export type AcceptedCommand = z.infer<typeof AcceptedCommandSchema>;
