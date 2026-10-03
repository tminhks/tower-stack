import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // dist/ works from any sub-path
  build: { chunkSizeWarningLimit: 700 }, // three.js is ~560 KB minified, 142 KB gzipped
  server: { port: 5199 },
});
