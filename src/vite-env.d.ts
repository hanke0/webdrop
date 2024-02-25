/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PEER_HOSTNAME: string
  readonly VITE_PEER_PORT: string
  readonly VITE_PEER_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
