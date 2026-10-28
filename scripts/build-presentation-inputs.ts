import { mkdir, writeFile } from 'node:fs/promises';
import { prepareAster } from '@civitas/simulation';
import { digest } from './runtime';

// Build-time only. The browser never imports or runs the traffic core.
const directory = 'apps/web/public/inputs';
await mkdir(directory, { recursive: true });
for (const fleet of [100, 200, 300]) {
  for (const seed of [104729, 130363, 155921]) {
    const inputs = await prepareAster(digest, fleet, seed);
    await writeFile(`${directory}/${fleet}-${seed}.json`, JSON.stringify(inputs));
  }
}
console.log('Prepared nine validated Aster presentation inputs.');
