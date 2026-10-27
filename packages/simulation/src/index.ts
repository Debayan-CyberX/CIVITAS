export { FIXED_TIMESTEP_MS, SIMULATION_SPEC_VERSION } from '@civitas/contracts';

// B01 exposes contracts only. No engine or mutable simulation state exists yet.
export const SIMULATION_IMPLEMENTATION = 'contracts-only' as const;
