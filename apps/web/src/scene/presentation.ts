import type { DeepReadonly, EngineEvent, EngineSnapshot } from '@civitas/contracts';
import { pathPoint, vehicleId } from './model';
import type { Model } from './model';

type Snapshot = DeepReadonly<EngineSnapshot>;
type Row = Snapshot['agents'][number];
export interface Pose {
  slot: number;
  id: string;
  eastM: number;
  northM: number;
  elevationM: number;
  heading: number;
  speed: number;
}
export function pose(model: Model, row: Row): Pose | null {
  if (row[1] < 2) return null;
  const edge = (row[1] === 2 ? model.lanes : model.movements)[row[2]];
  if (!edge) return null;
  return {
    ...pathPoint(edge.centerline, row[3]),
    slot: row[0],
    id: vehicleId(row[0], model),
    speed: row[4],
  };
}

// Sample arc distance, including all worker-reported boundary crossings. Never extrapolate.
export function interpolateVehicle(
  model: Model,
  a: Row,
  b: Row,
  from: Snapshot,
  to: Snapshot,
  tick: number,
  events: readonly DeepReadonly<EngineEvent>[],
): Pose | null {
  const t = Math.max(from.tick, Math.min(to.tick, tick));
  if (t >= to.tick) return pose(model, b);
  const transitions = events.filter(
    (e) => e.tick > from.tick && e.tick <= to.tick && e.relatedIds[0] === vehicleId(a[0], model),
  );
  const admitted = transitions.find((e) => e.type === 'TRIP_ADMITTED');
  const arrived = transitions.find((e) => e.type === 'TRIP_ARRIVED');
  if (a[1] < 2 && (!admitted || t < admitted.tick)) return null;
  if (arrived && t >= arrived.tick) {
    // A publication interval can contain both arrival and admission of the next
    // overdue itinerary request. Keep the two trips separate at their real ticks.
    if (admitted && admitted.tick > arrived.tick && t >= admitted.tick && b[1] >= 2) {
      const laneIndex = model.lanes.findIndex((lane) => lane.id === admitted.relatedIds[1]);
      if (laneIndex < 0) return null;
      const admittedRow: Row = [a[0], 2, laneIndex, model.vehicleLengthsMm[a[0]] ?? 4500, 0];
      return interpolateVehicle(
        model,
        admittedRow,
        b,
        { ...from, tick: admitted.tick, simTimeMs: admitted.tick * 100 },
        to,
        t,
        [],
      );
    }
    return null;
  }
  const crossings = to.traversals.filter((r) => r[0] === a[0] && r[5] > from.tick);
  type Key = { tick: number; kind: number; index: number; mm: number };
  const keys: Key[] = [];
  if (a[1] >= 2) keys.push({ tick: from.tick, kind: a[1] - 2, index: a[2], mm: a[3] });
  if (admitted) {
    const index = model.lanes.findIndex((l) => l.id === admitted.relatedIds[1]);
    if (index >= 0)
      keys.push({ tick: admitted.tick, kind: 0, index, mm: model.vehicleLengthsMm[a[0]] ?? 4500 });
  }
  for (const [i, row] of crossings.entries()) {
    // Two records describe a crossing transition. They share its effective tick.
    if (row[3] > 0) keys.push({ tick: row[5] - 1, kind: row[1], index: row[2], mm: row[3] });
    if (crossings[i + 1]?.[5] !== row[5])
      keys.push({ tick: row[5], kind: row[1], index: row[2], mm: row[4] });
  }
  if (b[1] >= 2) keys.push({ tick: to.tick, kind: b[1] - 2, index: b[2], mm: b[3] });
  if (arrived && a[1] >= 2) {
    const last = keys.at(-1)!;
    const edge = (last.kind === 0 ? model.lanes : model.movements)[last.index];
    if (edge) keys.push({ ...last, tick: arrived.tick, mm: edge.lengthM * 1000 });
  }
  keys.sort((x, y) => x.tick - y.tick);
  let start = keys[0];
  if (!start) return null;
  for (let i = 1; i < keys.length; i++) {
    const end = keys[i]!;
    if (end.tick <= t) {
      start = end;
      continue;
    }
    const alpha = Math.max(0, Math.min(1, (t - start.tick) / (end.tick - start.tick)));
    const e1 = (start.kind === 0 ? model.lanes : model.movements)[start.index];
    const e2 = (end.kind === 0 ? model.lanes : model.movements)[end.index];
    if (!e1 || !e2) return null;
    let kind = start.kind,
      index = start.index,
      mm = start.mm;
    if (kind === end.kind && index === end.index) mm += (end.mm - mm) * alpha;
    else {
      const finish = e1.centerline.at(-1)!,
        begin = e2.centerline[0]!;
      if (Math.hypot(finish.eastM - begin.eastM, finish.northM - begin.northM) > 0.01)
        return pose(model, a);
      const first = e1.lengthM * 1000 - start.mm;
      const distance = (first + end.mm) * alpha;
      if (distance <= first) mm += distance;
      else {
        kind = end.kind;
        index = end.index;
        mm = distance - first;
      }
    }
    return pose(model, [a[0], kind + 2, index, mm, a[4] + (b[4] - a[4]) * alpha]);
  }
  return pose(model, [a[0], start.kind + 2, start.index, start.mm, b[4]]);
}

export class PresentationBuffer {
  snapshots: Snapshot[] = [];
  events: DeepReadonly<EngineEvent>[] = [];
  receivedAt = 0;
  running = false;
  speed = 1;
  reset() {
    this.snapshots = [];
    this.events = [];
    this.running = false;
  }
  push(snapshot: Snapshot, now: number) {
    let last = this.snapshots.at(-1);
    if (last && snapshot.tick < last.tick) return;
    if (last && this.running && now - this.receivedAt > Math.max(600, 400 / this.speed)) {
      this.snapshots = [];
      last = undefined;
    }
    if (last?.tick === snapshot.tick) {
      this.snapshots[this.snapshots.length - 1] = {
        ...snapshot,
        traversals: last.traversals.length ? last.traversals : snapshot.traversals,
      };
    } else this.snapshots.push(snapshot);
    this.snapshots = this.snapshots.slice(-3);
    this.receivedAt = now;
  }
  addEvents(events: readonly DeepReadonly<EngineEvent>[]) {
    this.events.push(...events);
    const oldest = this.snapshots[0]?.tick ?? 0;
    this.events = this.events.filter((e) => e.tick >= oldest).slice(-3000);
  }
  sample(model: Model, now: number, staticSymbols = false) {
    const last = this.snapshots.at(-1);
    if (!last) return null;
    const stale = this.running && now - this.receivedAt > Math.max(600, 400 / this.speed);
    const viewTick =
      !this.running || staticSymbols
        ? last.tick
        : Math.min(
            last.tick,
            last.tick - 2 + (Math.max(0, now - this.receivedAt) * this.speed) / 100,
          );
    const a = [...this.snapshots].reverse().find((s) => s.tick <= viewTick) ?? this.snapshots[0]!;
    const b = this.snapshots.find((s) => s.tick > a.tick) ?? a;
    const endRows = new Map(b.agents.map((row) => [row[0], row]));
    const vehicles = a.agents.flatMap((row) => {
      const end = endRows.get(row[0]);
      const value =
        !end || a === b
          ? pose(model, row)
          : interpolateVehicle(model, row, end, a, b, viewTick, this.events);
      return value ? [value] : [];
    });
    const laneClosed = [...a.laneClosed];
    const signals = a.signals.map((s) => [...s]);
    for (const event of this.events) {
      if (event.tick <= a.tick || event.tick > viewTick) continue;
      if (event.type === 'CLOSURE_APPLIED' || event.type === 'LANE_REOPENED') {
        const index = model.lanes.findIndex((l) => l.id === event.entityId);
        if (index >= 0) laneClosed[index] = event.type === 'CLOSURE_APPLIED';
      }
      if (event.type === 'SIGNAL_CHANGED') {
        const index = model.city.signals.findIndex((s) => s.id === event.entityId);
        const signal = signals[index];
        const [approach, phase] = (event.reason ?? '').split(':');
        if (signal) {
          signal[1] = phase === 'GREEN' ? 0 : phase === 'AMBER' ? 1 : 2;
          signal[2] = ['N', 'E', 'S', 'W'].indexOf(approach ?? '');
        }
      }
    }
    return { vehicles, signals, laneClosed, tick: Math.max(a.tick, viewTick), stale };
  }
}
