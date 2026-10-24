import { defineConfig } from 'vitest/config';

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700&family=Noto+Sans+KR:wght@400;500;700;900&display=swap" />';

export default defineConfig(({ mode }) => ({
  base: './',
  // artifact 모드: 글꼴은 Google Fonts에서 받는다(Fontsource 한글 조각 1000여 개를 묶지 않는다).
  plugins:
    mode === 'artifact'
      ? [
          {
            name: 'skip-fontsource',
            enforce: 'pre' as const,
            resolveId: (id: string) => (id.startsWith('@fontsource/') ? '\0empty-font' : undefined),
            load: (id: string) => (id === '\0empty-font' ? '' : undefined),
            // Artifact 페이지는 문서 뼈대가 덧씌워지므로 head·body 안쪽만 남긴 조각으로 낸다.
            transformIndexHtml: {
              order: 'post' as const,
              handler: (html: string) => {
                const head = html.match(/<head>([\s\S]*?)<\/head>/)![1].replace(/\s*<meta (charset|name="viewport")[^>]*>/g, '');
                const body = html.match(/<body>([\s\S]*?)<\/body>/)![1];
                return `${head.trim()}\n${FONTS}\n${body.trim()}\n`;
              },
            },
          },
        ]
      : [],
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
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
}));
