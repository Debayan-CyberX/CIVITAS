import {
  AcceptedCommandSchema,
  SubmittedCommandSchema,
  EngineStateSchema,
  ScenarioSchema,
  DemandManifestSchema,
} from '@civitas/contracts';
import type {
  AcceptedCommandInput,
  SubmittedCommandInput,
  EngineAgent,
  EngineEvent,
  EngineState,
  MetricFrame,
  PhysicalFootprint,
} from '@civitas/contracts';
import type { SimulationInputs } from './city/inputs';
import { compileCity } from './city/compile';
import { validateManifest } from './demand/manifest';
import { expandSeed } from './demand/prng';
import { Router } from './routing/router';
import { idm, advance, approachAccelerationBound } from './traffic/dynamics';
import { currentEdge, footprints } from './traffic/footprints';
import { ascii, required, clone, quantize } from './util';
import { canonical } from './replay/canonical';
import { metricSamples, tripMetrics } from './metrics/reducer';

export const TripStatus = { FUTURE: 0, WAITING: 1, SOURCE: 2, MOVING: 3, COMPLETE: 4 } as const;
export const BlockReason = { NONE: 0, NO_ROUTE: 1, SOURCE_FULL: 2, AGENT_BUSY: 3 } as const;
const eventOrder = [
  'CLOSURE_APPLIED',
  'CLOSURE_DRAIN_EXCEPTION',
  'LANE_REOPENED',
  'SIGNAL_CHANGED',
  'TRIP_DUE',
  'ROUTE_CHANGED',
  'ROUTE_BLOCKED',
  'RESERVATION_GRANTED',
  'TRIP_ARRIVED',
  'RESERVATION_RELEASED',
  'SOURCE_BLOCKED',
  'SOURCE_UNBLOCKED',
  'TRIP_ADMITTED',
  'SAFETY_DIAGNOSTIC',
];
type PendingEvent = Omit<EngineEvent, 'seq'>;
export interface Traversal {
  slot: number;
  edgeId: string;
  startMm: number;
  endMm: number;
  tick: number;
  timeUs: number;
}

export class Simulation {
  readonly inputs: SimulationInputs;
  readonly graph: ReturnType<typeof compileCity>;
  private readonly router: Router;
  private s: EngineState;
  private readonly agentIndex = new Map<string, number>();
  private readonly tripIndex = new Map<string, number>();
  private readonly eventLog: EngineEvent[] = [];
  private pendingEvents: PendingEvent[] = [];
  private closed = new Set<string>();
  private bodyMap = new Map<string, PhysicalFootprint[]>();
  private agentMap = new Map<string, EngineAgent>();
  private readonly districtOrder: string[];
  private readonly ledger: MetricFrame[] = [];
  private traversals: Traversal[] = [];
  private seenContributions = new Set<number>();
  private readonly profiles: SimulationInputs['scenario']['vehicleProfiles'];
  private dueAgentIndex: number[] = [];
  // Derived caches are reconstructed from the authenticated ring on restore.
  private rollingDistance: number[] = [];
  private rollingTime: number[] = [];

  constructor(
    inputs: SimulationInputs,
    restore?: { state: EngineState; events: EngineEvent[]; ledger: MetricFrame[] },
  ) {
    this.inputs = clone(inputs);
    this.inputs.scenario = ScenarioSchema.parse(inputs.scenario);
    this.inputs.manifest = DemandManifestSchema.parse(inputs.manifest);
    this.graph = compileCity(inputs.city);
    validateManifest(this.graph, this.inputs.scenario, this.inputs.manifest);
    this.router = new Router(this.graph);
    this.districtOrder = [...this.graph.districts.keys()].sort(ascii);
    const manifest = this.inputs.manifest;
    this.profiles = manifest.agents.map((agent) =>
      required(
        this.inputs.scenario.vehicleProfiles.find((profile) => profile.id === agent.profileId),
        'agent profile',
      ),
    );
    manifest.agents.forEach((a, i) => this.agentIndex.set(a.id, i));
    manifest.requests.forEach((t, i) => this.tripIndex.set(t.id, i));
    this.dueAgentIndex = manifest.requests.map((r) =>
      required(this.agentIndex.get(r.agentId), 'trip agent'),
    );
    this.s = restore
      ? EngineStateSchema.parse(clone(restore.state))
      : EngineStateSchema.parse({
          tick: 0,
          topologyVersion: 0,
          agents: manifest.agents.map((a, slot) => ({
            id: a.id,
            slot,
            location: { kind: 'PARKED', gatewayId: a.initialGatewayId },
            speedMmPerSecond: 0,
            accelerationMmPerSecondSquared: 0,
            activeTripId: null,
            itineraryCursor: 0,
            route: null,
            routeCursor: 0,
            reservationId: null,
            lowSpeedTicks: 0,
            firstEligibleTick: null,
            trail: [],
            retryAt: 0,
            routeTopology: 0,
            reservationStallTicks: 0,
          })),
          laneClosed: this.graph.laneList.map(() => false),
          signals: this.graph.city.intersections.map((i) => {
            const p = required(this.graph.signals.get(i.signalId), 'signal');
            return {
              id: i.signalId,
              approach: p.initialApproach,
              phase: 'GREEN',
              remainingTicks: p.greenTicks,
              cycleCount: 0,
            };
          }),
          reservations: [],
          trips: manifest.requests.map(() => [0, 0, -1, -1]),
          sourceQueues: this.graph.laneList.map(() => []),
          dueCursor: 0,
          commands: [],
          commandCursor: 0,
          nextCommandSeq: 0,
          eventSequence: 0,
          prngState: expandSeed(this.inputs.scenario.seed),
          metricFrames: [],
          totals: [0, 0, 0, 0, 0, 0, 0, 0],
        });
    this.agentMap = new Map(this.s.agents.map((a) => [a.id, a]));
    this.rollingDistance = this.graph.laneList.map((_, i) =>
      this.s.metricFrames.slice(-100).reduce((sum, f) => sum + (f[3][i] ?? 0), 0),
    );
    this.rollingTime = this.graph.laneList.map((_, i) =>
      this.s.metricFrames.slice(-100).reduce((sum, f) => sum + (f[4][i] ?? 0), 0),
    );
    this.updateClosed();
    if (restore) {
      this.eventLog.push(...clone(restore.events));
      this.ledger.push(...clone(restore.ledger));
    } else {
      for (let i = 0; i < this.s.signals.length; i++) {
        const signal = required(this.s.signals[i], 'signal');
        const plan = required(this.graph.signals.get(signal.id), 'plan');
        for (let offset = 0; offset < plan.initialOffsetTicks; offset++) {
          this.advanceSignal(i, 0, false);
          signal.remainingTicks = Math.max(0, signal.remainingTicks - 1);
        }
      }
      this.markDue(0);
      this.repairRoutes(0);
      this.rebuildQueues();
      this.flushEvents();
    }
    this.rebuildBodies();
    this.assertInvariants();
  }
  get tick() {
    return this.s.tick;
  }
  get horizon() {
    return this.inputs.scenario.horizonTicks;
  }
  state(): EngineState {
    return clone(this.s);
  }
  observationState() {
    // Publish only the fields needed by the worker view, without copying checkpoint history.
    return clone({
      tick: this.s.tick,
      agents: this.s.agents.map((agent) => ({
        slot: agent.slot,
        location: agent.location,
        speedMmPerSecond: agent.speedMmPerSecond,
      })),
      signals: this.s.signals,
      laneClosed: this.s.laneClosed,
    });
  }
  events(afterSequence = 0): EngineEvent[] {
    if (!Number.isInteger(afterSequence) || afterSequence < 0)
      throw new Error('Invalid event cursor');
    return clone(this.eventLog.slice(afterSequence));
  }
  metricLedger(): MetricFrame[] {
    return clone(this.ledger);
  }
  recentTraversals(): Traversal[] {
    return clone(this.traversals);
  }
  metrics(runId = 'headless') {
    return metricSamples(this.s, this.inputs, this.graph, runId);
  }
  tripMetrics(tripId: string, runId = 'headless') {
    return tripMetrics(this.s, this.inputs, tripId, runId);
  }
  stats() {
    return {
      tick: this.tick,
      fleet: this.s.agents.length,
      inNetwork: this.s.agents.filter((a) => currentEdge(a) !== null).length,
      sourceQueued: this.s.agents.filter((a) => a.location.kind === 'SOURCE_QUEUED').length,
      parked: this.s.agents.filter((a) => a.location.kind === 'PARKED').length,
      completed: this.s.totals[2],
      backlog: this.s.trips.filter((t) => t[0] === 1 || t[0] === 2).length,
      queued: this.s.agents.filter((a) => a.location.kind === 'ON_LANE' && a.lowSpeedTicks >= 10)
        .length,
      peakInNetwork: this.s.totals[4],
      peakTick: this.s.totals[5],
      safetyCorrections: this.s.totals[6],
      emergencyViolations: this.s.totals[7],
    };
  }
  accept(input: SubmittedCommandInput): AcceptedCommandInput {
    const command = SubmittedCommandSchema.parse(input);
    const previous = this.s.commands.find((c) => c.commandId === command.commandId);
    if (previous) {
      if (canonical(previous.intervention) !== canonical(command.intervention))
        throw new Error('Command ID reused with different payload');
      return clone(previous);
    }
    if (command.intervention.expectedTopologyVersion !== this.s.topologyVersion)
      throw new Error('Stale topology version');
    for (const id of command.intervention.laneIds)
      if (!this.graph.lanes.has(id)) throw new Error('Unknown lane intervention target');
    const acceptedTick = Math.max(this.tick + 1, command.desiredTick ?? this.tick + 1);
    if (acceptedTick > this.horizon) throw new Error('Command exceeds scenario horizon');
    const accepted = AcceptedCommandSchema.parse({
      commandId: command.commandId,
      acceptedTick,
      acceptedAtTick: this.tick,
      seq: this.s.nextCommandSeq,
      intervention: command.intervention,
    });
    // Submitted-only desiredTick is omitted from the durable accepted-command shape.
    this.s.nextCommandSeq++;
    this.s.commands.push(accepted);
    this.s.commands.sort((a, b) => a.acceptedTick - b.acceptedTick || a.seq - b.seq);
    return clone(accepted);
  }
  private emit(
    type: EngineEvent['type'],
    entityId: string,
    tick: number,
    reason: string | null = null,
    relatedIds: string[] = [],
    commandId: string | null = null,
  ) {
    this.pendingEvents.push({ type, entityId, tick, reason, relatedIds, commandId });
  }
  private flushEvents() {
    this.pendingEvents.sort(
      (a, b) =>
        a.tick - b.tick ||
        eventOrder.indexOf(a.type) - eventOrder.indexOf(b.type) ||
        ascii(a.entityId, b.entityId),
    );
    for (const event of this.pendingEvents)
      this.eventLog.push({ ...event, seq: this.s.eventSequence++ });
    this.pendingEvents = [];
  }
  private profile(agent: EngineAgent) {
    return required(this.profiles[agent.slot], 'agent profile');
  }
  private trip(agent: EngineAgent) {
    return required(
      this.tripIndex.get(required(agent.activeTripId ?? undefined, 'active trip')),
      'trip index',
    );
  }
  private updateClosed() {
    this.closed = new Set(
      this.graph.laneList.filter((_, i) => this.s.laneClosed[i]).map((l) => l.id),
    );
  }
  private applyCommands(k: number) {
    while (this.s.commandCursor < this.s.commands.length) {
      const command = required(this.s.commands[this.s.commandCursor], 'command');
      if (command.acceptedTick > k) break;
      if (command.acceptedTick !== k) throw new Error('Missed command transition');
      for (const id of command.intervention.laneIds) {
        const edge = required(this.graph.edges.get(id), 'closed lane');
        this.s.laneClosed[edge.index] = command.intervention.type === 'CLOSE_LANES';
        if (command.intervention.type === 'CLOSE_LANES')
          for (const agent of this.s.agents) {
            const occupied = agent.location.kind === 'ON_LANE' && agent.location.laneId === id;
            const committed = this.s.reservations.some(
              (r) => r.agentId === agent.id && r.outgoingLaneId === id,
            );
            if (occupied || committed)
              this.emit(
                'CLOSURE_DRAIN_EXCEPTION',
                agent.id,
                k,
                occupied
                  ? 'Existing lane occupant may drain'
                  : 'Prior committed reservation may drain',
                [id],
                command.commandId,
              );
          }
        this.emit(
          command.intervention.type === 'CLOSE_LANES' ? 'CLOSURE_APPLIED' : 'LANE_REOPENED',
          id,
          k,
          null,
          [],
          command.commandId,
        );
      }
      this.s.topologyVersion++;
      this.s.commandCursor++;
      this.updateClosed();
    }
  }
  private advanceSignal(index: number, k: number, log = true) {
    const signal = required(this.s.signals[index], 'signal');
    if (signal.remainingTicks > 0) return;
    const intersection = required(this.graph.city.intersections[index], 'intersection');
    const plan = required(this.graph.signals.get(signal.id), 'signal plan');
    if (signal.phase === 'GREEN') {
      signal.phase = 'AMBER';
      signal.remainingTicks = plan.amberTicks;
    } else if (signal.phase === 'AMBER') {
      signal.phase = 'ALL_RED';
      signal.remainingTicks = plan.allRedTicks;
    } else {
      if (this.s.reservations.some((r) => r.nodeId === intersection.nodeId)) return;
      const next =
        (intersection.approaches.indexOf(signal.approach) + 1) % intersection.approaches.length;
      signal.approach = required(intersection.approaches[next], 'next approach');
      signal.phase = 'GREEN';
      signal.remainingTicks = plan.greenTicks;
      if (next === 0) signal.cycleCount++;
    }
    if (log) this.emit('SIGNAL_CHANGED', signal.id, k, `${signal.approach}:${signal.phase}`);
  }
  private activate(agent: EngineAgent, k: number) {
    if (agent.activeTripId !== null) return;
    const specification = required(this.inputs.manifest.agents[agent.slot], 'agent itinerary');
    const id = specification.itineraryTripIds[agent.itineraryCursor];
    if (id === undefined) return;
    const index = required(this.tripIndex.get(id), 'itinerary');
    const request = required(this.inputs.manifest.requests[index], 'request');
    if (request.requestedDepartureTick > k) return;
    const row = required(this.s.trips[index], 'trip state');
    if (row[0] !== TripStatus.WAITING) throw new Error('Itinerary request not due');
    agent.activeTripId = id;
    agent.location = { kind: 'SOURCE_QUEUED', gatewayId: request.originGatewayId };
    agent.route = null;
    agent.routeCursor = 0;
    agent.retryAt = k;
    agent.routeTopology = this.s.topologyVersion;
    row[0] = TripStatus.SOURCE;
    row[1] = BlockReason.NONE;
  }
  private markDue(k: number) {
    while (this.s.dueCursor < this.inputs.manifest.requests.length) {
      const index = this.s.dueCursor;
      const request = required(this.inputs.manifest.requests[index], 'due request');
      if (request.requestedDepartureTick > k) break;
      const row = required(this.s.trips[index], 'due trip');
      row[0] = TripStatus.WAITING;
      row[1] = BlockReason.AGENT_BUSY;
      this.emit('TRIP_DUE', request.id, k);
      this.s.dueCursor++;
      this.activate(
        required(this.s.agents[required(this.dueAgentIndex[index], 'agent index')], 'agent'),
        k,
      );
    }
  }
  private repairRoutes(k: number) {
    for (const agent of this.s.agents) {
      if (agent.activeTripId === null) continue;
      const reservation = this.s.reservations.find((r) => r.id === agent.reservationId);
      const protectedEnd =
        reservation && agent.route
          ? agent.route.edges.findIndex(
              (e, i) => i >= agent.routeCursor && e.id === reservation.outgoingLaneId,
            )
          : agent.routeCursor;
      const prefix =
        reservation && agent.route
          ? agent.route.edges.slice(agent.routeCursor, Math.max(agent.routeCursor, protectedEnd))
          : [];
      const row = required(this.s.trips[this.trip(agent)], 'route trip');
      const invalid =
        agent.route?.edges
          .slice(agent.location.kind === 'SOURCE_QUEUED' ? 0 : protectedEnd + 1)
          .some((e) => e.kind === 'LANE' && this.closed.has(e.id)) ?? false;
      if (agent.route && !invalid && row[1] !== BlockReason.NO_ROUTE) {
        agent.routeTopology = this.s.topologyVersion;
        continue;
      }
      if (!invalid && agent.retryAt > k && agent.routeTopology === this.s.topologyVersion) continue;
      const request = required(this.inputs.manifest.requests[this.trip(agent)], 'route request');
      const current =
        reservation?.outgoingLaneId ??
        (agent.location.kind === 'ON_LANE' ? agent.location.laneId : undefined);
      const origin = current
        ? required(this.graph.lanes.get(current), 'current lane').toNodeId
        : request.originGatewayId;
      const path = this.router.route(
        origin,
        request.destinationGatewayId,
        this.closed,
        this.s.topologyVersion,
        current,
      );
      agent.retryAt = k + 10;
      agent.routeTopology = this.s.topologyVersion;
      if (path) {
        agent.route = {
          edges: [
            ...prefix,
            ...path.edges.map((id) => ({
              kind: required(this.graph.edges.get(id), 'route edge').kind,
              id,
            })),
          ],
          freeFlowTicks: path.cost,
          topologyVersion: this.s.topologyVersion,
        };
        agent.routeCursor = 0;
        if (row[1] === BlockReason.NO_ROUTE)
          this.emit('SOURCE_UNBLOCKED', agent.id, k, 'Route available');
        row[1] = BlockReason.NONE;
        this.emit('ROUTE_CHANGED', agent.id, k, null, path.edges.slice(0, 16));
      } else {
        agent.route = reservation
          ? {
              edges: [...prefix, { kind: 'LANE', id: reservation.outgoingLaneId }],
              freeFlowTicks: 0,
              topologyVersion: this.s.topologyVersion,
            }
          : null;
        agent.routeCursor = 0;
        if (row[1] !== BlockReason.NO_ROUTE)
          this.emit('ROUTE_BLOCKED', agent.id, k, 'No admissible route');
        row[1] = BlockReason.NO_ROUTE;
      }
    }
  }
  private rebuildBodies() {
    this.bodyMap.clear();
    for (const agent of this.s.agents)
      for (const body of footprints(this.graph, agent, this.profile(agent).lengthMm)) {
        if (body.frontMm === body.rearMm) continue;
        const list = this.bodyMap.get(body.edge.id) ?? [];
        list.push(body);
        this.bodyMap.set(body.edge.id, list);
      }
    for (const list of this.bodyMap.values())
      list.sort((a, b) => a.rearMm - b.rearMm || ascii(a.agentId, b.agentId));
  }
  private reserve(k: number) {
    const candidates = this.s.agents
      .filter((a) => a.location.kind === 'ON_LANE' && a.route !== null && a.reservationId === null)
      .sort((a, b) => (a.firstEligibleTick ?? k) - (b.firstEligibleTick ?? k) || ascii(a.id, b.id));
    for (const agent of candidates) {
      if (agent.location.kind !== 'ON_LANE' || !agent.route) continue;
      const lane = required(this.graph.lanes.get(agent.location.laneId), 'candidate lane');
      const edge = required(this.graph.edges.get(lane.id), 'lane edge');
      if (edge.lengthMm - agent.location.frontMm > 8000) continue;
      const frontMm = agent.location.frontMm;
      if (
        (this.bodyMap.get(lane.id) ?? []).some((b) => b.agentId !== agent.id && b.frontMm > frontMm)
      )
        continue;
      const next = agent.route.edges[agent.routeCursor + 1];
      if (!next || next.kind !== 'MOVEMENT') continue;
      const movement = required(this.graph.movements.get(next.id), 'planned movement');
      if (this.closed.has(movement.outgoingLaneId)) continue;
      agent.firstEligibleTick ??= k;
      const intersectionIndex = this.graph.city.intersections.findIndex(
        (i) => i.nodeId === lane.toNodeId,
      );
      const signal = required(this.s.signals[intersectionIndex], 'candidate signal');
      const from = required(this.graph.nodes.get(lane.fromNodeId), 'approach node');
      const node = required(this.graph.nodes.get(lane.toNodeId), 'junction node');
      const approach =
        from.position.northM > node.position.northM
          ? 'N'
          : from.position.eastM > node.position.eastM
            ? 'E'
            : from.position.northM < node.position.northM
              ? 'S'
              : 'W';
      if (
        signal.phase !== 'GREEN' ||
        signal.approach !== approach ||
        this.s.reservations.some((r) => r.nodeId === lane.toNodeId)
      )
        continue;
      const profile = this.profile(agent);
      const tail = (this.bodyMap.get(movement.outgoingLaneId) ?? [])[0]?.rearMm ?? Infinity;
      if (
        tail < profile.lengthMm + profile.minimumGapMm ||
        this.s.reservations.some((r) => r.outgoingLaneId === movement.outgoingLaneId)
      )
        continue;
      const id = `Q:${k}:${agent.id}`;
      this.s.reservations.push({
        id,
        nodeId: lane.toNodeId,
        agentId: agent.id,
        movementId: movement.id,
        outgoingLaneId: movement.outgoingLaneId,
        committedTick: k,
        heldEntranceMm: profile.lengthMm + profile.minimumGapMm,
      });
      agent.reservationId = id;
      agent.firstEligibleTick = null;
      this.emit('RESERVATION_GRANTED', agent.id, k, id, [movement.id, movement.outgoingLaneId]);
    }
    this.s.reservations.sort((a, b) => ascii(a.nodeId, b.nodeId));
  }
  private releaseReservations(k: number) {
    this.s.reservations = this.s.reservations.filter((reservation) => {
      const agent = required(this.agentMap.get(reservation.agentId), 'reservation owner');
      const cleared =
        agent.location.kind === 'PARKED' ||
        (agent.location.kind === 'ON_LANE' &&
          agent.location.laneId === reservation.outgoingLaneId &&
          agent.location.frontMm >= this.profile(agent).lengthMm);
      if (cleared) {
        agent.reservationId = null;
        agent.reservationStallTicks = 0;
        this.emit('RESERVATION_RELEASED', agent.id, k, reservation.id);
        return false;
      }
      return true;
    });
  }
  private leader(
    agent: EngineAgent,
  ): { gap: number; speed: number; barrierGap?: number } | undefined {
    const edgeId = currentEdge(agent);
    if (!edgeId) return;
    const position =
      agent.location.kind === 'ON_LANE' || agent.location.kind === 'ON_CONNECTOR'
        ? agent.location.frontMm
        : 0;
    let best: { gap: number; speed: number; barrierGap?: number } | undefined;
    const scan = (id: string, offset: number) => {
      for (const body of this.bodyMap.get(id) ?? []) {
        if (body.agentId === agent.id) continue;
        const gap = offset + body.rearMm;
        if (gap >= -1 && (!best || gap < best.gap))
          best = {
            gap: Math.max(0, gap),
            speed: required(this.agentMap.get(body.agentId), 'leader').speedMmPerSecond,
          };
        // Rear intervals are ordered; later bodies cannot be a nearer physical leader.
        if (gap >= -1) break;
      }
    };
    scan(edgeId, -position);
    let offset = required(this.graph.edges.get(edgeId), 'current edge').lengthMm - position;
    if (agent.route)
      for (let cursor = agent.routeCursor + 1; cursor < agent.route.edges.length; cursor++) {
        if (best && offset > best.gap) break;
        const next = required(agent.route.edges[cursor], 'future route edge');
        scan(next.id, offset);
        offset += required(this.graph.edges.get(next.id), 'future edge').lengthMm;
        if (offset > 200000) break;
      }
    if (agent.location.kind === 'ON_LANE') {
      const lane = required(this.graph.lanes.get(agent.location.laneId), 'lane');
      const request = required(this.inputs.manifest.requests[this.trip(agent)], 'trip');
      const reservation = this.s.reservations.find(
        (r) =>
          r.id === agent.reservationId &&
          r.movementId === agent.route?.edges[agent.routeCursor + 1]?.id,
      );
      if (lane.toNodeId !== request.destinationGatewayId && !reservation) {
        const gap = required(this.graph.edges.get(lane.id), 'stop edge').lengthMm - position;
        if (!best) best = { gap, speed: 0 };
        else best.barrierGap = gap;
      }
    }
    return best;
  }
  private motion(k: number): void {
    this.traversals = [];
    this.seenContributions.clear();
    const proposals = this.s.agents.map((agent) => {
      const id = currentEdge(agent);
      if (!id) return null;
      const edge = required(this.graph.edges.get(id), 'motion edge');
      const p = this.profile(agent);
      const leader = this.leader(agent);
      const position =
        agent.location.kind === 'ON_LANE' || agent.location.kind === 'ON_CONNECTOR'
          ? agent.location.frontMm
          : 0;
      const next = agent.route?.edges[agent.routeCursor + 1];
      const nextEdge = next ? this.graph.edges.get(next.id) : undefined;
      let target = edge.limit;
      if (edge.kind === 'LANE' && nextEdge?.kind === 'MOVEMENT')
        target = Math.min(
          target,
          Math.sqrt(
            nextEdge.limit ** 2 +
              2 * p.comfortableBrakingMmPerSecondSquared * (edge.lengthMm - position),
          ),
        );
      const desired = idm(agent.speedMmPerSecond, target, leader?.gap, leader?.speed ?? 0, {
        a: p.accelerationMmPerSecondSquared,
        b: p.comfortableBrakingMmPerSecondSquared,
        headway: p.desiredHeadwayMs / 1000,
        minimumGap: p.minimumGapMm,
      });
      let acceleration = Math.min(p.accelerationMmPerSecondSquared, desired);
      if (leader?.barrierGap !== undefined)
        acceleration = Math.min(
          acceleration,
          idm(agent.speedMmPerSecond, target, leader.barrierGap, 0, {
            a: p.accelerationMmPerSecondSquared,
            b: p.comfortableBrakingMmPerSecondSquared,
            headway: p.desiredHeadwayMs / 1000,
            minimumGap: p.minimumGapMm,
          }),
        );
      if (edge.kind === 'LANE' && nextEdge?.kind === 'MOVEMENT')
        acceleration = Math.min(
          acceleration,
          approachAccelerationBound(
            agent.speedMmPerSecond,
            edge.lengthMm - position,
            nextEdge.limit,
            p.comfortableBrakingMmPerSecondSquared,
          ),
        );
      if (acceleration < -p.emergencyBrakingMmPerSecondSquared - 1) {
        this.s.totals[7]++;
        this.emit('SAFETY_DIAGNOSTIC', agent.id, k, 'Required braking exceeds emergency limit');
      }
      acceleration = Math.max(-p.emergencyBrakingMmPerSecondSquared, acceleration);
      acceleration = quantize(acceleration);
      const proposed = advance(agent.speedMmPerSecond, acceleration);
      let moved = proposed.distance;
      let speed = proposed.speed;
      // A leader never moves backwards: its prior rear is a conservative hard safety boundary.
      if (leader) {
        const allowed = Math.max(
          0,
          Math.floor(Math.min(leader.gap, leader.barrierGap ?? Infinity)),
        );
        if (moved > allowed) {
          if (moved - allowed > 1) {
            this.s.totals[6]++;
            this.emit('SAFETY_DIAGNOSTIC', agent.id, k, 'Non-overlap projection');
          }
          moved = allowed;
          speed = Math.min(
            speed,
            Math.max(0, quantize((2 * moved) / 0.1 - agent.speedMmPerSecond)),
          );
        }
      }
      return {
        agent,
        id,
        position,
        moved,
        speed,
        acceleration,
        originalSpeed: agent.speedMmPerSecond,
      };
    });
    const frame: MetricFrame = [
      k,
      0,
      0,
      this.graph.laneList.map(() => 0),
      this.graph.laneList.map(() => 0),
      this.graph.laneList.map(() => 0),
      this.districtOrder.map(() => 0),
      this.districtOrder.map(() => 0),
      0,
      0,
      0,
      this.graph.laneList.map(() => 0),
      this.districtOrder.map(() => 0),
      [],
    ];
    for (const proposal of proposals) {
      if (!proposal) continue;
      const { agent, id, position, acceleration, originalSpeed } = proposal;
      const edge = required(this.graph.edges.get(id), 'commit edge');
      frame[10]++;
      const request = required(this.inputs.manifest.requests[this.trip(agent)], 'motion trip');
      const terminal =
        edge.kind === 'LANE' &&
        required(this.graph.lanes.get(id), 'terminal lane').toNodeId ===
          request.destinationGatewayId;
      let moved = proposal.moved;
      let arrived = false;
      if (terminal && position + moved >= edge.lengthMm) {
        moved = edge.lengthMm - position;
        arrived = true;
      }
      const timeAt = (d: number) => {
        if (d === 0) return 0;
        if (Math.abs(acceleration) < 0.001) return Math.min(0.1, d / Math.max(originalSpeed, 1));
        return Math.max(
          0,
          Math.min(
            0.1,
            (Math.sqrt(Math.max(0, originalSpeed ** 2 + 2 * acceleration * d)) - originalSpeed) /
              acceleration,
          ),
        );
      };
      const elapsed = arrived ? timeAt(moved) : 0.1;
      const boundaryDistance = edge.lengthMm - position;
      const firstDistance = Math.min(moved, boundaryDistance);
      const firstTime =
        moved >= boundaryDistance && boundaryDistance >= 0
          ? Math.min(elapsed, timeAt(boundaryDistance))
          : elapsed;
      this.recordTraversal(
        frame,
        agent,
        id,
        position,
        position + firstDistance,
        quantize(firstTime * 1000000),
        k,
        timeAt,
      );
      if (position + moved >= edge.lengthMm) {
        if (edge.kind === 'LANE') {
          frame[5][edge.index] = (frame[5][edge.index] ?? 0) + 1;
          frame[13].push([agent.slot, edge.index, quantize(firstTime * 1000000)]);
        }
        if (arrived) {
          const row = required(this.s.trips[this.trip(agent)], 'arrival state');
          row[0] = TripStatus.COMPLETE;
          row[1] = 0;
          row[3] = k;
          this.s.totals[2]++;
          this.emit('TRIP_ARRIVED', request.id, k, null, [agent.id]);
          agent.activeTripId = null;
          agent.location = { kind: 'PARKED', gatewayId: request.destinationGatewayId };
          agent.itineraryCursor++;
          agent.route = null;
          agent.routeCursor = 0;
          agent.trail = [];
          agent.speedMmPerSecond = 0;
          agent.accelerationMmPerSecondSquared = 0;
          agent.lowSpeedTicks = 0;
        } else {
          const next = agent.route?.edges[agent.routeCursor + 1];
          if (!next) throw new Error('No route at edge crossing');
          const nextEdge = required(this.graph.edges.get(next.id), 'crossed edge');
          if (
            nextEdge.kind === 'MOVEMENT' &&
            !this.s.reservations.some((r) => r.agentId === agent.id && r.movementId === next.id)
          )
            throw new Error('Unreserved connector entry');
          const remainder = position + moved - edge.lengthMm;
          if (remainder >= nextEdge.lengthMm)
            throw new Error('More than one boundary in a transition');
          agent.trail.push(id);
          agent.trail = agent.trail.slice(-3);
          agent.routeCursor++;
          agent.location =
            nextEdge.kind === 'LANE'
              ? { kind: 'ON_LANE', laneId: next.id, frontMm: remainder }
              : { kind: 'ON_CONNECTOR', movementId: next.id, frontMm: remainder };
          this.recordTraversal(
            frame,
            agent,
            next.id,
            0,
            remainder,
            Math.max(0, quantize(elapsed * 1000000) - quantize(firstTime * 1000000)),
            k,
            (d) => timeAt(firstDistance + d) - firstTime,
          );
          agent.speedMmPerSecond = proposal.speed;
          agent.accelerationMmPerSecondSquared = acceleration;
        }
      } else {
        if (agent.location.kind !== 'ON_LANE' && agent.location.kind !== 'ON_CONNECTOR')
          throw new Error('Invalid moving location');
        agent.location.frontMm = position + moved;
        agent.speedMmPerSecond = proposal.speed;
        agent.accelerationMmPerSecondSquared = acceleration;
      }
      agent.lowSpeedTicks =
        agent.location.kind === 'ON_LANE' && agent.speedMmPerSecond < 500
          ? agent.lowSpeedTicks + 1
          : 0;
      if (agent.reservationId !== null) {
        agent.reservationStallTicks = moved === 0 ? agent.reservationStallTicks + 1 : 0;
        if (agent.reservationStallTicks === 100)
          this.emit('SAFETY_DIAGNOSTIC', agent.id, k, 'Reservation stalled for 100 ticks');
      }
    }
    this.s.metricFrames.push(frame);
    if (this.s.metricFrames.length > 700) this.s.metricFrames.shift();
    this.ledger.push(frame);
    this.s.totals[0] += frame[1];
    this.s.totals[1] += frame[2];
  }
  private recordTraversal(
    frame: MetricFrame,
    agent: EngineAgent,
    id: string,
    start: number,
    end: number,
    timeUs: number,
    k: number,
    timeAt: (distanceMm: number) => number,
  ) {
    const edge = required(this.graph.edges.get(id), 'traversal edge');
    const moved = end - start;
    frame[1] += moved;
    frame[2] += timeUs;
    if (edge.kind === 'LANE') {
      frame[3][edge.index] = (frame[3][edge.index] ?? 0) + moved;
      frame[4][edge.index] = (frame[4][edge.index] ?? 0) + timeUs;
    }
    if (edge.kind === 'LANE' && timeUs > 0) {
      const key =
        agent.slot * (this.graph.laneList.length + this.districtOrder.length) + edge.index;
      if (!this.seenContributions.has(key)) {
        this.seenContributions.add(key);
        frame[11][edge.index] = (frame[11][edge.index] ?? 0) + 1;
      }
    }
    if (edge.districtCuts.length === 1) {
      const d = this.districtOrder.indexOf(
        required(edge.districtCuts[0], 'edge district').districtId,
      );
      frame[6][d] = (frame[6][d] ?? 0) + moved;
      frame[7][d] = (frame[7][d] ?? 0) + timeUs;
      this.countDistrict(frame, agent.slot, d, timeUs);
    } else if (moved === 0) {
      const cut = required(
        edge.districtCuts.find((c) => start >= c.startMm && start <= c.endMm) ??
          edge.districtCuts.at(-1),
        'stationary district',
      );
      const d = this.districtOrder.indexOf(cut.districtId);
      frame[7][d] = (frame[7][d] ?? 0) + timeUs;
      this.countDistrict(frame, agent.slot, d, timeUs);
    } else {
      let allocated = 0;
      const portions = edge.districtCuts
        .map((cut) => ({
          cut,
          amount: Math.max(0, Math.min(end, cut.endMm) - Math.max(start, cut.startMm)),
        }))
        .filter((p) => p.amount > 0);
      for (const [index, { cut, amount }] of portions.entries()) {
        const d = this.districtOrder.indexOf(cut.districtId);
        const portion =
          index === portions.length - 1
            ? timeUs - allocated
            : Math.max(
                0,
                Math.min(
                  timeUs - allocated,
                  quantize(timeAt(Math.min(end, cut.endMm) - start) * 1000000) - allocated,
                ),
              );
        allocated += portion;
        frame[6][d] = (frame[6][d] ?? 0) + amount;
        frame[7][d] = (frame[7][d] ?? 0) + portion;
        this.countDistrict(frame, agent.slot, d, timeUs);
      }
    }
    this.traversals.push({
      slot: agent.slot,
      edgeId: id,
      startMm: start,
      endMm: end,
      tick: k,
      timeUs,
    });
  }
  private countDistrict(frame: MetricFrame, slot: number, d: number, timeUs: number) {
    const key =
      slot * (this.graph.laneList.length + this.districtOrder.length) +
      this.graph.laneList.length +
      d;
    if (timeUs > 0 && !this.seenContributions.has(key)) {
      this.seenContributions.add(key);
      frame[12][d] = (frame[12][d] ?? 0) + 1;
    }
  }
  private rebuildQueues() {
    this.s.sourceQueues = this.graph.laneList.map(() => []);
    for (const agent of this.s.agents) {
      if (agent.location.kind !== 'SOURCE_QUEUED' || !agent.route) continue;
      const first = required(agent.route.edges[0], 'source first edge');
      const edge = required(this.graph.edges.get(first.id), 'source lane');
      this.s.sourceQueues[edge.index]?.push(this.trip(agent));
    }
    for (const queue of this.s.sourceQueues)
      queue.sort((a, b) => {
        const x = required(this.inputs.manifest.requests[a], 'queue request');
        const y = required(this.inputs.manifest.requests[b], 'queue request');
        return x.requestedDepartureTick - y.requestedDepartureTick || ascii(x.id, y.id);
      });
  }
  private admit(k: number) {
    this.rebuildBodies();
    this.rebuildQueues();
    for (const [laneIndex, queue] of this.s.sourceQueues.entries()) {
      if (this.s.laneClosed[laneIndex]) continue;
      const tripIndex = queue[0];
      if (tripIndex === undefined) continue;
      const request = required(this.inputs.manifest.requests[tripIndex], 'queued request');
      const agent = required(this.agentMap.get(request.agentId), 'source agent');
      const lane = required(this.graph.laneList[laneIndex], 'source lane');
      const profile = this.profile(agent);
      const first = (this.bodyMap.get(lane.id) ?? [])[0];
      const held = this.s.reservations.some((r) => r.outgoingLaneId === lane.id);
      if (held || (first && first.rearMm < profile.lengthMm + profile.minimumGapMm)) {
        const row = required(this.s.trips[tripIndex], 'source trip');
        if (row[1] !== BlockReason.SOURCE_FULL)
          this.emit('SOURCE_BLOCKED', agent.id, k, 'Source lane full');
        row[1] = BlockReason.SOURCE_FULL;
        continue;
      }
      const row = required(this.s.trips[tripIndex], 'admitted trip');
      if (row[1] !== 0) this.emit('SOURCE_UNBLOCKED', agent.id, k, 'Source space available');
      row[0] = TripStatus.MOVING;
      row[1] = 0;
      row[2] = k;
      agent.location = { kind: 'ON_LANE', laneId: lane.id, frontMm: profile.lengthMm };
      agent.speedMmPerSecond = 0;
      agent.accelerationMmPerSecondSquared = 0;
      agent.lowSpeedTicks = 0;
      agent.trail = [];
      queue.shift();
      this.emit('TRIP_ADMITTED', request.id, k, null, [agent.id, lane.id]);
      // Admission fits a complete body before the previous first rear. Other bodies did not move.
      const bodies = this.bodyMap.get(lane.id) ?? [];
      bodies.unshift({
        agentId: agent.id,
        edge: { kind: 'LANE', id: lane.id },
        rearMm: 0,
        frontMm: profile.lengthMm,
      });
      this.bodyMap.set(lane.id, bodies);
    }
  }
  private completeFrame() {
    const frame = required(this.s.metricFrames.at(-1), 'metric frame');
    let queued = 0;
    for (const agent of this.s.agents)
      if (agent.location.kind === 'ON_LANE' && agent.lowSpeedTicks >= 10) queued++;
    this.s.totals[3] += queued;
    const expired = this.s.metricFrames.at(-101);
    for (const [i, lane] of this.graph.laneList.entries()) {
      const distance = (this.rollingDistance[i] ?? 0) + (frame[3][i] ?? 0) - (expired?.[3][i] ?? 0);
      const time = (this.rollingTime[i] ?? 0) + (frame[4][i] ?? 0) - (expired?.[4][i] ?? 0);
      this.rollingDistance[i] = distance;
      this.rollingTime[i] = time;
      if (time > 0) {
        frame[8]++;
        if (distance / (time / 1000000) < lane.speedLimitMps * 1000 * 0.5) frame[9]++;
      }
    }
    const active = this.s.agents.filter((a) => currentEdge(a) !== null).length;
    if (active > this.s.totals[4]) {
      this.s.totals[4] = active;
      this.s.totals[5] = this.s.tick;
    }
  }
  step(): void {
    if (this.tick >= this.horizon) throw new Error('Scenario horizon reached');
    const k = this.tick + 1;
    this.applyCommands(k);
    this.releaseReservations(k);
    for (let i = 0; i < this.s.signals.length; i++) this.advanceSignal(i, k);
    this.markDue(k);
    this.repairRoutes(k);
    // The prior transition's body index stays valid until motion commits.
    this.reserve(k);
    this.motion(k);
    this.releaseReservations(k);
    for (const agent of this.s.agents) this.activate(agent, k);
    this.admit(k);
    for (const signal of this.s.signals)
      signal.remainingTicks = Math.max(0, signal.remainingTicks - 1);
    this.s.tick = k;
    this.completeFrame();
    this.flushEvents();
    this.assertInvariants();
  }
  assertInvariants(): void {
    if (
      this.s.agents.length !== this.inputs.manifest.fleetSize ||
      this.s.trips.length !== this.inputs.manifest.requests.length
    )
      throw new Error('Conservation: cardinality');
    const active = new Set<string>();
    let moving = 0,
      source = 0;
    for (const agent of this.s.agents) {
      if (this.agentIndex.get(agent.id) !== agent.slot || this.s.agents[agent.slot] !== agent)
        throw new Error('Invalid stable agent slot');
      if (!Number.isInteger(agent.speedMmPerSecond) || agent.speedMmPerSecond < 0)
        throw new Error('Invalid velocity');
      const edgeId = currentEdge(agent);
      if (edgeId) {
        moving++;
        const edge = required(this.graph.edges.get(edgeId), 'occupied edge');
        if (agent.speedMmPerSecond > edge.limit + 1) throw new Error('Edge speed limit exceeded');
        const p =
          agent.location.kind === 'ON_LANE' || agent.location.kind === 'ON_CONNECTOR'
            ? agent.location.frontMm
            : -1;
        if (!Number.isInteger(p) || p < 0 || p >= edge.lengthMm)
          throw new Error('Position outside primary edge');
        if (
          agent.location.kind === 'ON_CONNECTOR' &&
          !this.s.reservations.some((r) => r.agentId === agent.id && r.movementId === edgeId)
        )
          throw new Error('Unowned connector');
      }
      if (agent.location.kind === 'SOURCE_QUEUED') source++;
      if (agent.activeTripId !== null) {
        if (active.has(agent.activeTripId)) throw new Error('Duplicate active trip');
        active.add(agent.activeTripId);
        const row = required(this.s.trips[this.trip(agent)], 'active trip state');
        if (row[0] !== (edgeId ? TripStatus.MOVING : TripStatus.SOURCE))
          throw new Error('Agent/trip lifecycle mismatch');
      } else if (agent.location.kind !== 'PARKED') throw new Error('Orphan vehicle');
    }
    const statusCounts = [0, 0, 0, 0, 0];
    for (const trip of this.s.trips) statusCounts[trip[0]] = (statusCounts[trip[0]] ?? 0) + 1;
    if (
      statusCounts[3] !== moving ||
      statusCounts[2] !== source ||
      statusCounts[4] !== this.s.totals[2] ||
      this.s.dueCursor !==
        (statusCounts[1] ?? 0) +
          (statusCounts[2] ?? 0) +
          (statusCounts[3] ?? 0) +
          (statusCounts[4] ?? 0)
    )
      throw new Error('Conservation: requests');
    const owners = new Set<string>();
    for (const r of this.s.reservations) {
      if (owners.has(r.nodeId)) throw new Error('Conflicting reservation');
      owners.add(r.nodeId);
      if (required(this.agentMap.get(r.agentId), 'owner').reservationId !== r.id)
        throw new Error('Reservation identity mismatch');
    }
    for (const list of this.bodyMap.values())
      for (let i = 1; i < list.length; i++) {
        const a = required(list[i - 1], 'body');
        const b = required(list[i], 'body');
        if (a.agentId !== b.agentId && a.frontMm > b.rearMm)
          throw new Error(`Overlapping footprints ${a.agentId}/${b.agentId}`);
      }
    if (this.eventLog.length !== this.s.eventSequence) throw new Error('Event sequence gap');
  }
}
