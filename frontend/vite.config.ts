// /frontend/vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // Assuming you use React. Change if you use Vue, Svelte, etc.

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // String shorthand for simple proxy rules
      '/api': {
        target: 'http://127.0.0.1:5000', // Your local Flask server's address
        changeOrigin: true, // Needed for virtual hosted sites
        secure: false,      // Can be needed if your backend is not running HTTPS
      },
    },
  },
})