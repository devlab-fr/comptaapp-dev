import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: ['log', 'debug', 'info', 'warn'],
        drop_debugger: true,
      },
    },
  },
})
