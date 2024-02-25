
const Config = {
    PEER_HOSTNAME: import.meta.env.VITE_PEER_HOSTNAME,
    PEER_PORT: import.meta.env.VITE_PEER_PORT ? parseInt(import.meta.env.VITE_PEER_PORT) : undefined,
    PEER_PATH: import.meta.env.VITE_PEER_PATH,
}


export default Config;