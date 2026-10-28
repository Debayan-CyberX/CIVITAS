import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const directory = path.resolve('docs/b06-b08/evidence');
mkdirSync(directory, { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error('Run with npm run verify:stage01 so the selected toolchain is retained.');
const results = [];
const logText = (output) =>
  output
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd() + '\n';
const checksOnly = process.argv.includes('--checks-only');
const commands = ['format:check', 'typecheck', 'lint', checksOnly ? 'test:unit' : 'test', 'build'];
for (const name of commands) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [npmCli, 'run', name], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  writeFileSync(
    path.join(directory, `${checksOnly ? 'final-' : ''}${name.replaceAll(':', '-')}.txt`),
    logText(output),
  );
  results.push({
    command: `npm run ${name}`,
    exitCode: result.status,
    elapsedMs: performance.now() - start,
  });
  if (result.status !== 0) break;
}
if (!checksOnly && results.length === 5 && results.every((r) => r.exitCode === 0)) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--workers=1', '--reporter=list,json'],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(directory, 'browser-results.json'),
      },
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  writeFileSync(path.join(directory, 'browser.txt'), logText(output));
  results.push({
    command: 'playwright test --workers=1 --reporter=list,json',
    exitCode: result.status,
  });
}
writeFileSync(
  path.join(directory, checksOnly ? 'final-validation.json' : 'validation.json'),
  JSON.stringify(
    {
      date: new Date().toISOString(),
      node: process.version,
      npm: process.env.npm_config_user_agent,
      results,
    },
    null,
    2,
  ) + '\n',
);
if (results.some((r) => r.exitCode !== 0)) process.exitCode = 1;
