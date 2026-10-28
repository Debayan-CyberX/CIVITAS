import {
  compileCity,
  createMorningScenario,
  generateManifest,
  canonical,
  topologyPayload,
} from '@civitas/simulation';
import type { SimulationInputs } from '@civitas/simulation';
import { digest } from '../../scripts/runtime';

// Connected 3x2 subgrids, with generated turn restrictions that preserve strong connectivity.
export async function smallCity(
  base: SimulationInputs,
  west: 0 | 1,
  removedMovements: number[],
): Promise<SimulationInputs> {
  const city = structuredClone(base.city);
  city.nodes = city.nodes.filter(
    (n) => Number(n.id[1]) >= west && Number(n.id[1]) <= west + 2 && Number(n.id[2]) < 2,
  );
  const ids = new Set<string>(city.nodes.map((n) => n.id));
  city.lanes = city.lanes.filter((l) => ids.has(l.fromNodeId) && ids.has(l.toNodeId));
  const lanes = new Set<string>(city.lanes.map((l) => l.id));
  city.segments = city.segments.filter((s) => s.laneIds.every((id) => lanes.has(id)));
  city.movements = city.movements.filter(
    (m) => lanes.has(m.incomingLaneId) && lanes.has(m.outgoingLaneId),
  );
  city.intersections = city.intersections.filter((i) => ids.has(i.nodeId));
  city.signals = city.signals.filter((s) => ids.has(s.nodeId));
  city.buildings = [];
  for (const node of city.nodes) {
    node.incomingLaneIds = node.incomingLaneIds.filter((l) => lanes.has(l));
    node.outgoingLaneIds = node.outgoingLaneIds.filter((l) => lanes.has(l));
  }
  const refresh = () => {
    for (const intersection of city.intersections) {
      intersection.movementIds = city.movements
        .filter((m) => m.nodeId === intersection.nodeId)
        .map((m) => m.id);
      const node = city.nodes.find((n) => n.id === intersection.nodeId)!;
      const approaches = new Set(
        city.lanes
          .filter((l) => l.toNodeId === node.id)
          .map((l) => {
            const from = city.nodes.find((n) => n.id === l.fromNodeId)!;
            return from.position.northM > node.position.northM
              ? 'N'
              : from.position.eastM > node.position.eastM
                ? 'E'
                : from.position.northM < node.position.northM
                  ? 'S'
                  : 'W';
          }),
      );
      intersection.approaches = (['N', 'E', 'S', 'W'] as const).filter((a) => approaches.has(a));
      city.signals.find((s) => s.id === intersection.signalId)!.initialApproach =
        intersection.approaches[0]!;
    }
  };
  refresh();
  compileCity(city);
  for (const index of removedMovements) {
    const prior = city.movements;
    city.movements = city.movements.filter((_, i) => i !== index % city.movements.length);
    refresh();
    try {
      compileCity(city);
    } catch {
      city.movements = prior;
      refresh();
    }
  }
  const graph = compileCity(city);
  city.topologyHash = await digest(canonical(topologyPayload(city)));
  const cityHash = await digest(canonical(city));
  const scenario = createMorningScenario(city, cityHash, 100, 104729);
  const occupied = [...new Set(city.nodes.map((n) => n.districtId))];
  scenario.demand.originWeights = occupied.map((districtId) => ({ districtId, weight: 1 }));
  scenario.demand.destinationWeights = occupied.map((originDistrictId) => ({
    originDistrictId,
    destinations: occupied.map((districtId) => ({ districtId, weight: 1 })),
  }));
  const scenarioHash = await digest(canonical(scenario));
  const manifest = generateManifest(graph, scenario, scenarioHash);
  return {
    city,
    scenario,
    manifest,
    hashes: { city: cityHash, scenario: scenarioHash, manifest: await digest(canonical(manifest)) },
  };
}
