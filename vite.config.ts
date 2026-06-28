import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const rootDir = fileURLToPath(new URL('./src/admin', import.meta.url));
const distDir = fileURLToPath(new URL('./dist', import.meta.url));

export default defineConfig(() => {
  const target = process.env.AUDIOSERVER_URL ?? 'http://localhost:7090';
  const pkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
  ) as { version?: string };

  return {
    root: rootDir,
    base: '/admin/',
    publicDir: 'public',
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
    },
    build: {
      outDir: distDir,
      emptyOutDir: true,
      target: 'es2018',
      rollupOptions: {
        output: {
          // Split the framework/i18n vendors into their own chunks so the app
          // chunk stays under the size-warning threshold (and caches better).
          manualChunks: {
            react: ['react', 'react-dom'],
            i18n: ['i18next', 'react-i18next'],
          },
        },
      },
    },
    server: {
      host: true,
      proxy: {
        '/admin/api': {
          target,
          changeOrigin: true,
          ws: true,
        },
        '/api': {
          target,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
