/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly WEB_DROP_PEER_HOSTNAME: string
  readonly WEB_DROP_PEER_PORT: string
  readonly WEB_DROP_PEER_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
