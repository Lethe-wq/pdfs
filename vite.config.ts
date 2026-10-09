import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { include: ['react', 'react-dom/client', 'pdf-lib', 'jszip', 'pdfjs-dist', '@dnd-kit/core', 'lucide-react'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
