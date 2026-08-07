import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'public/widget',
    lib: {
      entry: resolve(__dirname, 'src/components/widget/index.tsx'),
      name: 'HRCopilotWidget',
      fileName: () => 'widget.js',
      formats: ['umd']
    },
    rollupOptions: {
      // Don't externalize react for the widget so it can be a self-contained bundle
      // We want a single script tag
    }
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});
