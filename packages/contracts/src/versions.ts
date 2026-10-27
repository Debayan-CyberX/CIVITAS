export const SIMULATION_SPEC_VERSION = 'sim-spec/1' as const;
export const CITY_SCHEMA_VERSION = 'city/1' as const;
export const SCENARIO_SCHEMA_VERSION = 'scenario/1' as const;
export const MANIFEST_SCHEMA_VERSION = 'manifest/1' as const;
export const PROTOCOL_VERSION = 'protocol/1' as const;
export const CHECKPOINT_SCHEMA_VERSION = 'checkpoint/1' as const;
export const ARTIFACT_SCHEMA_VERSION = 'artifact/1' as const;
export const METRIC_DEFINITION_VERSION = 'metrics/1' as const;
export const NUMERIC_CONTRACT_VERSION = 'kinematics/1' as const;
export const PRNG_VERSION = 'xoshiro128**-1.1/splitmix64-1' as const;
export const FIXED_TIMESTEP_MS = 100 as const;

// Import safety limits, not Aster fixture counts. Topology validation belongs to B02.
export const LIMITS = Object.freeze({
  artifactBytes: 32 * 1024 * 1024,
  nodes: 256,
  segments: 512,
  lanes: 1024,
  movements: 4096,
  districts: 64,
  buildings: 2048,
  agents: 300,
  tripRequests: 3000,
  polylinePoints: 256,
  commands: 10000,
  events: 200000,
  checkpoints: 1000,
});
