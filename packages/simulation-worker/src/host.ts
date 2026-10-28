import { EngineCommandSchema, EngineObservationSchema } from '@civitas/contracts';
import type { EngineObservation, EngineSnapshot, RuntimeIdentity } from '@civitas/contracts';
import { RunSession, canonical } from '@civitas/simulation';
import type { Digest, SimulationInputs, Traversal } from '@civitas/simulation';

export interface HostClock {
  now(): number;
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
}
type Payload<T = EngineObservation> = T extends EngineObservation
  ? Omit<T, 'protocolVersion' | 'runId' | 'epoch' | 'requestId'>
  : never;
export class WorkerHost {
  private session: RunSession | null = null;
  private epoch = 0;
  private runId = 'uninitialized';
  private running = false;
  private speed: 0.25 | 1 | 2 | 4 = 1;
  private lastWall = 0;
  private debt = 0;
  private timer: unknown;
  private serial: Promise<void> = Promise.resolve();
  private disposed = false;
  private lastSnapshot = -Infinity;
  private lastMetrics = -Infinity;
  private eventCursor = 0;
  private pendingTraversals: Traversal[] = [];
  private statusWall = 0;
  private statusTick = 0;
  constructor(
    private readonly clock: HostClock,
    private readonly digest: Digest,
    private readonly identity: RuntimeIdentity,
    private readonly send: (message: EngineObservation) => void,
  ) {}
  receive(raw: unknown): Promise<void> {
    this.serial = this.serial
      .then(() => this.handle(raw))
      .catch((error: unknown) => {
        this.running = false;
        this.emit('transport', {
          type: 'ERROR',
          code: 'INTERNAL_ERROR',
          reason: this.reason(error),
        });
      });
    return this.serial;
  }
  private reason(error: unknown) {
    return (
      (error instanceof Error ? error.message : String(error)).slice(0, 512) || 'Unknown error'
    );
  }
  private emit(requestId: string, payload: Payload) {
    this.send(
      EngineObservationSchema.parse({
        protocolVersion: 'protocol/2',
        runId: this.runId,
        epoch: this.epoch,
        requestId,
        ...payload,
      }),
    );
  }
  private stop() {
    this.running = false;
    if (this.timer !== undefined) this.clock.cancel(this.timer);
    this.timer = undefined;
    this.debt = 0;
  }
  dispose() {
    this.stop();
    this.disposed = true;
  }
  private snapshot(): EngineSnapshot {
    if (!this.session) throw new Error('Worker is not initialized');
    const e = this.session.engine;
    const s = e.observationState();
    const agents: EngineSnapshot['agents'] = s.agents.map((a) => {
      const location = a.location;
      return location.kind === 'ON_LANE'
        ? [
            a.slot,
            2,
            e.graph.edges.get(location.laneId)?.index ?? 0,
            location.frontMm,
            a.speedMmPerSecond,
          ]
        : location.kind === 'ON_CONNECTOR'
          ? [
              a.slot,
              3,
              e.graph.edges.get(location.movementId)?.index ?? 0,
              location.frontMm,
              a.speedMmPerSecond,
            ]
          : [
              a.slot,
              location.kind === 'PARKED' ? 0 : 1,
              e.graph.city.nodes.findIndex((n) => n.id === location.gatewayId),
              0,
              0,
            ];
    });
    const traversals: EngineSnapshot['traversals'] = this.pendingTraversals.map((t) => {
      const edge = e.graph.edges.get(t.edgeId);
      if (!edge) throw new Error('Invalid snapshot edge');
      return [t.slot, edge.kind === 'LANE' ? 0 : 1, edge.index, t.startMm, t.endMm, t.tick];
    });
    this.pendingTraversals = [];
    return {
      tick: e.tick,
      simTimeMs: e.tick * 100,
      agents,
      traversals,
      signals: s.signals.map((signal, i) => [
        i,
        signal.phase === 'GREEN' ? 0 : signal.phase === 'AMBER' ? 1 : 2,
        ['N', 'E', 'S', 'W'].indexOf(signal.approach),
        signal.remainingTicks,
      ]),
      laneClosed: s.laneClosed,
    };
  }
  private publish(force = false) {
    if (!this.session) return;
    const now = this.clock.now();
    const e = this.session.engine;
    if (force || (e.tick % 2 === 0 && now - this.lastSnapshot >= 50)) {
      this.emit('stream', { type: 'SNAPSHOT', snapshot: this.snapshot() });
      this.lastSnapshot = now;
    }
    if (force || (e.tick % 10 === 0 && now - this.lastMetrics >= 250)) {
      this.emit('stream', { type: 'METRICS', samples: e.metrics(this.runId) });
      this.lastMetrics = now;
    }
    const events = e.events(this.eventCursor);
    for (let i = 0; i < events.length; i += 10000)
      this.emit('stream', { type: 'EVENT_BATCH', events: events.slice(i, i + 10000) });
    this.eventCursor += events.length;
  }
  private async transition() {
    if (!this.session) throw new Error('Worker is not initialized');
    await this.session.advance();
    const traversals = this.session.engine.recentTraversals();
    const counts = new Map<number, number>();
    for (const t of traversals) counts.set(t.slot, (counts.get(t.slot) ?? 0) + 1);
    this.pendingTraversals.push(...traversals.filter((t) => (counts.get(t.slot) ?? 0) > 1));
    if (this.pendingTraversals.length > 1200)
      throw new Error('Snapshot traversal capacity exceeded');
  }
  private ack(id: string) {
    if (!this.session) throw new Error('Worker is not initialized');
    this.emit(id, {
      type: 'CONTROL_ACK',
      mode: this.running ? 'RUNNING' : 'PAUSED',
      authoritativeTick: this.session.engine.tick,
      requestedSpeed: this.speed,
    });
  }
  private schedule() {
    if (!this.running || this.disposed) return;
    this.timer = this.clock.schedule(() => {
      this.serial = this.serial
        .then(() => this.pump())
        .catch((error: unknown) => {
          this.stop();
          this.emit('stream', {
            type: 'ERROR',
            code: 'INTERNAL_ERROR',
            reason: this.reason(error),
          });
        });
    }, 4);
  }
  private async pump() {
    if (!this.running || !this.session || this.disposed) return;
    const now = this.clock.now();
    const gap = now - this.lastWall;
    this.lastWall = now;
    if (gap > 500 || gap < 0) {
      this.stop();
      this.emit('stream', {
        type: 'STATUS',
        authoritativeTick: this.session.engine.tick,
        achievedSpeed: 0,
        lagTicks: 0,
        reason: 'WALL_GAP_AUTO_PAUSE',
      });
      this.ack('stream');
      return;
    }
    this.debt += gap * this.speed;
    const start = this.clock.now();
    let count = 0;
    while (this.debt >= 100 && count < 20 && this.clock.now() - start < 8) {
      if (this.session.engine.tick >= this.session.engine.horizon) {
        this.stop();
        break;
      }
      await this.transition();
      this.debt -= 100;
      count++;
      this.publish();
    }
    if (now - this.statusWall >= 250) {
      this.emit('stream', {
        type: 'STATUS',
        authoritativeTick: this.session.engine.tick,
        achievedSpeed:
          ((this.session.engine.tick - this.statusTick) * 100) / (now - this.statusWall),
        lagTicks: Math.max(0, Math.floor(this.debt / 100)),
        reason: null,
      });
      this.statusWall = now;
      this.statusTick = this.session.engine.tick;
    }
    this.schedule();
  }
  private async handle(raw: unknown) {
    if (this.disposed) return;
    const parsed = EngineCommandSchema.safeParse(raw);
    if (!parsed.success) {
      this.emit('transport', {
        type: 'ERROR',
        code: 'INVALID_INPUT',
        reason: 'Invalid worker command envelope/payload',
      });
      return;
    }
    const c = parsed.data;
    const lifecycle = c.type === 'INIT' || c.type === 'RESET' || c.type === 'IMPORT';
    if (
      (lifecycle ? c.epoch <= this.epoch : c.epoch !== this.epoch) ||
      (!lifecycle && c.runId !== this.runId)
    ) {
      this.send(
        EngineObservationSchema.parse({
          protocolVersion: 'protocol/2',
          runId: c.runId,
          epoch: c.epoch,
          requestId: c.requestId,
          type: 'ERROR',
          code: 'STALE_EPOCH',
          reason: 'Obsolete worker epoch/run',
        }),
      );
      return;
    }
    try {
      if (c.type === 'INIT' || c.type === 'IMPORT' || c.type === 'RESET') {
        // Validate replacement completely before replacing the authoritative run.
        let next: RunSession;
        if (c.type === 'IMPORT') {
          if (canonical(c.compatibility) !== canonical(this.identity))
            throw new Error('Incompatible worker runtime identity');
          next = await RunSession.importJson(c.json, this.digest, this.identity);
        } else {
          const inputs: SimulationInputs =
            c.type === 'INIT'
              ? {
                  city: c.city,
                  scenario: c.scenario,
                  manifest: c.manifest,
                  hashes: c.expectedHashes,
                }
              : (this.session?.engine.inputs as SimulationInputs);
          if (!inputs) throw new Error('Cannot reset before INIT');
          if (c.type === 'INIT' && canonical(c.compatibility) !== canonical(this.identity))
            throw new Error('Incompatible worker runtime identity');
          next = await RunSession.create(inputs, this.digest, this.identity, c.runId);
        }
        this.stop();
        this.session = next;
        this.epoch = c.epoch;
        this.runId = c.runId;
        this.speed = 1;
        this.eventCursor = 0;
        this.pendingTraversals = [];
        this.lastSnapshot = -Infinity;
        this.lastMetrics = -Infinity;
        this.emit(c.requestId, {
          type: c.type === 'INIT' ? 'READY' : 'RESTORED',
          snapshot: this.snapshot(),
        });
        this.publish(true);
        return;
      }
      if (!this.session) throw new Error('Worker is not initialized');
      switch (c.type) {
        case 'PLAY':
          if (!this.running) {
            this.running = true;
            this.lastWall = this.clock.now();
            this.statusWall = this.lastWall;
            this.statusTick = this.session.engine.tick;
            this.schedule();
          }
          this.ack(c.requestId);
          break;
        case 'PAUSE':
          this.stop();
          this.publish(true);
          this.ack(c.requestId);
          break;
        case 'STEP':
          if (this.running) throw new Error('STEP requires paused mode');
          await this.transition();
          this.publish(true);
          this.ack(c.requestId);
          break;
        case 'SET_SPEED':
          if (this.running) {
            const gap = this.clock.now() - this.lastWall;
            if (gap > 500 || gap < 0) {
              this.stop();
              this.emit('stream', {
                type: 'STATUS',
                authoritativeTick: this.session.engine.tick,
                achievedSpeed: 0,
                lagTicks: 0,
                reason: 'WALL_GAP_AUTO_PAUSE',
              });
            } else this.debt += gap * this.speed;
          }
          this.speed = c.speed;
          this.lastWall = this.clock.now();
          this.ack(c.requestId);
          break;
        case 'SUBMIT':
          try {
            this.emit(c.requestId, {
              type: 'COMMAND_ACK',
              command: this.session.engine.accept(c.command),
            });
            this.publish(true);
          } catch (error: unknown) {
            this.emit(c.requestId, { type: 'COMMAND_REJECTED', reason: this.reason(error) });
          }
          break;
        case 'EXPORT':
          this.stop();
          this.emit(c.requestId, { type: 'ARTIFACT', json: await this.session.exportJson() });
          break;
        case 'GET_DETAILS': {
          const e = this.session.engine;
          const agent = e.state().agents.find((a) => a.id === c.entityId);
          const request = e.inputs.manifest.requests.find(
            (r) => String(r.id) === String(c.entityId),
          );
          const facts = agent
            ? [
                `Location: ${JSON.stringify(agent.location)}`,
                `Active trip: ${agent.activeTripId ?? 'none'}`,
              ]
            : request
              ? e
                  .tripMetrics(request.id, this.runId)
                  .map((s) => `${s.metricId}: ${s.value ?? 'unavailable'} ${s.unit}`)
              : e.graph.edges.has(c.entityId)
                ? [
                    `Topology version: ${e.state().topologyVersion}`,
                    `Entry: ${e.state().laneClosed[e.graph.edges.get(c.entityId)?.index ?? 0] ? 'closed' : 'open'}`,
                  ]
                : [];
          this.emit(c.requestId, {
            type: 'DETAILS',
            asOfTick: e.tick,
            entityId: c.entityId,
            facts,
          });
          break;
        }
      }
    } catch (error: unknown) {
      if (lifecycle) {
        this.stop();
        this.epoch = c.epoch;
        this.runId = c.runId;
      }
      this.emit(c.requestId, {
        type: 'ERROR',
        code: this.reason(error).includes('Incompatible')
          ? 'INCOMPATIBLE_RUNTIME'
          : 'INVALID_INPUT',
        reason: this.reason(error),
      });
    }
  }
}
