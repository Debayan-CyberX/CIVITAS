import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const compiler = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));
const projects = [
  'packages/contracts',
  'packages/simulation',
  'packages/simulation-worker',
  'apps/web',
  'apps/web/tsconfig.node.json',
  'tsconfig.tools.json',
  'tsconfig.browser-tests.json',
  'tsconfig.pure-tests.json',
];
for (const project of projects) {
  console.log(`Typecheck: ${project}`);
  const result = spawnSync(process.execPath, [compiler, '--project', project], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
