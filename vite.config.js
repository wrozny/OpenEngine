import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  define: { 'process.env.FENGARICONF': 'undefined', process: 'undefined' },
  build: {
    rollupOptions: { input: { studio: resolve('index.html'), runtime: resolve('runtime.html') } },
  },
  optimizeDeps: {
    rolldownOptions: {
      transform: { define: { 'process.env.FENGARICONF': 'undefined', process: 'undefined' } },
    },
  },
  server: { host: '0.0.0.0' },
});
