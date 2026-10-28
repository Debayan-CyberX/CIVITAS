import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  prepareAster,
  compileCity,
  verifyInputs,
  canonical,
  expandSeed,
  Random,
  randomStreams,
  Router,
  validateManifest,
} from '@civitas/simulation';
import { digest } from '../../scripts/runtime';

describe('B02 Aster and reproducible demand', () => {
  it('matches all nine reviewed input hash fixtures', async () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/aster-input-hashes.json', 'utf8')) as {
      rows: { fleet: number; seed: number; city: string; scenario: string; manifest: string }[];
    };
    for (const { fleet, seed, ...hashes } of fixture.rows)
      expect((await prepareAster(digest, fleet, seed)).hashes).toEqual(hashes);
  });
  it('validates the authored counts, exact district partition and every legal gateway pair', async () => {
    const input = await prepareAster(digest);
    const graph = compileCity(input.city);
    const router = new Router(graph);
    expect([
      graph.city.districts.length,
      graph.nodes.size,
      graph.segments.size,
      graph.lanes.size,
      graph.city.buildings.length,
    ]).toEqual([3, 12, 17, 34, 48]);
    for (const origin of graph.nodes.keys())
      for (const destination of graph.nodes.keys())
        if (origin !== destination) expect(router.route(origin, destination)).not.toBeNull();
    expect(graph.city.lanes.every((lane) => lane.lengthM === 156)).toBe(true);
    expect(graph.city.buildings.filter((b) => b.districtId === 'D0')).toHaveLength(16);
    for (const edge of graph.edges.values())
      expect(edge.districtCuts.reduce((sum, c) => sum + c.endMm - c.startMm, 0)).toBe(
        edge.lengthMm,
      );
    await verifyInputs(input, digest);
  });
  it('rejects bad foreign keys, duplicate identities, disconnections, geometry and setbacks', async () => {
    const { city } = await prepareAster(digest);
    const mutate = (edit: (c: typeof city) => void) => {
      const c = structuredClone(city);
      edit(c);
      return c;
    };
    expect(() =>
      compileCity(
        mutate((c) => {
          c.nodes.push(c.nodes[0]!);
        }),
      ),
    ).toThrow('Duplicate');
    expect(() =>
      compileCity(
        mutate((c) => {
          c.lanes[0]!.fromNodeId = 'unknown' as (typeof c.lanes)[0]['fromNodeId'];
        }),
      ),
    ).toThrow();
    expect(() =>
      compileCity(
        mutate((c) => {
          c.lanes[0]!.lengthM = 1 as (typeof c.lanes)[0]['lengthM'];
        }),
      ),
    ).toThrow('geometry');
    expect(() =>
      compileCity(
        mutate((c) => {
          c.buildings[0]!.footprint = c.segments[0]!.footprint;
        }),
      ),
    ).toThrow();
    expect(() =>
      compileCity(
        mutate((c) => {
          c.movements = [];
          c.intersections.forEach((i) => {
            i.movementIds = [];
          });
        }),
      ),
    ).toThrow('Disconnected');
  });
  it('matches independently calculated seed and generator vectors, including wrapping', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/prng-vectors.json', 'utf8')) as {
      vectors: { seed: number; initial: number[]; output: number[] }[];
    };
    for (const vector of fixture.vectors) {
      expect(expandSeed(vector.seed)).toEqual(vector.initial);
      const random = new Random(expandSeed(vector.seed));
      expect(vector.output.map(() => random.next())).toEqual(vector.output);
    }
    expect(() => new Random([0, 0, 0, 0])).toThrow();
    expect(() => new Random([1, 2, 3, 4]).integer(0)).toThrow();
  });
  it('separates jumped visual randomness from demand, and reproduces state restoration', () => {
    const streams = randomStreams(104729);
    const untouched = randomStreams(104729);
    for (let i = 0; i < 500; i++) streams.visual.next();
    expect(streams.demand.next()).toBe(untouched.demand.next());
    const saved = streams.demand.snapshot();
    const restored = new Random(saved);
    expect(restored.next()).toBe(streams.demand.next());
    expect(streams.visual.snapshot()).not.toEqual(streams.demand.snapshot());
  });
  it.each([100, 200, 300])(
    'generates a complete finite %i-agent cohort with fixed itineraries',
    async (fleet) => {
      const a = await prepareAster(digest, fleet);
      const b = await prepareAster(digest, fleet);
      expect(a.hashes).toEqual(b.hashes);
      expect(a.manifest.agents).toHaveLength(fleet);
      expect(a.manifest.requests).toHaveLength(fleet * 8);
      validateManifest(compileCity(a.city), a.scenario, a.manifest);
      for (const trip of a.manifest.requests)
        expect(trip.requestedDepartureTick).toBeLessThan(9000);
      expect(canonical(a.manifest)).toBe(canonical(b.manifest));
    },
  );
  it('changes the manifest across standard seeds and detects content/hash tampering', async () => {
    const hashes = [];
    for (const seed of [104729, 130363, 155921])
      hashes.push((await prepareAster(digest, 200, seed)).hashes.manifest);
    expect(new Set(hashes).size).toBe(3);
    const input = await prepareAster(digest);
    input.hashes.manifest = 'f'.repeat(64);
    await expect(verifyInputs(input, digest)).rejects.toThrow('hash');
  });
  it('matches the committed authored input files without silently regenerating them', async () => {
    const input = await prepareAster(digest);
    expect(JSON.parse(readFileSync('data/aster/city.v1.json', 'utf8'))).toEqual(input.city);
    expect(JSON.parse(readFileSync('data/aster/scenario.morning.v1.json', 'utf8'))).toEqual(
      input.scenario,
    );
  });
});
