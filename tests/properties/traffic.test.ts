import fc from 'fast-check';
import { it, expect } from 'vitest';
import { prepareAster, Simulation } from '@civitas/simulation';
import { digest } from '../../scripts/runtime';
import { smallCity } from '../fixtures/small-city';
it('preserves fleet, requests and physical safety over 100 generated 1000-tick intervention sequences', async () => {
  const inputs = await prepareAster(digest, 100);
  fc.assert(
    fc.property(
      fc.array(
        fc.tuple(fc.integer({ min: 1, max: 990 }), fc.integer({ min: 0, max: 33 }), fc.boolean()),
        { minLength: 1, maxLength: 8 },
      ),
      (commands) => {
        const e = new Simulation(inputs);
        commands.forEach(([tick, lane, closed], i) =>
          e.accept({
            commandId: `P${i}`,
            desiredTick: tick,
            intervention: {
              type: closed ? 'CLOSE_LANES' : 'OPEN_LANES',
              laneIds: [e.graph.laneList[lane]!.id],
              expectedTopologyVersion: 0,
            },
          }),
        );
        for (let i = 0; i < 1000; i++) e.step();
        expect(e.stats().fleet).toBe(100);
        e.assertInvariants();
      },
    ),
    { seed: 155921, numRuns: 100 },
  );
}, 120000);

it('preserves safety and conservation on 100 generated small connected graphs for 1000 ticks', async () => {
  const base = await prepareAster(digest, 100);
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(0 as const, 1 as const),
      fc.array(fc.nat(50), { maxLength: 5 }),
      fc.array(fc.tuple(fc.integer({ min: 1, max: 990 }), fc.nat(50)), { maxLength: 4 }),
      async (west, restrictions, commands) => {
        const inputs = await smallCity(base, west, restrictions);
        const e = new Simulation(inputs);
        commands.forEach(([tick, lane], i) =>
          e.accept({
            commandId: `G${i}`,
            desiredTick: tick,
            intervention: {
              type: 'CLOSE_LANES',
              laneIds: [e.graph.laneList[lane % e.graph.laneList.length]!.id],
              expectedTopologyVersion: 0,
            },
          }),
        );
        for (let i = 0; i < 1000; i++) e.step();
        expect(e.stats().fleet).toBe(100);
        e.assertInvariants();
      },
    ),
    { seed: 130363, numRuns: 100 },
  );
}, 120000);
