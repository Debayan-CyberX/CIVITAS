import { FoundationProbeSchema, FoundationReplySchema, PROTOCOL_VERSION } from '@civitas/contracts';
import {
  FIXED_TIMESTEP_MS,
  SIMULATION_IMPLEMENTATION,
  SIMULATION_SPEC_VERSION,
} from '@civitas/simulation';

// This diagnostic proves production worker packaging, not simulation execution.
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const request = FoundationProbeSchema.safeParse(event.data);
  if (!request.success) return;
  const response = FoundationReplySchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'FOUNDATION_READY',
    requestId: request.data.requestId,
    specVersion: SIMULATION_SPEC_VERSION,
    tickDurationMs: FIXED_TIMESTEP_MS,
    implementation: SIMULATION_IMPLEMENTATION,
  });
  self.postMessage(response);
});
