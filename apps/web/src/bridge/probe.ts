import { FoundationProbeSchema, FoundationReplySchema, PROTOCOL_VERSION } from '@civitas/contracts';

export function startFoundationProbe(onResult: (verified: boolean) => void): () => void {
  if (typeof Worker === 'undefined') {
    onResult(false);
    return () => undefined;
  }
  let worker: Worker;
  try {
    worker = new Worker(
      new URL('../../../../packages/simulation-worker/src/probe.worker.ts', import.meta.url),
      { type: 'module' },
    );
  } catch {
    onResult(false);
    return () => undefined;
  }
  let finished = false;
  const finish = (verified: boolean) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    worker.terminate();
    onResult(verified);
  };
  const timeout = setTimeout(() => {
    finish(false);
  }, 5000);
  const request = FoundationProbeSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'FOUNDATION_PROBE',
    requestId: 'foundation-probe',
  });
  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    const result = FoundationReplySchema.safeParse(event.data);
    finish(result.success && result.data.requestId === request.requestId);
  });
  worker.addEventListener('error', () => {
    finish(false);
  });
  worker.addEventListener('messageerror', () => {
    finish(false);
  });
  worker.postMessage(request);
  return () => {
    finished = true;
    clearTimeout(timeout);
    worker.terminate();
  };
}
