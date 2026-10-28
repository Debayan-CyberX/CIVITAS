import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';
import { sourceId } from '../../scripts/source-id.ts';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  define: {
    __CIVITAS_ENGINE_BUILD__: JSON.stringify(sourceId(path.resolve(import.meta.dirname, '../..'))),
  },
  build: {
    manifest: true,
    rolldownOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        index: path.resolve(import.meta.dirname, 'index.html'),
        simulationClient: path.resolve(import.meta.dirname, 'src/bridge/simulation-client.ts'),
      },
    },
  },
});
