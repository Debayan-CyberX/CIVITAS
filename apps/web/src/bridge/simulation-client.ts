import { EngineCommandSchema, EngineObservationSchema, browserIdentity } from '@civitas/contracts';
import type {
  EngineCommand,
  EngineObservation,
  EngineSnapshot,
  DeepReadonly,
} from '@civitas/contracts';
declare const __CIVITAS_ENGINE_BUILD__: string;
type Request<T = EngineCommand> = T extends EngineCommand
  ? Omit<T, 'protocolVersion' | 'runId' | 'epoch' | 'requestId'>
  : never;
type Listener = (message: DeepReadonly<EngineObservation>) => void;
export class SimulationClient {
  readonly identity = browserIdentity(__CIVITAS_ENGINE_BUILD__, navigator.userAgent);
  private worker: Worker;
  private epoch = 1;
  private serial = 0;
  private disposed = false;
  private failed = false;
  private readonly listeners = new Set<Listener>();
  private snapshots: EngineSnapshot[] = [];
  private latestTick = -1;
  private latestMetricTick = -1;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: EngineObservation) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(readonly runId: string) {
    this.worker = this.createWorker();
    document.addEventListener('visibilitychange', this.visibility);
  }
  private createWorker() {
    const worker = new Worker(
      new URL('../../../../packages/simulation-worker/src/simulation.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.addEventListener('message', (event: MessageEvent<unknown>) => this.observe(event.data));
    worker.addEventListener('error', () => {
      if (worker === this.worker) this.fail('Simulation worker failed');
    });
    worker.addEventListener('messageerror', () => {
      if (worker === this.worker) this.fail('Simulation worker message decoding failed');
    });
    return worker;
  }
  private visibility = () => {
    if (document.visibilityState === 'hidden' && !this.disposed && !this.failed)
      void this.request({ type: 'PAUSE' }).catch(() => undefined);
  };
  private fail(reason: string) {
    this.failed = true;
    this.worker.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error(reason));
    }
    this.pending.clear();
    for (const listener of this.listeners)
      listener({
        protocolVersion: 'protocol/2',
        runId: this.runId,
        epoch: this.epoch,
        requestId: 'transport',
        type: 'ERROR',
        code: 'INTERNAL_ERROR',
        reason,
      });
  }
  private observe(raw: unknown) {
    const parsed = EngineObservationSchema.safeParse(raw);
    if (!parsed.success) {
      this.fail('Invalid simulation observation');
      return;
    }
    const message = parsed.data;
    if (message.epoch !== this.epoch || message.runId !== this.runId || this.disposed) return;
    if (message.type === 'METRICS') {
      const tick = message.samples[0]?.asOfTick ?? -1;
      if (tick < this.latestMetricTick) return;
      this.latestMetricTick = tick;
    }
    if (message.type === 'SNAPSHOT' || message.type === 'READY' || message.type === 'RESTORED') {
      if (message.snapshot.tick < this.latestTick) return;
      if (message.type === 'READY' || message.type === 'RESTORED') this.snapshots = [];
      this.latestTick = message.snapshot.tick;
      this.snapshots.push(message.snapshot);
      this.snapshots = this.snapshots.slice(-3);
    }
    const p = this.pending.get(message.requestId);
    if (p) {
      clearTimeout(p.timeout);
      this.pending.delete(message.requestId);
      if (message.type === 'ERROR' || message.type === 'COMMAND_REJECTED')
        p.reject(new Error(message.reason));
      else p.resolve(message);
    }
    for (const listener of this.listeners) listener(message);
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  bufferedSnapshots(): DeepReadonly<EngineSnapshot[]> {
    return structuredClone(this.snapshots);
  }
  request(input: Request): Promise<EngineObservation> {
    if (this.disposed || this.failed)
      return Promise.reject(new Error('Worker unavailable; explicitly recover or dispose'));
    const replacement = input.type === 'RESET' || input.type === 'IMPORT';
    const nextEpoch = this.epoch + (replacement ? 1 : 0);
    const requestId = `request-${this.serial++}`;
    const command = EngineCommandSchema.parse({
      ...input,
      protocolVersion: 'protocol/2',
      runId: this.runId,
      epoch: nextEpoch,
      requestId,
    });
    if (replacement) {
      this.epoch = nextEpoch;
      this.latestTick = -1;
      this.latestMetricTick = -1;
      for (const p of this.pending.values()) {
        clearTimeout(p.timeout);
        p.reject(new Error('Superseded by lifecycle change'));
      }
      this.pending.clear();
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Worker acknowledgement timeout'));
      }, 120000);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.worker.postMessage(command);
    });
  }
  async recover(json: string) {
    if (this.disposed) throw new Error('Disposed bridge');
    this.worker.terminate();
    this.fail('Explicit worker recovery');
    this.failed = false;
    this.worker = this.createWorker();
    return this.request({ type: 'IMPORT', json, compatibility: this.identity });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.visibility);
    this.worker.terminate();
    this.fail('Disposed bridge');
    this.listeners.clear();
  }
}
export const createSimulationClient = (runId: string) => new SimulationClient(runId);
