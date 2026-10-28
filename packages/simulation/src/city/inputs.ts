import type { CityDefinition, DemandManifest, Scenario } from '@civitas/contracts';
import { canonical } from '../replay/canonical';
import type { Digest } from '../replay/canonical';
import { createAsterCity, createMorningScenario, topologyPayload } from './aster';
import { compileCity } from './compile';
import { generateManifest, validateManifest } from '../demand/manifest';

export interface SimulationInputs {
  city: CityDefinition;
  scenario: Scenario;
  manifest: DemandManifest;
  hashes: { city: string; scenario: string; manifest: string };
}
export async function prepareAster(
  digest: Digest,
  fleet = 200,
  seed = 104729,
): Promise<SimulationInputs> {
  const city = await createAsterCity(digest);
  const graph = compileCity(city);
  const cityHash = await digest(canonical(city));
  const scenario = createMorningScenario(city, cityHash, fleet, seed);
  const scenarioHash = await digest(canonical(scenario));
  const manifest = generateManifest(graph, scenario, scenarioHash);
  validateManifest(graph, scenario, manifest);
  return {
    city,
    scenario,
    manifest,
    hashes: { city: cityHash, scenario: scenarioHash, manifest: await digest(canonical(manifest)) },
  };
}
export async function verifyInputs(inputs: SimulationInputs, digest: Digest): Promise<void> {
  const graph = compileCity(inputs.city);
  validateManifest(graph, inputs.scenario, inputs.manifest);
  const cityHash = await digest(canonical(inputs.city));
  const scenarioHash = await digest(canonical(inputs.scenario));
  const manifestHash = await digest(canonical(inputs.manifest));
  if (
    cityHash !== inputs.hashes.city ||
    scenarioHash !== inputs.hashes.scenario ||
    manifestHash !== inputs.hashes.manifest ||
    inputs.scenario.cityHash !== cityHash ||
    inputs.manifest.cityHash !== cityHash ||
    inputs.manifest.scenarioHash !== scenarioHash ||
    inputs.scenario.cityId !== inputs.city.id ||
    inputs.scenario.cityVersion !== inputs.city.version ||
    (await digest(canonical(topologyPayload(inputs.city)))) !== inputs.city.topologyHash
  )
    throw new Error('Input content hash/version mismatch');
}
