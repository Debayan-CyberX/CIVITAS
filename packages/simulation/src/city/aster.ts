import {
  CityDefinitionSchema,
  ScenarioSchema,
  SIMULATION_SPEC_VERSION,
  PRNG_VERSION,
} from '@civitas/contracts';
import type { CityDefinition, Scenario } from '@civitas/contracts';
import { point, rectangle, length, distance } from './geometry';
import { required, ascii } from '../util';
import { canonical } from '../replay/canonical';
import type { Digest } from '../replay/canonical';

export const ENGINE_VERSION = 'engine/0.2.0';
const placeholderHash = '0'.repeat(64);
export function topologyPayload(city: CityDefinition) {
  return {
    nodes: city.nodes,
    segments: city.segments,
    lanes: city.lanes,
    movements: city.movements,
    intersections: city.intersections,
    signals: city.signals,
  };
}
export async function createAsterCity(digest: Digest): Promise<CityDefinition> {
  const districts = [
    {
      id: 'D0',
      name: 'Kiln Quarter',
      polygon: rectangle(-90, -90, 150, 450),
      landUse: 'RESIDENTIAL',
      syntheticPopulationProfileId: null,
    },
    {
      id: 'D1',
      name: 'Exchange',
      polygon: rectangle(150, -90, 390, 450),
      landUse: 'MIXED',
      syntheticPopulationProfileId: null,
    },
    {
      id: 'D2',
      name: 'Foundry Reach',
      polygon: rectangle(390, -90, 630, 450),
      landUse: 'WORKSHOP',
      syntheticPopulationProfileId: null,
    },
  ];
  const nodes = Array.from({ length: 4 }, (_, c) =>
    Array.from({ length: 3 }, (_, r) => ({
      id: `J${c}${r}`,
      position: point(c * 180, r * 180),
      districtId: c === 0 ? 'D0' : c === 3 ? 'D2' : 'D1',
      incomingLaneIds: [] as string[],
      outgoingLaneIds: [] as string[],
    })),
  ).flat();
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const lanes: {
    id: string;
    segmentId: string;
    fromNodeId: string;
    toNodeId: string;
    centerline: ReturnType<typeof point>[];
    lengthM: number;
    widthM: number;
    speedLimitMps: number;
  }[] = [];
  const segments = [];
  for (const a of nodes)
    for (const b of nodes) {
      if (ascii(a.id, b.id) >= 0 || distance(a.position, b.position) !== 180) continue;
      const id = `R:${a.id}:${b.id}`;
      const dx = (b.position.eastM - a.position.eastM) / 180;
      const dy = (b.position.northM - a.position.northM) / 180;
      const footprint =
        dx !== 0
          ? rectangle(
              a.position.eastM,
              a.position.northM - 3.2,
              b.position.eastM,
              b.position.northM + 3.2,
            )
          : rectangle(
              a.position.eastM - 3.2,
              a.position.northM,
              b.position.eastM + 3.2,
              b.position.northM,
            );
      const laneIds = [];
      for (const [from, to, ux, uy] of [
        [a, b, dx, dy],
        [b, a, -dx, -dy],
      ] as const) {
        const laneId = `L:${from.id}>${to.id}`;
        const start = point(
          from.position.eastM + ux * 12 + uy * 1.6,
          from.position.northM + uy * 12 - ux * 1.6,
        );
        const end = point(
          to.position.eastM - ux * 12 + uy * 1.6,
          to.position.northM - uy * 12 - ux * 1.6,
        );
        lanes.push({
          id: laneId,
          segmentId: id,
          fromNodeId: from.id,
          toNodeId: to.id,
          centerline: [start, end],
          lengthM: 156,
          widthM: 3.2,
          speedLimitMps: 13.889,
        });
        from.outgoingLaneIds.push(laneId);
        to.incomingLaneIds.push(laneId);
        laneIds.push(laneId);
      }
      segments.push({ id, endpoints: [a.id, b.id], footprint, laneIds });
    }
  const movements: {
    id: string;
    incomingLaneId: string;
    outgoingLaneId: string;
    nodeId: string;
    centerline: ReturnType<typeof point>[];
    lengthM: number;
    speedLimitMps: number;
  }[] = [];
  for (const incoming of lanes)
    for (const outgoing of lanes) {
      if (incoming.toNodeId !== outgoing.fromNodeId || incoming.fromNodeId === outgoing.toNodeId)
        continue;
      const start = required(incoming.centerline.at(-1), 'entry');
      const end = required(outgoing.centerline[0], 'exit');
      const a = required(nodeMap.get(incoming.fromNodeId), 'from');
      const center = required(nodeMap.get(incoming.toNodeId), 'junction');
      const b = required(nodeMap.get(outgoing.toNodeId), 'to');
      const horizontalIn = a.position.northM === center.position.northM;
      const horizontalOut = b.position.northM === center.position.northM;
      const control =
        horizontalIn === horizontalOut
          ? point((start.eastM + end.eastM) / 2, (start.northM + end.northM) / 2)
          : horizontalIn
            ? point(end.eastM, start.northM)
            : point(start.eastM, end.northM);
      const centerline = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return point(
          (1 - t) ** 2 * start.eastM + 2 * (1 - t) * t * control.eastM + t * t * end.eastM,
          (1 - t) ** 2 * start.northM + 2 * (1 - t) * t * control.northM + t * t * end.northM,
        );
      });
      movements.push({
        id: `M:${incoming.id}>${outgoing.id}`,
        incomingLaneId: incoming.id,
        outgoingLaneId: outgoing.id,
        nodeId: center.id,
        centerline,
        lengthM: length(centerline),
        speedLimitMps: 5.556,
      });
    }
  const intersections = nodes.map((node) => {
    const available = new Set(
      node.incomingLaneIds.map((id) => {
        const lane = required(
          lanes.find((l) => l.id === id),
          'incoming',
        );
        const from = required(nodeMap.get(lane.fromNodeId), 'approach');
        return from.position.northM > node.position.northM
          ? 'N'
          : from.position.eastM > node.position.eastM
            ? 'E'
            : from.position.northM < node.position.northM
              ? 'S'
              : 'W';
      }),
    );
    return {
      nodeId: node.id,
      approaches: (['N', 'E', 'S', 'W'] as const).filter((a) => available.has(a)),
      movementIds: movements
        .filter((m) => m.nodeId === node.id)
        .map((m) => m.id)
        .sort(),
      signalId: `S:${node.id}`,
    };
  });
  const signals = intersections.map((i) => ({
    id: i.signalId,
    nodeId: i.nodeId,
    greenTicks: 120,
    amberTicks: 30,
    allRedTicks: 20,
    initialApproach: i.approaches[0],
    initialOffsetTicks: 0,
  }));
  const xs = [
    [-60, -24, 48, 112],
    [212, 248, 292, 328],
    [422, 470, 584, 610],
  ];
  const ys = [-48, 60, 264, 408];
  const buildings = xs.flatMap((columns, d) =>
    columns.flatMap((x, c) =>
      ys.map((y, r) => {
        const n = c * 4 + r;
        const gateway = [...nodes].sort(
          (a, b) =>
            distance(a.position, point(x, y)) - distance(b.position, point(x, y)) ||
            ascii(a.id, b.id),
        )[0];
        return {
          id: `B${d}${n.toString().padStart(2, '0')}`,
          districtId: `D${d}`,
          footprint: rectangle(x - 9, y - 12, x + 9, y + 12),
          elevationM: 0,
          floors: d === 1 ? 6 + (n % 8) : d === 0 ? 3 + (n % 6) : 2 + (n % 5),
          floorHeightM: 3.2,
          use: d === 1 ? 'OFFICE' : d === 0 ? 'RESIDENTIAL' : 'WORKSHOP',
          gatewayNodeId: required(gateway, 'building gateway').id,
          energyProfileId: null,
        };
      }),
    ),
  );
  const city = CityDefinitionSchema.parse({
    schemaVersion: 'city/1',
    id: 'aster',
    version: 'v1',
    name: 'Aster',
    topologyHash: placeholderHash,
    frame: { id: 'aster-local-meters', kind: 'LOCAL_METRIC', units: 'meters' },
    bounds: { minEastM: -90, maxEastM: 630, minNorthM: -90, maxNorthM: 450 },
    nodes: nodes.sort((a, b) => ascii(a.id, b.id)),
    segments: segments.sort((a, b) => ascii(a.id, b.id)),
    lanes: lanes.sort((a, b) => ascii(a.id, b.id)),
    movements: movements.sort((a, b) => ascii(a.id, b.id)),
    intersections,
    signals,
    districts,
    buildings,
  });
  city.topologyHash = await digest(canonical(topologyPayload(city)));
  return city;
}
export function createMorningScenario(
  city: CityDefinition,
  cityHash: string,
  fleetSize = 200,
  seed = 104729,
): Scenario {
  return ScenarioSchema.parse({
    schemaVersion: 'scenario/1',
    id: 'aster-morning',
    version: 'v1',
    name: 'Aster morning',
    cityId: city.id,
    cityVersion: city.version,
    cityHash,
    specVersion: SIMULATION_SPEC_VERSION,
    engineVersion: ENGINE_VERSION,
    tickDurationMs: 100,
    seed,
    prngVersion: PRNG_VERSION,
    horizonTicks: 9000,
    warmupTicks: 1200,
    demand: {
      fleetSize,
      firstDepartureSpreadTicks: 600,
      itineraryIntervalTicks: 1200,
      originWeights: [
        { districtId: 'D0', weight: 5 },
        { districtId: 'D1', weight: 2 },
        { districtId: 'D2', weight: 3 },
      ],
      destinationWeights: [
        [1, 6, 3],
        [4, 1, 5],
        [3, 6, 1],
      ].map((row, i) => ({
        originDistrictId: `D${i}`,
        destinations: row.map((weight, j) => ({ districtId: `D${j}`, weight })),
      })),
    },
    vehicleProfiles: [
      {
        id: 'passenger',
        lengthMm: 4500,
        minimumGapMm: 2000,
        desiredHeadwayMs: 1200,
        accelerationMmPerSecondSquared: 1500,
        comfortableBrakingMmPerSecondSquared: 2000,
        emergencyBrakingMmPerSecondSquared: 6000,
        exponent: 4,
      },
    ],
  });
}
