import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { include: ['react', 'react-dom/client', 'pdf-lib', 'jszip', 'docx', 'tesseract.js', 'pdfjs-dist/legacy/build/pdf.mjs', '@dnd-kit/core', 'lucide-react'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
