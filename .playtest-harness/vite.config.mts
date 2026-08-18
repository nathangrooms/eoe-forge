import { defineConfig } from 'vite';
import path from 'path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd(), './src') } },
  build: {
    lib: { entry: path.resolve(process.cwd(), '.playtest-harness/entry.ts'), formats: ['es'], fileName: () => 'game-core.mjs' },
    outDir: path.resolve(process.cwd(), '.playtest-harness/build'),
    emptyOutDir: true, minify: false, target: 'node18',
  },
});
