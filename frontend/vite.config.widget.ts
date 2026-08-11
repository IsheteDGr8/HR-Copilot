import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Widget output lives under public/; don't copy public/ into itself.
  publicDir: false,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'public/widget',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/components/widget/index.tsx'),
      name: 'HRCopilotWidget',
      fileName: () => 'widget.js',
      formats: ['umd'],
    },
    rollupOptions: {
      // Bundle React into the widget so a single <script> tag is enough.
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})
