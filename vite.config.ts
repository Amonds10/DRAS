import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // three.js는 따로 묶어 앱 코드가 바뀌어도 캐시를 다시 받지 않게 한다.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
