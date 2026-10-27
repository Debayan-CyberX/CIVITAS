import {
  CITY_SCHEMA_VERSION,
  SCENARIO_SCHEMA_VERSION,
  MANIFEST_SCHEMA_VERSION,
  CHECKPOINT_SCHEMA_VERSION,
  FIXED_TIMESTEP_MS,
  SIMULATION_SPEC_VERSION,
  PRNG_VERSION,
  NUMERIC_CONTRACT_VERSION,
} from '@civitas/contracts';

export const hash = 'a'.repeat(64);
const point = (eastM: number, northM: number) => ({ eastM, northM, elevationM: 0 });
const polygon = [point(0, 0), point(100, 0), point(100, 100), point(0, 100)];

// Shape-only boundary fixtures, deliberately not an Aster dataset or a validated road graph.
export function cityFixture() {
  return {
    schemaVersion: CITY_SCHEMA_VERSION,
    id: 'shape-city',
    version: 'v1',
    name: 'Schema fixture',
    topologyHash: hash,
    frame: { id: 'test-frame', kind: 'LOCAL_METRIC', units: 'meters' },
    bounds: { minEastM: 0, maxEastM: 100, minNorthM: 0, maxNorthM: 100 },
    nodes: ['A', 'B'].map((id) => ({
      id,
      position: point(0, 0),
      districtId: 'D',
      incomingLaneIds: [],
      outgoingLaneIds: [],
    })),
    segments: [
      { id: 'R:A:B', endpoints: ['A', 'B'], footprint: polygon, laneIds: ['L:A>B', 'L:B>A'] },
    ],
    lanes: [
      {
        id: 'L:A>B',
        segmentId: 'R:A:B',
        fromNodeId: 'A',
        toNodeId: 'B',
        centerline: [point(0, 0), point(100, 0)],
        lengthM: 100,
        widthM: 3.2,
        speedLimitMps: 10,
      },
      {
        id: 'L:B>A',
        segmentId: 'R:A:B',
        fromNodeId: 'B',
        toNodeId: 'A',
        centerline: [point(100, 0), point(0, 0)],
        lengthM: 100,
        widthM: 3.2,
        speedLimitMps: 10,
      },
    ],
    movements: [],
    intersections: [{ nodeId: 'A', approaches: ['N'], movementIds: [], signalId: 'S:A' }],
    signals: [
      {
        id: 'S:A',
        nodeId: 'A',
        greenTicks: 120,
        amberTicks: 30,
        allRedTicks: 20,
        initialApproach: 'N',
        initialOffsetTicks: 0,
      },
    ],
    districts: [
      {
        id: 'D',
        name: 'Fixture district',
        polygon,
        landUse: 'MIXED',
        syntheticPopulationProfileId: null,
      },
    ],
    buildings: [],
  };
}
export function scenarioFixture() {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'shape-scenario',
    version: 'v1',
    name: 'Schema fixture',
    cityId: 'shape-city',
    cityVersion: 'v1',
    cityHash: hash,
    specVersion: SIMULATION_SPEC_VERSION,
    engineVersion: 'engine/contracts-only',
    tickDurationMs: FIXED_TIMESTEP_MS,
    seed: 104729,
    prngVersion: PRNG_VERSION,
    horizonTicks: 9000,
    warmupTicks: 1200,
    demand: {
      fleetSize: 100,
      firstDepartureSpreadTicks: 600,
      itineraryIntervalTicks: 1200,
      originWeights: [{ districtId: 'D', weight: 1 }],
      destinationWeights: [
        { originDistrictId: 'D', destinations: [{ districtId: 'D', weight: 1 }] },
      ],
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
  };
}
export function manifestFixture() {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    cityHash: hash,
    scenarioHash: hash,
    seed: 104729,
    prngVersion: PRNG_VERSION,
    fleetSize: 100,
    agents: Array.from({ length: 100 }, (_, i) => ({
      id: `A${i}`,
      initialGatewayId: 'A',
      profileId: 'passenger',
      itineraryTripIds: [],
    })),
    requests: [],
  };
}
export function checkpointFixture() {
  return {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    inputHashes: { city: hash, scenario: hash, manifest: hash },
    compatibility: {
      engineVersion: 'engine/contracts-only',
      engineBuildSha: 'a'.repeat(40),
      runtimeEngine: 'V8',
      runtimeVersion: 'test-only',
      platform: 'test-only',
      numericContractVersion: NUMERIC_CONTRACT_VERSION,
    },
    state: {
      tick: 0,
      topologyVersion: 0,
      agents: [],
      laneModes: [],
      footprints: [],
      signals: [],
      reservations: [],
      trips: [],
      sourceQueues: [],
      blockedRetries: [],
      pendingCommands: [],
      prngState: [1, 2, 3, 4],
      metricAccumulators: [],
      eventSequence: 0,
      eventPrefixDigest: hash,
      acceptedCommandCursor: 0,
    },
    stateHash: hash,
  };
}
