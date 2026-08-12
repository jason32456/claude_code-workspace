import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the built game runs from any sub-path
  // (it is served from /apps/apex-riders/dist/ inside the showcase).
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
