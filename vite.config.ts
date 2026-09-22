import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Kein API-Key im Frontend: Es gibt bewusst kein `define` für Umgebungsvariablen.
// Alle KI-Aufrufe laufen über den Express-Server (server/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
