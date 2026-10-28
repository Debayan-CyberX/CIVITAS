import type { CityDefinition } from '@civitas/contracts';

export type Point = { eastM: number; northM: number; elevationM: number };
export const world = (p: Point): [number, number, number] => [p.eastM, p.elevationM, -p.northM];
export const screen = (p: Point): [number, number] => [p.eastM, 450 - p.northM];
export function bounds(points: readonly Point[]) {
  const x0 = Math.min(...points.map((p) => p.eastM));
  const x1 = Math.max(...points.map((p) => p.eastM));
  const n0 = Math.min(...points.map((p) => p.northM));
  const n1 = Math.max(...points.map((p) => p.northM));
  return { x: (x0 + x1) / 2, n: (n0 + n1) / 2, width: x1 - x0, depth: n1 - n0, x0, n0 };
}
export function pathPoint(points: readonly Point[], mm: number) {
  let remaining = Math.max(0, mm / 1000);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const size = Math.hypot(b.eastM - a.eastM, b.northM - a.northM);
    if (remaining <= size || i === points.length - 1) {
      const t = Math.min(1, remaining / (size || 1));
      return {
        eastM: a.eastM + (b.eastM - a.eastM) * t,
        northM: a.northM + (b.northM - a.northM) * t,
        elevationM: a.elevationM + (b.elevationM - a.elevationM) * t,
        heading: Math.atan2(b.eastM - a.eastM, b.northM - a.northM),
      };
    }
    remaining -= size;
  }
  throw new Error('Presentation path has no segments');
}
export function presentationModel(
  city: CityDefinition,
  agents?: readonly { id: string; profileId: string }[],
  profiles?: readonly { id: string; lengthMm: number }[],
) {
  // Worker edge indexes are ASCII sorted, not authoring-array order.
  const sort = <T extends { id: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    city,
    lanes: sort(city.lanes),
    movements: sort(city.movements),
    agentIds:
      agents?.map((a) => a.id) ??
      Array.from({ length: 300 }, (_, i) => `V${i.toString().padStart(3, '0')}`),
    vehicleLengthsMm:
      agents?.map((a) => profiles?.find((p) => p.id === a.profileId)?.lengthMm ?? 4500) ??
      Array<number>(300).fill(4500),
  };
}
export type Model = ReturnType<typeof presentationModel>;

export function entityPosition(model: Model, id: string): Point | null {
  const node = model.city.nodes.find((n) => n.id === id);
  if (node) return node.position;
  const polygon =
    model.city.districts.find((d) => d.id === id)?.polygon ??
    model.city.buildings.find((b) => b.id === id)?.footprint ??
    model.city.segments.find((s) => s.id === id)?.footprint;
  if (polygon) {
    const b = bounds(polygon);
    return { eastM: b.x, northM: b.n, elevationM: 0 };
  }
  const lane = model.lanes.find((l) => l.id === id);
  return lane ? pathPoint(lane.centerline, lane.lengthM * 500) : null;
}

export const vehicleId = (slot: number, model?: Model) =>
  model?.agentIds[slot] ?? `V${slot.toString().padStart(3, '0')}`;
