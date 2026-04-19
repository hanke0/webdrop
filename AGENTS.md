# Webdrop — Agent / contributor guide

## Overview

**Webdrop** is a browser-based **peer-to-peer** application for **chat** and **file transfer**, built on **WebRTC** data channels.

- **Server role:** One unified **WebSocket** (`/api/v2/ws`) brokers presence **and** WebRTC signaling. It does **not** relay chat or file payloads after peers are connected over WebRTC.
- **Client role:** The SPA opens **RTCPeerConnection** instances with two **RTCDataChannels** (`webdrop-ctrl` for JSON control; `webdrop-file` for raw file bytes). Chat and file transfers run entirely **between browsers**.
- **LAN-first WebRTC:** `iceServers` is empty, so only host (mDNS-masked) candidates are emitted — peers that can see each other on the LAN will connect; peers behind different NATs will not.

All application code is **TypeScript** (`web/` and `server/`).

---

## Repository layout

| Path | Purpose |
|------|---------|
| `web/` | React + Vite + Tailwind SPA; WebRTC stack under [`web/src/lib/webrtc/`](web/src/lib/webrtc/) (re-exported from [`web/src/lib/p2p.ts`](web/src/lib/p2p.ts) for stable imports). |
| `server/` | Express + unified WebSocket **`/api/v2/ws`** in [`server/server.ts`](server/server.ts); tracks presence purely via WS lifecycle, seeds the default room from `x-forwarded-for`, forwards signaling envelopes. |
| Root `package.json` | npm **workspaces** (`web`, `server`); shared scripts (`dev`, `build`, `lint`, `test`) |

---

## Protocol (v3, breaking)

**Unified WebSocket** — `GET /api/v2/ws?user=<adj-noun>[&room=<ABC123>]`

- If `room` is omitted/invalid, the server derives one from the client's `x-forwarded-for` subnet (stable per LAN segment).
- The server assigns `peerId = "${room}-${user}"`; duplicate usernames in a room close with code `4002`.

Server frames:

- `{ "type": "welcome", "room", "peerId", "peers": string[] }` — first message after accept.
- `{ "type": "peer.join", "peerId": "<peerId>" }` / `{ "type": "peer.leave", ... }`
- `{ "type": "peers", "peers": string[] }` — response to a client `{ "type": "peers" }` request.
- `{ "type": "signal", "from": "<peerId>", "body": { "type": "offer"|"answer"|"ice", ... } }`

Client frames:

- `{ "type": "signal", "to": "<peerId>", "body": SignalBody }`
- `{ "type": "peers" }` — ask for a fresh roster.

**Data channels**

- **`webdrop-ctrl`**: UTF-8 JSON (`session.ready`, `chat`, `file.offer` / `file.answer` / `file.done`).
- **`webdrop-file`**: binary chunks only (after consent). No framing beyond browser message boundaries.

---

## Development commands

From the repo root:

- `npm run dev` — start the Vite dev client (`@webdrop/web`).
- `npm run serve-dev` — script that may run client + server together (see `./scripts/serve-dev.sh`).
- `npm run build` — build all workspaces that define a build script.
- `npm run lint` / `npm run fmt` — ESLint; fix with `fmt`.
- `npm run test` — runs tests in the web workspace (`vitest`).

Server dev: `npm run dev -w @webdrop/server`. Production start after build: see `@webdrop/server` `package.json` `start` script.

---

## Conventions for agents editing this codebase

1. **Respect the split:** presence + signaling on the unified WS; chat and files on WebRTC unless the task changes that boundary.
2. **Match patterns** in `web/src/lib/webrtc/` for the `SignalLink`, `RoomSession`, and `PeerLink` layering.
3. **Keep changes scoped** to the requested behavior.
