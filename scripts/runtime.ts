import { createHash } from 'node:crypto';
import { sourceId } from './source-id';
import type { RuntimeIdentity } from '@civitas/contracts';
export const digest = (text: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(text, 'utf8').digest('hex'));
export const identity = (): RuntimeIdentity => ({
  engineVersion: 'engine/0.2.0',
  engineBuildSha: sourceId(),
  runtimeEngine: 'V8',
  runtimeVersion: `Node-${process.versions.node}-V8-${process.versions.v8}`,
  platform: `${process.platform}-${process.arch}`,
  numericContractVersion: 'kinematics/1',
});
