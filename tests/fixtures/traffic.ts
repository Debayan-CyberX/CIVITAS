import { prepareAster, canonical, Router, compileCity } from '@civitas/simulation';
import { digest } from '../../scripts/runtime';

export async function controlledInputs(
  trips: { origin: string; destination: string; tick?: number }[] = [
    { origin: 'J10', destination: 'J12' },
  ],
) {
  const inputs = await prepareAster(digest, 100);
  const graph = compileCity(inputs.city);
  const router = new Router(graph);
  inputs.manifest.agents.forEach((a) => {
    a.itineraryTripIds = [];
  });
  inputs.manifest.requests = trips
    .map((t, i) => {
      const agent = inputs.manifest.agents[i]!;
      agent.initialGatewayId = t.origin as typeof agent.initialGatewayId;
      const id = `test-trip-${i}`;
      agent.itineraryTripIds = [id as (typeof agent.itineraryTripIds)[number]];
      return {
        id,
        agentId: agent.id,
        originGatewayId: t.origin,
        destinationGatewayId: t.destination,
        requestedDepartureTick: t.tick ?? 0,
        baseFreeFlowTicks: router.route(t.origin, t.destination)!.cost,
      } as (typeof inputs.manifest.requests)[number];
    })
    .sort((a, b) => a.requestedDepartureTick - b.requestedDepartureTick);
  inputs.hashes.scenario = await digest(canonical(inputs.scenario));
  inputs.manifest.scenarioHash = inputs.hashes.scenario;
  inputs.hashes.manifest = await digest(canonical(inputs.manifest));
  return inputs;
}
