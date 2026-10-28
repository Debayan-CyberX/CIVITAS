import { beforeAll, describe, expect, it } from 'vitest';
import { CityDefinitionSchema } from '@civitas/contracts';
import type { EngineEvent, EngineSnapshot } from '@civitas/contracts';
import { prepareAster } from '@civitas/simulation';
import { digest } from '../../scripts/runtime';
import {
  bounds,
  entityPosition,
  pathPoint,
  presentationModel,
  screen,
  world,
} from '../../apps/web/src/scene/model';
import type { Model } from '../../apps/web/src/scene/model';
import { interpolateVehicle, PresentationBuffer } from '../../apps/web/src/scene/presentation';

let model: Model;
beforeAll(async () => {
  model = presentationModel((await prepareAster(digest, 100)).city);
});
const snapshot = (tick: number, agents: EngineSnapshot['agents'] = []): EngineSnapshot => ({
  tick,
  simTimeMs: tick * 100,
  agents,
  traversals: [],
  signals: [[0, 2, 0, 1]],
  laneClosed: Array<boolean>(34).fill(false),
});
const event = (
  type: EngineEvent['type'],
  tick: number,
  entityId: string,
  relatedIds: string[] = [],
): EngineEvent => ({ type, tick, entityId, relatedIds, seq: tick, commandId: null, reason: null });

describe('independent presentation geometry', () => {
  it('maps east/up/north to world and north-up SVG coordinates', () => {
    const p = { eastM: 180, northM: 360, elevationM: 9 };
    expect(world(p)).toEqual([180, 9, -360]);
    expect(screen(p)).toEqual([180, 90]);
    expect(entityPosition(model, 'J21')).toMatchObject({ eastM: 360, northM: 180 });
    expect(model.lanes.map((l) => l.id)).toEqual([...model.lanes.map((l) => l.id)].sort());
    expect(model.city.buildings).toHaveLength(48);
  });
  it('samples an authored right angle by arc distance without a diagonal chord', () => {
    const points = [
      { eastM: 0, northM: 0, elevationM: 0 },
      { eastM: 10, northM: 0, elevationM: 0 },
      { eastM: 10, northM: 10, elevationM: 0 },
    ];
    expect(pathPoint(points, 10000)).toMatchObject({ eastM: 10, northM: 0 });
    expect(pathPoint(points, 15000)).toMatchObject({ eastM: 10, northM: 5, heading: 0 });
    expect(pathPoint(points, -10)).toMatchObject({ eastM: 0, northM: 0 });
    expect(pathPoint(points, 50000)).toMatchObject({ eastM: 10, northM: 10 });
    const city = CityDefinitionSchema.parse({
      ...model.city,
      movements: [{ ...model.movements[0], centerline: points, lengthM: 20 }],
    });
    const corner = presentationModel(city);
    const a = snapshot(10, [[0, 3, 0, 8000, 5000]]),
      b = snapshot(12, [[0, 3, 0, 12000, 5000]]);
    const mid = interpolateVehicle(corner, a.agents[0]!, b.agents[0]!, a, b, 11, []);
    expect(mid?.eastM).toBeCloseTo(10, 2);
    expect(mid?.northM).toBeCloseTo(0, 2);
  });
  it('keeps every building footprint outside the rendered lane centerlines', () => {
    for (const building of model.city.buildings) {
      const b = bounds(building.footprint);
      for (const lane of model.lanes)
        for (const p of lane.centerline)
          expect(
            p.eastM > b.x0 &&
              p.eastM < b.x0 + b.width &&
              p.northM > b.n0 &&
              p.northM < b.n0 + b.depth,
          ).toBe(false);
    }
  });
});

describe('authoritative snapshot timeline', () => {
  it('shows a new trip at its admission even when the previous trip arrived in the same publication interval', () => {
    const a = snapshot(10, [[0, 2, 0, 155500, 1000]]),
      b = snapshot(14, [[0, 2, 1, 4700, 1000]]);
    const events = [
      event('TRIP_ARRIVED', 11, 'T:V000:0', ['V000']),
      event('TRIP_ADMITTED', 12, 'T:V000:1', ['V000', model.lanes[1]!.id]),
    ];
    expect(interpolateVehicle(model, a.agents[0]!, b.agents[0]!, a, b, 11.5, events)).toBeNull();
    expect(interpolateVehicle(model, a.agents[0]!, b.agents[0]!, a, b, 12, events)).toMatchObject(
      pathPoint(model.lanes[1]!.centerline, 4500),
    );
    expect(interpolateVehicle(model, a.agents[0]!, b.agents[0]!, a, b, 13, events)).toMatchObject(
      pathPoint(model.lanes[1]!.centerline, 4600),
    );
  });
  it('uses boundary traversal distances across lane and connector, within one centimetre', () => {
    const laneIndex = 0,
      lane = model.lanes[laneIndex]!;
    const movementIndex = model.movements.findIndex((m) => m.incomingLaneId === lane.id),
      movement = model.movements[movementIndex]!;
    const a = snapshot(10, [[0, 2, laneIndex, 155000, 5000]]),
      b = snapshot(12, [[0, 3, movementIndex, 1000, 5000]]);
    b.traversals = [
      [0, 0, laneIndex, 155000, 156000, 12],
      [0, 1, movementIndex, 0, 1000, 12],
    ];
    // At t11 the crossing tick has not begun; at t11.5 the front is at the shared endpoint.
    const middle = interpolateVehicle(model, a.agents[0]!, b.agents[0]!, a, b, 11.5, []);
    expect(middle?.eastM).toBeCloseTo(movement.centerline[0]!.eastM, 2);
    expect(middle?.northM).toBeCloseTo(movement.centerline[0]!.northM, 2);
    const after = interpolateVehicle(model, a.agents[0]!, b.agents[0]!, a, b, 11.75, []);
    const expected = pathPoint(movement.centerline, 500);
    expect(after?.eastM).toBeCloseTo(expected.eastM, 2);
    expect(after?.northM).toBeCloseTo(expected.northM, 2);
  });
  it('does not reveal an admission early or retain an arrived vehicle past its event boundary', () => {
    const a = snapshot(0, [[0, 1, 0, 0, 0]]),
      b = snapshot(2, [[0, 2, 0, 4500, 0]]);
    const events = [event('TRIP_ADMITTED', 2, 'T:V000:0', ['V000', model.lanes[0]!.id])];
    expect(interpolateVehicle(model, a.agents[0]!, b.agents[0]!, a, b, 1.99, events)).toBeNull();
    expect(interpolateVehicle(model, a.agents[0]!, b.agents[0]!, a, b, 2, events)).not.toBeNull();
    const c = snapshot(4, [[0, 0, 0, 0, 0]]),
      arrival = [event('TRIP_ARRIVED', 3, 'T:V000:0', ['V000'])];
    expect(
      interpolateVehicle(model, b.agents[0]!, c.agents[0]!, b, c, 2.5, arrival),
    ).not.toBeNull();
    expect(interpolateVehicle(model, b.agents[0]!, c.agents[0]!, b, c, 3, arrival)).toBeNull();
  });
  it('bounds snapshots, rejects reordering, freezes starvation, and pauses on the exact endpoint', () => {
    const buffer = new PresentationBuffer();
    for (let tick = 0; tick <= 8; tick += 2)
      buffer.push(snapshot(tick, [[0, 2, 0, tick * 1000, 1000]]), tick * 100);
    buffer.push(snapshot(0), 900);
    expect(buffer.snapshots).toHaveLength(3);
    expect(buffer.snapshots.at(-1)?.tick).toBe(8);
    buffer.running = true;
    expect(buffer.sample(model, 5000)?.stale).toBe(true);
    expect(buffer.sample(model, 5000)?.vehicles).toEqual(buffer.sample(model, 10000)?.vehicles);
    expect(buffer.sample(model, 5000)?.tick).toBe(8);
    buffer.running = false;
    expect(buffer.sample(model, 801)?.tick).toBe(8);
    expect(buffer.sample(model, 801)?.vehicles[0]).toMatchObject(
      pathPoint(model.lanes[0]!.centerline, 8000),
    );
  });
  it('applies closure and signal changes at their recorded tick, without blending', () => {
    const buffer = new PresentationBuffer();
    buffer.push(snapshot(10), 0);
    buffer.push(snapshot(12), 200);
    buffer.running = true;
    const lane = model.lanes[0]!;
    buffer.addEvents([
      event('CLOSURE_APPLIED', 11, lane.id),
      { ...event('SIGNAL_CHANGED', 11, model.city.signals[0]!.id), reason: 'E:GREEN' },
    ]);
    expect(buffer.sample(model, 299)?.laneClosed[0]).toBe(false);
    expect(buffer.sample(model, 300)?.laneClosed[0]).toBe(true);
    expect(buffer.sample(model, 300)?.signals[0]?.slice(1, 3)).toEqual([0, 1]);
    buffer.reset();
    expect(buffer.snapshots).toHaveLength(0);
    expect(buffer.events).toHaveLength(0);
  });
});
