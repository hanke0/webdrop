import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import generateFile from 'vite-plugin-generate-file'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'WEB_DROP_')
  const baseURL = env.WEB_DROP_BASE_URL || '/'

  const manifest = {
    short_name: 'WebDrop',
    name: 'Web Drop',
    icons: [
      {
        src: 'favicon.ico',
        sizes: '64x64 32x32 24x24 16x16',
        type: 'image/x-icon',
      },
      {
        src: 'logo192.png',
        type: 'image/png',
        sizes: '192x192',
      },
      {
        src: 'logo512.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    start_url: baseURL,
    display: 'minimal-ui',
  }

  return {
    base: baseURL,
    envPrefix: 'WEB_DROP_',
    plugins: [
      react(),
      generateFile({ output: './manifest.json', data: manifest }),
    ],
  }
})
