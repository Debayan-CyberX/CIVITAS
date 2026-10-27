import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const roles = [
  { directory: 'packages/contracts/src', allowed: ['zod'] },
  { directory: 'packages/simulation/src', allowed: ['@civitas/contracts'] },
  {
    directory: 'packages/simulation-worker/src',
    allowed: ['@civitas/contracts', '@civitas/simulation'],
  },
  {
    directory: 'apps/web/src',
    allowed: ['@civitas/contracts', 'react', 'react-dom', 'three', '@react-three/fiber', 'zustand'],
  },
];

export const boundariesPlugin = {
  rules: {
    imports: {
      meta: {
        type: 'problem',
        schema: [],
        messages: { forbidden: 'Dependency boundary forbids {{source}} from {{role}}.' },
      },
      create(context) {
        const filename = path.resolve(context.filename);
        const role = roles.find((item) =>
          filename.startsWith(path.join(root, item.directory) + path.sep),
        );
        if (!role) return {};
        const ownRoot = path.join(root, role.directory) + path.sep;
        const check = (node, source) => {
          if (typeof source !== 'string') return;
          const allowed = source.startsWith('.')
            ? path.resolve(path.dirname(filename), source).startsWith(ownRoot)
            : role.allowed.some((name) => source === name || source.startsWith(name + '/'));
          if (!allowed)
            context.report({
              node,
              messageId: 'forbidden',
              data: { source, role: role.directory },
            });
        };
        return {
          ImportDeclaration(node) {
            check(node, node.source.value);
          },
          ExportNamedDeclaration(node) {
            if (node.source) check(node, node.source.value);
          },
          ExportAllDeclaration(node) {
            check(node, node.source.value);
          },
          ImportExpression(node) {
            if (node.source.type === 'Literal') check(node, node.source.value);
            else
              context.report({
                node,
                messageId: 'forbidden',
                data: { source: 'nonliteral dynamic import', role: role.directory },
              });
          },
          TSImportType(node) {
            check(node, node.source.value);
          },
          CallExpression(node) {
            if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
              context.report({
                node,
                messageId: 'forbidden',
                data: { source: 'require()', role: role.directory },
              });
            }
          },
        };
      },
    },
  },
};
