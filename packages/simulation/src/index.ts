export { FIXED_TIMESTEP_MS, SIMULATION_SPEC_VERSION } from '@civitas/contracts';

// Legacy B01 probe response, retained for its foundation compatibility test.
export const SIMULATION_IMPLEMENTATION = 'contracts-only' as const;

export * from './city/inputs';
export * from './city/aster';
export * from './city/compile';
export * from './city/geometry';
export * from './demand/prng';
export * from './demand/manifest';
export * from './routing/router';
export * from './replay/canonical';
export * from './engine';
export * from './traffic/dynamics';
export * from './traffic/footprints';
export * from './metrics/reducer';
export * from './metrics/encoding';
export * from './replay/session';
