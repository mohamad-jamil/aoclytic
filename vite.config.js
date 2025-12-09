import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/aoc': {
        target: 'https://adventofcode.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/aoc/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const session = req.headers['x-aoc-session'];
            if (session) {
              proxyReq.setHeader('cookie', `session=${session}`);
            }
          });
        },
      },
    },
  },
})
