import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Allow importing from convex folder at project root
      '@convex': path.resolve(__dirname, '../convex'),
    },
  },
})
