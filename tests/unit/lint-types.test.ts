import { ESLint } from 'eslint';
import { it, expect } from 'vitest';
it('keeps type-aware lint diagnostics enabled in the pure package project service', async () => {
  const results = await new ESLint().lintText('export const unsafe = JSON.parse("{}");', {
    filePath: 'packages/simulation/src/index.ts',
  });
  expect(
    results
      .flatMap((result) => result.messages)
      .some((message) => message.ruleId === '@typescript-eslint/no-unsafe-assignment'),
  ).toBe(true);
}, 15000);
