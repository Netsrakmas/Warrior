import { defineConfig } from 'vite';

// base must match the GitHub repo name for Pages deploys (PLAN §12).
export default defineConfig({
  base: '/Warrior/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
