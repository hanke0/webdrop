import { EventEmitter } from 'node:events'
import type { ClientRequest, IncomingMessage } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import generateFile from 'vite-plugin-generate-file'
import tailwindcss from '@tailwindcss/vite'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Proxy to the same HOST:PORT the Node server uses (`0.0.0.0` → loopback for the client). */
function devApiProxyTarget(env: Record<string, string>): string {
  const explicit = (env.WEB_DROP_DEV_PROXY_TARGET ?? '').trim()
  if (explicit.length > 0) {
    return explicit
  }
  /* Shell (e.g. serve-dev.sh) overrides repo .env so proxy matches the live server. */
  const hostRaw = (
    process.env.HOST ??
    env.HOST ??
    '127.0.0.1'
  ).trim()
  const portRaw = (process.env.PORT ?? env.PORT ?? '8080').trim()
  const port = /^\d+$/.test(portRaw) ? portRaw : '8080'
  let host = hostRaw.length > 0 ? hostRaw : '127.0.0.1'
  if (host === '0.0.0.0' || host === '::') {
    host = '127.0.0.1'
  }
  const bracketed =
    host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `http://${bracketed}:${port}`
}

/** So the API sees each browser's IP (subnet room), not 127.0.0.1 from the proxy hop. */
function withForwardedClientIp(target: string, ws?: boolean) {
  return {
    target,
    changeOrigin: true,
    ...(ws ? { ws: true } : {}),
    configure: (proxy: EventEmitter) => {
      proxy.on('proxyReq', (proxyReq: ClientRequest, req: IncomingMessage) => {
        const raw = req.socket?.remoteAddress
        if (typeof raw === 'string' && raw.length > 0) {
          proxyReq.setHeader('X-Forwarded-For', raw)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const devApiTarget = devApiProxyTarget(env)

  const devProxy =
    mode === 'development'
      ? { '/api/v2': withForwardedClientIp(devApiTarget, true) }
      : undefined

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
    start_url: '/',
    display: 'minimal-ui',
  }

  return {
    base: '/',
    server: devProxy ? { proxy: devProxy } : undefined,
    plugins: [
      react(),
      tailwindcss(),
      generateFile({ output: './manifest.json', data: manifest }),
    ],
  }
})
