import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages serves this repository below /SIGP/. Local development stays at /.
  base: mode === 'production' ? '/SIGP/' : '/',
}))
