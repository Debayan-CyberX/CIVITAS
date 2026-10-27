import { LaneIdSchema, MetersSchema } from '@civitas/contracts';
import type { AgentId, Millimeters, Snapshot, Tick } from '@civitas/contracts';

// These assertions are compiled in the ES-only environment, never executed.
// @ts-expect-error Tick values require validation, not a bare number.
export const invalidTick: Tick = 1;
// @ts-expect-error Meter and millimeter brands must not mix.
export const invalidDistance: Millimeters = MetersSchema.parse(1);
// @ts-expect-error Agent and lane IDs must not mix.
export const invalidAgent: AgentId = LaneIdSchema.parse('L:A>B');
// @ts-expect-error The pure package environment must not expose the DOM.
export const forbiddenDocument: unknown = document;
// @ts-expect-error The pure package environment must not expose Worker globals.
export const forbiddenWorker: unknown = Worker;
// @ts-expect-error The pure package environment must not expose Node globals.
export const forbiddenProcess: unknown = process;

export function readonlySnapshotAssertion(snapshot: Snapshot) {
  // @ts-expect-error Presentation cannot mutate a snapshot's nested collection.
  snapshot.agents.length = 0;
}
