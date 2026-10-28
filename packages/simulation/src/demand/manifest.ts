import { DemandManifestSchema, ScenarioSchema } from '@civitas/contracts';
import type { DemandManifest, Scenario } from '@civitas/contracts';
import type { CompiledCity } from '../city/compile';
import { Router } from '../routing/router';
import { randomStreams } from './prng';
import { ascii, required } from '../util';

export function generateManifest(
  graph: CompiledCity,
  scenario: Scenario,
  scenarioHash: string,
): DemandManifest {
  ScenarioSchema.parse(scenario);
  const { demand } = randomStreams(scenario.seed);
  const router = new Router(graph);
  const gateways = (district: string) =>
    graph.city.nodes.filter((n) => n.districtId === district).sort((a, b) => ascii(a.id, b.id));
  const weighted = (weights: readonly { districtId: string; weight: number }[]) => {
    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    if (total <= 0) throw new Error('Zero demand weight');
    let value = demand.integer(total);
    for (const weight of weights) {
      if (value < weight.weight) return weight.districtId;
      value -= weight.weight;
    }
    throw new Error('Invalid weight table');
  };
  const agents = [];
  const requests = [];
  for (let slot = 0; slot < scenario.demand.fleetSize; slot++) {
    const id = `V${slot.toString().padStart(3, '0')}`;
    const district = weighted(scenario.demand.originWeights);
    const starts = gateways(district);
    let origin = required(starts[demand.integer(starts.length)], 'origin gateway');
    const initialGatewayId = origin.id;
    const first = demand.integer(scenario.demand.firstDepartureSpreadTicks);
    const itineraryTripIds = [];
    for (
      let tick = first, ordinal = 0;
      tick < scenario.horizonTicks;
      tick += scenario.demand.itineraryIntervalTicks, ordinal++
    ) {
      const row = required(
        scenario.demand.destinationWeights.find((r) => r.originDistrictId === origin.districtId),
        'OD origin',
      );
      const destinations = gateways(weighted(row.destinations)).filter((n) => n.id !== origin.id);
      const destination = required(
        destinations[demand.integer(destinations.length)],
        'destination gateway',
      );
      const path = required(router.route(origin.id, destination.id) ?? undefined, 'base route');
      const tripId = `T:${id}:${ordinal}`;
      requests.push({
        id: tripId,
        agentId: id,
        requestedDepartureTick: tick,
        originGatewayId: origin.id,
        destinationGatewayId: destination.id,
        baseFreeFlowTicks: path.cost,
      });
      itineraryTripIds.push(tripId);
      origin = destination;
    }
    agents.push({
      id,
      initialGatewayId,
      profileId: required(scenario.vehicleProfiles[0], 'profile').id,
      itineraryTripIds,
    });
  }
  return DemandManifestSchema.parse({
    schemaVersion: 'manifest/1',
    cityHash: scenario.cityHash,
    scenarioHash,
    seed: scenario.seed,
    prngVersion: scenario.prngVersion,
    fleetSize: scenario.demand.fleetSize,
    agents,
    requests: requests.sort(
      (a, b) => a.requestedDepartureTick - b.requestedDepartureTick || ascii(a.id, b.id),
    ),
  });
}
export function validateManifest(
  graph: CompiledCity,
  scenario: Scenario,
  manifest: DemandManifest,
): void {
  DemandManifestSchema.parse(manifest);
  if (
    manifest.requests.some(
      (r, i) =>
        i > 0 &&
        (r.requestedDepartureTick < (manifest.requests[i - 1]?.requestedDepartureTick ?? 0) ||
          (r.requestedDepartureTick === manifest.requests[i - 1]?.requestedDepartureTick &&
            ascii(r.id, manifest.requests[i - 1]?.id ?? '') <= 0)),
    )
  )
    throw new Error('Requests must have stable departure/ID order');
  for (const profile of scenario.vehicleProfiles)
    if (
      graph.laneList.some((lane) => profile.lengthMm + profile.minimumGapMm > lane.lengthM * 1000)
    )
      throw new Error('Vehicle does not fit lane storage');
  if (
    manifest.fleetSize !== scenario.demand.fleetSize ||
    manifest.seed !== scenario.seed ||
    manifest.cityHash !== scenario.cityHash
  )
    throw new Error('Manifest scenario mismatch');
  const trips = new Map(manifest.requests.map((r) => [r.id, r]));
  const agents = new Set(manifest.agents.map((a) => a.id));
  if (trips.size !== manifest.requests.length || agents.size !== manifest.agents.length)
    throw new Error('Duplicate demand identities');
  const used = new Set<string>();
  const router = new Router(graph);
  for (const agent of manifest.agents) {
    if (
      !graph.nodes.has(agent.initialGatewayId) ||
      !scenario.vehicleProfiles.some((p) => p.id === agent.profileId)
    )
      throw new Error('Unknown agent gateway/profile');
    let gateway = agent.initialGatewayId;
    let priorTick = -1;
    for (const id of agent.itineraryTripIds) {
      const trip = required(trips.get(id), 'itinerary trip');
      if (
        used.has(id) ||
        trip.agentId !== agent.id ||
        trip.originGatewayId !== gateway ||
        trip.requestedDepartureTick <= priorTick ||
        trip.requestedDepartureTick >= scenario.horizonTicks
      )
        throw new Error('Broken itinerary');
      const path = router.route(trip.originGatewayId, trip.destinationGatewayId);
      if (!path || path.cost !== trip.baseFreeFlowTicks)
        throw new Error('Invalid frozen reference route cost');
      used.add(id);
      gateway = trip.destinationGatewayId;
      priorTick = trip.requestedDepartureTick;
    }
  }
  if (used.size !== trips.size) throw new Error('Orphan trip request');
}
