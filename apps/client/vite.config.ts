import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Polling nécessaire pour voir les modifications depuis un volume Docker sous Windows.
    watch: process.env.CHOKIDAR_USEPOLLING ? { usePolling: true, interval: 300 } : undefined,
    // API de sauvegarde (service « api » du docker-compose).
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' },
  },
});
