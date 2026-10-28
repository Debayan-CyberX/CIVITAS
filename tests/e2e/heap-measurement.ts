import type { Browser } from '@playwright/test';

// Same browser-level CDP procedure used by the retained full-replay test.
export async function measureBrowserHeap(browser: Browser) {
  const cdp = await browser.newBrowserCDPSession();
  const targets = await cdp.send('Target.getTargets');
  const usages: { type: string; url: string; usedSize: number }[] = [];
  for (const target of targets.targetInfos.filter(
    (t) => t.type === 'page' || t.type === 'worker',
  )) {
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: false,
    });
    let serial = 0;
    const command = async (method: string) =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const id = ++serial;
        const timeout = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 10000);
        const listener = (event: { sessionId: string; message: string }) => {
          if (event.sessionId !== sessionId) return;
          const message = JSON.parse(event.message) as {
            id: number;
            result?: Record<string, number>;
            error?: unknown;
          };
          if (message.id !== id) return;
          clearTimeout(timeout);
          cdp.off('Target.receivedMessageFromTarget', listener);
          if (message.error) reject(new Error(JSON.stringify(message.error)));
          else resolve(message.result ?? {});
        };
        cdp.on('Target.receivedMessageFromTarget', listener);
        void cdp
          .send('Target.sendMessageToTarget', {
            sessionId,
            message: JSON.stringify({ id, method }),
          })
          .catch(reject);
      });
    await command('HeapProfiler.collectGarbage');
    const usage = await command('Runtime.getHeapUsage');
    usages.push({ type: target.type, url: target.url, usedSize: usage['usedSize'] ?? 0 });
    await cdp.send('Target.detachFromTarget', { sessionId });
  }
  await cdp.detach();
  if (!usages.some((t) => t.type === 'worker' && t.url.includes('simulation.worker')))
    throw new Error('Worker isolate missing from heap measurement');
  return usages;
}
