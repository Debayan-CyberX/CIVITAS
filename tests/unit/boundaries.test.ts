import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { SIMULATION_IMPLEMENTATION, FIXED_TIMESTEP_MS } from '@civitas/simulation';

const eslint = new ESLint();
beforeAll(async () => {
  // Typed ESLint loads all isolated compiler projects once; individual checks remain fast.
  await eslint.lintText('export {};', { filePath: 'packages/simulation/src/index.ts' });
}, 15000);
describe('package import boundaries and platform independence', () => {
  it('imports the core in Node without DOM or Worker', () => {
    expect('window' in globalThis).toBe(false);
    expect('document' in globalThis).toBe(false);
    expect('Worker' in globalThis).toBe(false);
    expect(SIMULATION_IMPLEMENTATION).toBe('contracts-only');
    expect(FIXED_TIMESTEP_MS).toBe(100);
  });
  it.each([
    'import "react";',
    'import "three";',
    'import "zustand";',
    'import "node:fs";',
    'import "../../contracts/src/index";',
    'export * from "@civitas/web";',
    'void import("react");',
    'export type T = import("react").ReactNode;',
    'import type { ReactNode } from "react"; export type T = ReactNode;',
    'void import(`react`);',
    'require("react");',
  ])('rejects forbidden core dependency %s', async (source) => {
    const result = await eslint.lintText(source, { filePath: 'packages/simulation/src/index.ts' });
    expect(result.flatMap((r) => r.messages).some((m) => m.ruleId === 'boundaries/imports')).toBe(
      true,
    );
  });
  it('rejects renderer dependencies from contracts and direct core imports from the UI', async () => {
    for (const filePath of ['packages/contracts/src/index.ts', 'apps/web/src/bridge/probe.ts']) {
      const result = await eslint.lintText('import "@civitas/simulation";', { filePath });
      expect(result.flatMap((r) => r.messages).some((m) => m.ruleId === 'boundaries/imports')).toBe(
        true,
      );
    }
  });
  it('allows the core to import contracts and prohibits unseeded clock/random access', async () => {
    const allowed = await eslint.lintText(
      'export { FIXED_TIMESTEP_MS } from "@civitas/contracts";',
      { filePath: 'packages/simulation/src/index.ts' },
    );
    expect(
      allowed.flatMap((r) => r.messages).filter((m) => m.ruleId === 'boundaries/imports'),
    ).toEqual([]);
    const forbidden = await eslint.lintText('Math.random(); Date.now(); globalThis.document;', {
      filePath: 'packages/simulation/src/index.ts',
    });
    expect(
      forbidden.flatMap((r) => r.messages).filter((m) => m.ruleId?.startsWith('no-restricted'))
        .length,
    ).toBeGreaterThanOrEqual(3);
  });
});
