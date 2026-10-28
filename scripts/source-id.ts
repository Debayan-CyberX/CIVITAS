import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
export function sourceId(root = process.cwd()): string {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('.ts')) files.push(file);
    }
  };
  visit(path.join(root, 'packages/contracts/src'));
  visit(path.join(root, 'packages/simulation/src'));
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(path.relative(root, file).replaceAll('\\', '/') + '\n');
    hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
  }
  return hash.digest('hex');
}
