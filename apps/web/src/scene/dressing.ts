import type { Model } from './model';
import { bounds } from './model';

export type Block = {
  x: number;
  n: number;
  y: number;
  w: number;
  h: number;
  d: number;
  color: string;
  id?: string;
  rotation?: number;
};
export function environment(model: Model) {
  const masses: Block[] = [],
    details: Block[] = [],
    trees: Block[] = [],
    paving: Block[] = [];
  const palette = ['#a39b88', '#9b826e', '#c0b8a5'];
  const occupied = model.city.buildings.map((b) => bounds(b.footprint));
  const safe = (x: number, n: number, radius: number) => {
    if (
      occupied.some(
        (b) =>
          Math.abs(b.x - x) < b.width / 2 + radius + 4 &&
          Math.abs(b.n - n) < b.depth / 2 + radius + 4,
      )
    )
      return false;
    if (
      model.city.nodes.some(
        (j) => Math.hypot(j.position.eastM - x, j.position.northM - n) < 20 + radius,
      )
    )
      return false;
    return !model.city.segments.some((s) => {
      const b = bounds(s.footprint);
      return (
        Math.abs(b.x - x) < b.width / 2 + radius + 5 && Math.abs(b.n - n) < b.depth / 2 + radius + 5
      );
    });
  };
  // Independent integer visual hash: no consumption of the simulation's random stream.
  const hash = (x: number, n: number) => Math.abs(((x * 73856093) ^ (n * 19349663)) | 0);
  for (let x = -65; x <= 610; x += 33)
    for (let n = -65; n <= 430; n += 34) {
      const k = hash(x, n);
      if (!safe(x, n, 12)) continue;
      if (k % 5 === 0) {
        paving.push({ x, n, y: 0.12, w: 25, d: 27, h: 0.2, color: '#596452' });
        trees.push({ x, n, y: 4, w: 5, d: 5, h: 7, color: '#66765a' });
        details.push({ x: x + 7, n, y: 0.7, w: 4, d: 1.2, h: 0.25, color: '#907e64' });
        details.push({ x: x + 7, n: n + 0.5, y: 1.2, w: 4, d: 0.15, h: 0.8, color: '#907e64' });
      } else {
        const h = x > 150 && x < 390 ? 23 + (k % 43) : 9 + (k % 20);
        const w = 13 + (k % 8),
          d = 14 + ((k >> 4) % 8);
        masses.push({ x, n, y: h / 2, w, d, h, color: palette[x < 150 ? 1 : x < 390 ? 2 : 0]! });
        details.push({ x, n, y: h + 0.6, w: w + 0.5, d: d + 0.5, h: 1.2, color: '#555853' });
        if (h > 30)
          details.push({
            x: x + 2,
            n: n - 1,
            y: h + 2.2,
            w: w * 0.4,
            d: d * 0.5,
            h: 2,
            color: '#7c8075',
          });
        for (let floor = 1; floor * 3.4 < h - 1; floor++) {
          details.push({
            x,
            n: n + d / 2 + 0.05,
            y: floor * 3.4,
            w: w - 2,
            d: 0.13,
            h: 1.1,
            color: '#434c4c',
          });
          details.push({
            x: x + w / 2 + 0.05,
            n,
            y: floor * 3.4,
            w: 0.13,
            d: d - 2,
            h: 1.1,
            color: '#434c4c',
          });
        }
      }
    }
  for (const [i, b] of model.city.buildings.entries()) {
    const r = bounds(b.footprint),
      h = b.floors * b.floorHeightM;
    details.push({
      x: r.x,
      n: r.n,
      y: h + 0.6,
      w: r.width + 0.4,
      d: r.depth + 0.4,
      h: 1.2,
      color: '#565e58',
    });
    for (let floor = 1; floor < b.floors; floor++) {
      details.push({
        x: r.x,
        n: r.n + r.depth / 2 + 0.05,
        y: floor * b.floorHeightM + 0.8,
        w: r.width - 2,
        d: 0.12,
        h: 1.3,
        color: '#404c4c',
      });
      details.push({
        x: r.x + r.width / 2 + 0.05,
        n: r.n,
        y: floor * b.floorHeightM + 0.8,
        w: 0.12,
        d: r.depth - 2,
        h: 1.3,
        color: '#404c4c',
      });
    }
    if (i % 3 === 0)
      details.push({ x: r.x + 2, n: r.n - 2, y: h + 1.8, w: 4, d: 5, h: 1.4, color: '#8e9689' });
  }
  // Streetside trees stay outside the exact road and 24 m junction areas.
  for (const s of model.city.segments) {
    const a = model.city.nodes.find((n) => n.id === s.endpoints[0])!.position;
    const b = model.city.nodes.find((n) => n.id === s.endpoints[1])!.position;
    const horizontal = a.northM === b.northM;
    for (let t = 28; t < 160; t += 22)
      for (const side of [-1, 1]) {
        const x = horizontal ? a.eastM + t : a.eastM + side * 11;
        const n = horizontal ? a.northM + side * 11 : a.northM + t;
        if (!safe(x, n, 1)) continue;
        trees.push({ x, n, y: 4.5, w: 3.6, d: 3.6, h: 6, color: '#718164' });
      }
  }
  const context: Block[] = [];
  // Distant architecture has no roads, picking IDs or simulation semantics.
  for (let x = -300; x <= 1000; x += 45)
    for (let n = 640; n <= 900; n += 55) {
      const k = hash(x, n),
        h = 14 + (k % 66);
      if (k % 4 === 0) continue;
      context.push({ x, n, y: h / 2 - 3, w: 18 + (k % 13), d: 22 + (k % 17), h, color: '#7d8780' });
    }
  return { masses, details, trees, paving, context };
}
