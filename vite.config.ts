import { defineConfig } from 'vite';

// Keep this config intentionally small for Hugging Face Spaces and other
// memory-constrained Docker builders. Vite's built-in TSX/esbuild pipeline is
// enough for this React SPA; @vitejs/plugin-react / React Compiler transforms
// are not needed and can spike memory in small containers.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/events': {
        target: 'ws://127.0.0.1:8787',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist/web',
    minify: false,
    cssMinify: false,
    reportCompressedSize: false
  }
});
