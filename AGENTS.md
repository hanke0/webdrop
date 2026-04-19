# Webdrop — Agent / contributor guide

## Overview

**Webdrop** is a browser-based **peer-to-peer** application for **chat** and **file transfer**, built on **WebRTC** data channels.

- **Server role:** The backend helps peers **find each other** and **exchange WebRTC signaling** (offer/answer, ICE candidates). It does **not** relay chat or file payloads after peers are connected over WebRTC.
- **Client role:** The SPA opens **RTCPeerConnection** instances with two **RTCDataChannels** (`webdrop-ctrl` for JSON control; `webdrop-file` for raw file bytes). Chat and file transfers run entirely **between browsers**.

All application code is **TypeScript** (`web/` and `server/`).

---

## Repository layout

| Path | Purpose |
|------|---------|
| `web/` | React + Vite + Tailwind SPA; WebRTC stack under [`web/src/lib/webrtc/`](web/src/lib/webrtc/) (re-exported from [`web/src/lib/p2p.ts`](web/src/lib/p2p.ts) for stable imports). |
| `server/` | Express HTTP API [`/api/v2`](server/server.ts): room presence, default room; WebSocket **`/api/v2/signal`** forwards versioned envelopes between peers in a room. |
| Root `package.json` | npm **workspaces** (`web`, `server`); shared scripts (`dev`, `build`, `lint`, `test`) |

---

## Protocol (v2, breaking)

**HTTP**

- `POST /api/v2/room/:room/presence` — `{ "peerId": "ROOM-adj-adj-adj" }`
- `GET /api/v2/room/:room/users` — `[{ "id": "<peerId>" }]`
- `GET /api/v2/default-room` — `{ room }`

**Signaling WebSocket** — `GET /api/v2/signal?room=&peerId=`  
Client sends `{ "v": 2, "to": "<peerId>", "body": { "type": "offer" | "answer" | "ice", ... } }`; server forwards `{ "v": 2, "from": "<peerId>", "body": ... }`.

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

1. **Respect the split:** signaling/presence on the server; chat and files on WebRTC unless the task changes that boundary.
2. **Match patterns** in `web/src/lib/webrtc/` for signaling and peer links.
3. **Keep changes scoped** to the requested behavior.
