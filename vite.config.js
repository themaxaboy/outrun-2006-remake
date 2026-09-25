import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './' so the build works from any sub-path (GitHub Pages, itch.io, file servers)
export default defineConfig({
  base: './',
  plugins: [vue()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/postprocessing')) return 'post'
          if (id.includes('node_modules/vue') || id.includes('node_modules/@vue')) return 'vue'
        },
      },
    },
  },
  server: { host: true },
  preview: { host: true },
})
