import { mkdir, writeFile } from 'node:fs/promises';
import { prepareAster } from '@civitas/simulation';
import { digest } from './runtime';
const inputs = await prepareAster(digest);
await mkdir('data/aster', { recursive: true });
await writeFile('data/aster/city.v1.json', JSON.stringify(inputs.city, null, 2) + '\n');
await writeFile(
  'data/aster/scenario.morning.v1.json',
  JSON.stringify(inputs.scenario, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    hashes: inputs.hashes,
    nodes: inputs.city.nodes.length,
    lanes: inputs.city.lanes.length,
    buildings: inputs.city.buildings.length,
    requests: inputs.manifest.requests.length,
  }),
);
