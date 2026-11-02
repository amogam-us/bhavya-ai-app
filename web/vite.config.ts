import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', ['BHAVYA_', 'HUB_']);
  // Set BHAVYA_HTTPS=1 to serve over HTTPS, which phones need for camera and microphone access.
  const https = env.BHAVYA_HTTPS === '1';
  const HUB_URL = `http://localhost:${env.HUB_PORT || 8787}`;

  return {
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': HUB_URL,
        '/cards': HUB_URL,
        '/ws': { target: HUB_URL.replace('http', 'ws'), ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      // The simulator's 3D engine is one large chunk that only loads on that page.
      chunkSizeWarningLimit: 700,
    },
  };
});
