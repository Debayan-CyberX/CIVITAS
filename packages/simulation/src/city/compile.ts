import { CityDefinitionSchema } from '@civitas/contracts';
import { box, boxesOverlap, contains, distance, length, samplePath } from './geometry';
import { ascii, required, quantize } from '../util';

export interface Edge {
  id: string;
  kind: 'LANE' | 'MOVEMENT';
  index: number;
  lengthMm: number;
  limit: number;
  districtCuts: { startMm: number; endMm: number; districtId: string }[];
}
export function compileCity(input: unknown) {
  const city = CityDefinitionSchema.parse(input);
  function unique<T>(values: readonly T[], key: (item: T) => string) {
    const map = new Map<string, T>();
    for (const item of values) {
      const id = key(item);
      if (map.has(id)) throw new Error(`Duplicate ${id}`);
      map.set(id, item);
    }
    return map;
  }
  const nodes = unique(city.nodes, (n) => n.id);
  const lanes = unique(city.lanes, (l) => l.id);
  const movements = unique(city.movements, (m) => m.id);
  const districts = unique(city.districts, (d) => d.id);
  const segments = unique(city.segments, (s) => s.id);
  const signals = unique(city.signals, (s) => s.id);
  unique(city.buildings, (b) => b.id);
  const intersections = unique(city.intersections, (i) => i.nodeId);
  const sortedDistricts = [...districts.values()].sort(
    (a, b) => box(a.polygon).x0 - box(b.polygon).x0,
  );
  let boundary: number = city.bounds.minEastM;
  for (const district of sortedDistricts) {
    const b = box(district.polygon);
    if (
      district.polygon.length !== 4 ||
      b.x0 !== boundary ||
      b.y0 !== city.bounds.minNorthM ||
      b.y1 !== city.bounds.maxNorthM ||
      district.polygon.some(
        (p) => (p.eastM !== b.x0 && p.eastM !== b.x1) || (p.northM !== b.y0 && p.northM !== b.y1),
      )
    )
      throw new Error('Districts must partition supported rectangular local frame');
    boundary = b.x1;
  }
  if (boundary !== city.bounds.maxEastM) throw new Error('District coverage gap');
  for (const node of nodes.values()) {
    required(districts.get(node.districtId), 'node district');
    required(intersections.get(node.id), 'intersection');
    const incoming = city.lanes
      .filter((l) => l.toNodeId === node.id)
      .map((l) => l.id)
      .sort();
    const outgoing = city.lanes
      .filter((l) => l.fromNodeId === node.id)
      .map((l) => l.id)
      .sort();
    if (
      !incoming.length ||
      !outgoing.length ||
      incoming.join() !== [...node.incomingLaneIds].sort().join() ||
      outgoing.join() !== [...node.outgoingLaneIds].sort().join()
    )
      throw new Error('Node incidence mismatch');
    const district = required(districts.get(node.districtId), 'district');
    if (!contains(district.polygon, node.position)) throw new Error('Node outside district');
  }
  for (const segment of segments.values()) {
    const pair = segment.laneIds.map((id) => required(lanes.get(id), 'segment lane'));
    const a = required(pair[0], 'first direction');
    const b = required(pair[1], 'second direction');
    if (
      a.segmentId !== segment.id ||
      b.segmentId !== segment.id ||
      a.fromNodeId !== b.toNodeId ||
      a.toNodeId !== b.fromNodeId ||
      !segment.endpoints.includes(a.fromNodeId) ||
      !segment.endpoints.includes(a.toNodeId)
    )
      throw new Error('Physical segment directions mismatch');
  }
  for (const lane of lanes.values()) {
    required(nodes.get(lane.fromNodeId), 'lane origin');
    required(nodes.get(lane.toNodeId), 'lane destination');
    required(segments.get(lane.segmentId), 'lane segment');
    if (
      Math.abs(length(lane.centerline) - lane.lengthM) > 0.001 ||
      lane.lengthM <= lane.speedLimitMps * 0.1
    )
      throw new Error('Invalid lane geometry length/timestep');
  }
  const next = new Map<string, typeof city.movements>();
  for (const movement of movements.values()) {
    const incoming = required(lanes.get(movement.incomingLaneId), 'movement incoming');
    const outgoing = required(lanes.get(movement.outgoingLaneId), 'movement outgoing');
    if (
      incoming.toNodeId !== movement.nodeId ||
      outgoing.fromNodeId !== movement.nodeId ||
      incoming.fromNodeId === outgoing.toNodeId
    )
      throw new Error('Illegal movement/U-turn');
    if (
      distance(
        required(incoming.centerline.at(-1), 'stop line'),
        required(movement.centerline[0], 'connector start'),
      ) > 0.001 ||
      distance(
        required(outgoing.centerline[0], 'lane start'),
        required(movement.centerline.at(-1), 'connector end'),
      ) > 0.001 ||
      Math.abs(length(movement.centerline) - movement.lengthM) > 0.001 ||
      movement.lengthM <= movement.speedLimitMps * 0.1
    )
      throw new Error('Discontinuous connector');
    const list = next.get(incoming.id) ?? [];
    list.push(movement);
    next.set(incoming.id, list);
  }
  for (const intersection of intersections.values()) {
    const signal = required(signals.get(intersection.signalId), 'signal plan');
    const cycle =
      (signal.greenTicks + signal.amberTicks + signal.allRedTicks) * intersection.approaches.length;
    if (
      signal.initialOffsetTicks >= cycle ||
      Math.max(signal.greenTicks, signal.amberTicks, signal.allRedTicks) > 36000
    )
      throw new Error('Unbounded signal plan');
    if (
      signal.nodeId !== intersection.nodeId ||
      !intersection.approaches.includes(signal.initialApproach)
    )
      throw new Error('Signal approach mismatch');
    if (
      [...intersection.movementIds].sort().join() !==
      city.movements
        .filter((m) => m.nodeId === intersection.nodeId)
        .map((m) => m.id)
        .sort()
        .join()
    )
      throw new Error('Intersection movement table mismatch');
  }
  for (const list of next.values()) list.sort((a, b) => ascii(a.id, b.id));
  for (const first of lanes.values()) {
    const seen = new Set<string>();
    const todo = [first.id];
    while (todo.length) {
      const id = required(todo.pop(), 'reachability item');
      if (seen.has(id)) continue;
      seen.add(id);
      for (const m of next.get(id) ?? []) todo.push(m.outgoingLaneId);
    }
    if (seen.size !== lanes.size) throw new Error(`Disconnected legal movement graph: ${first.id}`);
  }
  for (let i = 0; i < city.buildings.length; i++) {
    const building = required(city.buildings[i], 'building');
    const district = required(districts.get(building.districtId), 'building district');
    required(nodes.get(building.gatewayNodeId), 'building gateway');
    if (building.footprint.some((p) => !contains(district.polygon, p)))
      throw new Error('Building crosses district boundary');
    const b = box(building.footprint);
    for (const road of segments.values())
      if (boxesOverlap(b, box(road.footprint), 4))
        throw new Error('Building violates road setback');
    for (const other of city.buildings.slice(i + 1))
      if (boxesOverlap(b, box(other.footprint))) throw new Error('Overlapping buildings');
  }
  const edges = new Map<string, Edge>();
  const laneList = [...lanes.values()].sort((a, b) => ascii(a.id, b.id));
  const movementList = [...movements.values()].sort((a, b) => ascii(a.id, b.id));
  for (const [kind, list] of [
    ['LANE', laneList],
    ['MOVEMENT', movementList],
  ] as const) {
    for (const [index, entry] of list.entries()) {
      const cuts = new Set([0, entry.lengthM]);
      let offset = 0;
      for (let i = 1; i < entry.centerline.length; i++) {
        const a = required(entry.centerline[i - 1], 'polyline start');
        const b = required(entry.centerline[i], 'polyline end');
        const size = distance(a, b);
        for (const d of sortedDistricts) {
          const x = box(d.polygon).x0;
          const t = (x - a.eastM) / (b.eastM - a.eastM);
          if (Number.isFinite(t) && t > 0 && t < 1) cuts.add(offset + t * size);
        }
        offset += size;
      }
      const stops = [...cuts].sort((a, b) => a - b);
      const districtCuts = [];
      for (let i = 1; i < stops.length; i++) {
        const from = required(stops[i - 1], 'district cut');
        const to = required(stops[i], 'district cut');
        const p = samplePath(entry.centerline, (from + to) / 2);
        const district = required(
          sortedDistricts.find((d) => {
            const b = box(d.polygon);
            return p.eastM >= b.x0 && (p.eastM < b.x1 || b.x1 === city.bounds.maxEastM);
          }),
          'edge district',
        );
        districtCuts.push({
          startMm: quantize(from * 1000),
          endMm: quantize(to * 1000),
          districtId: district.id,
        });
      }
      edges.set(entry.id, {
        id: entry.id,
        kind,
        index,
        lengthMm: quantize(entry.lengthM * 1000),
        limit: quantize(entry.speedLimitMps * 1000),
        districtCuts,
      });
    }
  }
  return {
    city,
    nodes,
    lanes,
    movements,
    districts,
    segments,
    signals,
    intersections,
    next,
    edges,
    laneList,
    movementList,
  };
}
export type CompiledCity = ReturnType<typeof compileCity>;
