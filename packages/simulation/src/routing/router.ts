import type { CompiledCity } from '../city/compile';
import { ascii, required } from '../util';
export interface Path {
  edges: string[];
  cost: number;
}
export class Router {
  private cache = new Map<string, Path | null>();
  private version = -1;
  constructor(private readonly graph: CompiledCity) {}
  route(
    origin: string,
    destination: string,
    closed: ReadonlySet<string> = new Set(),
    version = 0,
    currentLane?: string,
  ): Path | null {
    if (this.version !== version) {
      this.cache.clear();
      this.version = version;
    }
    const key = `${origin}|${destination}|${currentLane ?? ''}`;
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      return cached ? { cost: cached.cost, edges: [...cached.edges] } : null;
    }
    const cost = (id: string) => {
      const e = required(this.graph.edges.get(id), 'route edge');
      return Math.max(1, Math.ceil(e.lengthMm / e.limit / 0.1));
    };
    const queue: { lane: string; cost: number; edges: string[] }[] = [];
    if (currentLane) queue.push({ lane: currentLane, cost: 0, edges: [currentLane] });
    else
      for (const lane of this.graph.laneList)
        if (lane.fromNodeId === origin && !closed.has(lane.id))
          queue.push({ lane: lane.id, cost: cost(lane.id), edges: [lane.id] });
    const best = new Map<string, { cost: number; key: string }>();
    let answer: Path | null = null;
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost || ascii(a.edges.join('\0'), b.edges.join('\0')));
      const item = required(queue.shift(), 'route candidate');
      const pathKey = item.edges.join('\0');
      const previous = best.get(item.lane);
      if (
        previous &&
        (previous.cost < item.cost ||
          (previous.cost === item.cost && ascii(previous.key, pathKey) <= 0))
      )
        continue;
      best.set(item.lane, { cost: item.cost, key: pathKey });
      if (required(this.graph.lanes.get(item.lane), 'lane').toNodeId === destination) {
        answer = { cost: item.cost, edges: item.edges };
        break;
      }
      for (const movement of this.graph.next.get(item.lane) ?? []) {
        if (closed.has(movement.outgoingLaneId)) continue;
        queue.push({
          lane: movement.outgoingLaneId,
          cost: item.cost + cost(movement.id) + cost(movement.outgoingLaneId),
          edges: [...item.edges, movement.id, movement.outgoingLaneId],
        });
      }
    }
    this.cache.set(key, answer);
    return answer ? { cost: answer.cost, edges: [...answer.edges] } : null;
  }
}
