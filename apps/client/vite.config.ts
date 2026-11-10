import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Polling nécessaire pour voir les modifications depuis un volume Docker sous Windows.
    watch: process.env.CHOKIDAR_USEPOLLING ? { usePolling: true, interval: 300 } : undefined,
  },
});
