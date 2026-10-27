import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const manifests = ['package.json'];
for (const base of ['apps', 'packages']) {
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.isDirectory()) manifests.push(path.join(base, entry.name, 'package.json'));
  }
}
const selected = new Map();
for (const file of manifests) {
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    if (name.startsWith('@civitas/')) continue;
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Dependency must be exact: ${name}`);
    if (selected.has(name) && selected.get(name) !== version)
      throw new Error(`Conflicting pins: ${name}`);
    selected.set(name, version);
  }
}
const packages = await Promise.all(
  [...selected].sort().map(async ([name, version]) => {
    const source = `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Registry rejected ${name}@${version}: ${response.status}`);
    const metadata = await response.json();
    if (metadata.version !== version) throw new Error(`Registry version mismatch: ${name}`);
    return {
      name,
      version,
      source,
      engines: metadata.engines ?? {},
      peers: metadata.peerDependencies ?? {},
      optionalPeers: metadata.peerDependenciesMeta ?? {},
      integrity: metadata.dist.integrity,
    };
  }),
);
const report = {
  checkedAt: new Date().toISOString(),
  node: process.version,
  packages,
  peerResolution:
    'See strict-peer-deps package-lock-only resolution and npm ls --all evidence; metadata alone is not a peer solver.',
};
const output = process.argv[2] ?? 'artifacts/local/b01-registry.json';
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Verified ${packages.length} exact registry pins; metadata saved to ${output}`);
