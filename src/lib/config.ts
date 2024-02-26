const Config = {
  PEER_HOSTNAME: import.meta.env.WEB_DROP_PEER_HOSTNAME,
  PEER_PORT: import.meta.env.WEB_DROP_PEER_PORT
    ? parseInt(import.meta.env.WEB_DROP_PEER_PORT)
    : undefined,
  PEER_PATH: import.meta.env.WEB_DROP_PEER_PATH,
}

export default Config
