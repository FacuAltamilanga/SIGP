import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Relative assets work both on a project Pages URL and when Pages is configured
  // with a different repository path. Local development stays at /.
  base: mode === 'production' ? './' : '/',
}))
