import * as esbuild from 'esbuild'
import { chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const outfile = path.join(dir, 'webdrop-server.cjs')

await esbuild.build({
  absWorkingDir: dir,
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  banner: { js: '#!/usr/bin/env node\n' },
  legalComments: 'none',
})

chmodSync(outfile, 0o755)
