export interface Point {
  eastM: number;
  northM: number;
  elevationM: number;
}
export const point = (eastM: number, northM: number, elevationM = 0): Point => ({
  eastM,
  northM,
  elevationM,
});
export function rectangle(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [point(x0, y0), point(x1, y0), point(x1, y1), point(x0, y1)];
}
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.eastM - b.eastM, a.northM - b.northM, a.elevationM - b.elevationM);
export function length(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += distance(a, b);
  }
  return total;
}
export function box(points: readonly Point[]) {
  return {
    x0: Math.min(...points.map((p) => p.eastM)),
    x1: Math.max(...points.map((p) => p.eastM)),
    y0: Math.min(...points.map((p) => p.northM)),
    y1: Math.max(...points.map((p) => p.northM)),
  };
}
export function boxesOverlap(a: ReturnType<typeof box>, b: ReturnType<typeof box>, margin = 0) {
  return (
    a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.y0 < b.y1 + margin && a.y1 > b.y0 - margin
  );
}
export function contains(polygon: readonly Point[], p: Point): boolean {
  const b = box(polygon);
  return p.eastM >= b.x0 && p.eastM <= b.x1 && p.northM >= b.y0 && p.northM <= b.y1;
}
export function samplePath(points: readonly Point[], arcM: number): Point {
  let remaining = Math.max(0, arcM);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const segment = distance(a, b);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return point(
        a.eastM + (b.eastM - a.eastM) * t,
        a.northM + (b.northM - a.northM) * t,
        a.elevationM + (b.elevationM - a.elevationM) * t,
      );
    }
    remaining -= segment;
  }
  const last = points.at(-1);
  if (!last) throw new Error('Empty path');
  return { ...last };
}
