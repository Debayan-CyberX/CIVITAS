import type { EngineAgent, PhysicalFootprint } from '@civitas/contracts';
import type { CompiledCity } from '../city/compile';
import { required } from '../util';
export function currentEdge(agent: EngineAgent): string | null {
  return agent.location.kind === 'ON_LANE'
    ? agent.location.laneId
    : agent.location.kind === 'ON_CONNECTOR'
      ? agent.location.movementId
      : null;
}
export function footprints(
  graph: CompiledCity,
  agent: EngineAgent,
  length: number,
): PhysicalFootprint[] {
  const id = currentEdge(agent);
  if (!id) return [];
  const edge = required(graph.edges.get(id), 'body edge');
  const front =
    agent.location.kind === 'ON_LANE' || agent.location.kind === 'ON_CONNECTOR'
      ? agent.location.frontMm
      : 0;
  const result: PhysicalFootprint[] = [
    {
      agentId: agent.id,
      edge: { kind: edge.kind, id: edge.id },
      rearMm: Math.max(0, front - length),
      frontMm: front,
    },
  ];
  let remaining = length - front;
  for (const priorId of [...agent.trail].reverse()) {
    if (remaining <= 0) break;
    const prior = required(graph.edges.get(priorId), 'trailing body edge');
    result.push({
      agentId: agent.id,
      edge: { kind: prior.kind, id: prior.id },
      rearMm: Math.max(0, prior.lengthMm - remaining),
      frontMm: prior.lengthMm,
    });
    remaining -= prior.lengthMm;
  }
  if (remaining > 0) throw new Error('Body extends outside known occupied path');
  return result;
}
