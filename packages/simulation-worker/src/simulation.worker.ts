import { browserIdentity } from '@civitas/contracts';
import { WorkerHost } from './host';
const identity = browserIdentity(__CIVITAS_ENGINE_BUILD__, navigator.userAgent);
const host = new WorkerHost(
  {
    now: () => performance.now(),
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (handle) => clearTimeout(handle as number),
  },
  async (text) => {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('');
  },
  identity,
  (message) => self.postMessage(message),
);
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  void host.receive(event.data);
});
