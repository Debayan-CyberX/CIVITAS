import fc from 'fast-check';
import { expect, it } from 'vitest';
import { TickSchema, WorkerCommandSchema, PROTOCOL_VERSION } from '@civitas/contracts';

it('preserves safe integer ticks through validation and JSON transport', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 10000000 }), (tick) => {
      const parsed = TickSchema.parse(JSON.parse(JSON.stringify(tick)) as unknown);
      expect(parsed).toBe(tick);
    }),
    { seed: 104729, numRuns: 100 },
  );
});
it('rejects negative epochs throughout the generated input range', () => {
  fc.assert(
    fc.property(fc.integer({ min: -10000000, max: -1 }), (epoch) => {
      expect(
        WorkerCommandSchema.safeParse({
          protocolVersion: PROTOCOL_VERSION,
          runId: 'R1',
          requestId: 'Q1',
          type: 'STEP',
          epoch,
        }).success,
      ).toBe(false);
    }),
    { seed: 130363, numRuns: 100 },
  );
});
