# AGENTS.md

This file provides guidance to Codex when working in this repository.

## Project Overview

Beatsync is a Turborepo monorepo for synchronized multi-device web audio playback. The repo name and package names still use "Beatsync", while some client-facing branding and domains now use "vibe".

Workspace layout:

- **`apps/client`**: Next.js 16 App Router frontend using React 19, Tailwind v4, shadcn/ui, Zustand, and React Compiler
- **`apps/server`**: Bun HTTP + WebSocket server using native `Bun.serve()` with pathname switch routing
- **`packages/shared`**: Shared Zod/TypeScript contracts, constants, timing helpers, and geolocation utilities used by both client and server

## Tooling And Workflow

- Bun is pinned to `1.3.8` and Node is pinned to `24` in `mise.toml`
- Run `bun install` from the repo root to install all workspace dependencies
- Root `prepare` runs `lefthook install`
- The pre-commit hook formats, lint-fixes, and typechecks both app workspaces

## Commands

From the repo root:

```bash
bun install              # Install all workspace dependencies
bun dev                  # Start both apps in dev mode via Turbo
bun build                # Build all workspaces
bun start                # Start built workspaces via Turbo (depends on build)
bun client               # Start the built client only via Turbo
bun server               # Start the built server only via Turbo

bun lan:dev              # Run client + server + Caddy on one hostname for LAN dev
bun lan:start            # Run the built LAN stack
bun lan:prod             # Build and launch the LAN production stack
bun lan:check            # Validate the LAN deployment
bun lan:proxy            # Run Caddy with the checked-in Caddyfile

bun docker:build         # Build the server Docker image
bun docker:run           # Run the server container locally
bun docker:prod          # Build + run the server container
bun docker:stop          # Stop the local server container
bun docker:clean         # Remove the container and prune Docker state

bun pm2:start            # Start the server with PM2
bun pm2:stop             # Stop the PM2 process
bun pm2:restart          # Restart the PM2 process
bun pm2:logs             # Tail PM2 logs

bun demo:dev             # Run both apps in demo mode
bun demo:build           # Build demo variants
bun demo                 # Start the built demo stack

bun dev:log              # Run dev stack with logs tee'd to ./logs
bun start:log            # Run built stack with logs tee'd to ./logs
bun demo:log             # Run built demo stack with logs tee'd to ./logs
```

Server workspace commands (`cd apps/server`):

```bash
bun run dev              # Hot-reload server
bun run dev:demo         # Hot-reload server in demo mode
bun run build            # Build server into dist/
bun run start            # Run built server
bun test                 # Bun test suite
bun run test:watch       # Watch tests
bun run test:coverage    # Coverage run
bun run typecheck        # tsc --noEmit
bun run lint             # eslint src/
bun run format           # prettier --write src/
bun run load-test:demo   # Demo-mode load test
```

Client workspace commands (`cd apps/client`):

```bash
bun run dev              # Next dev
bun run dev:demo         # Next dev with demo mode enabled
bun run build            # Next build
bun run start            # Next start
bun run lint             # eslint src/
bun run typecheck        # tsc --noEmit
bun test                 # Bun test suite
```

Notes:

- Root `bun client` and `bun server` are **start/build** flows, not dev/watch commands
- `apps/server/package.json` still references `cleanup` and `cleanup:live`, but the target script file is currently missing; do not assume those commands work without restoring the script first

## Architecture

### Server State

The server keeps room state in memory and periodically backs it up to storage.

- **`globalManager`**: Singleton that owns the room map, room lifecycle, and cached active-user count
- **`RoomManager`**: Per-room owner of clients, WebSocket connections, audio sources, playlists, playback state, spatial audio, chat, global volume, low-pass state, metronome state, stream-job tracking, demo counters, and stale-client heartbeat cleanup
- **`ChatManager`**: Per-room chat history with incremental message IDs
- **`BackupManager`**: Restore on startup, periodic backup every 60 seconds, old-backup cleanup, orphaned-room cleanup
- **`MusicProviderManager`**: Provider-backed search/stream integration

Still-current behaviors:

- Empty rooms are cleaned up 60 seconds after the last client disconnects
- If the last admin leaves in normal mode, a remaining client is auto-promoted at random
- Demo mode disables that auto-promotion flow and uses an admin secret instead

### HTTP And WebSocket Surface

Mounted HTTP routes are defined in `apps/server/src/index.ts`:

- `/`
- `/ws`
- `/upload/get-presigned-url`
- `/upload/complete`
- `/upload/local/:token`
- `/stats`
- `/default`
- `/active-rooms`
- `/discover`
- `/audio/*`

Important route behavior:

- `/active-rooms` returns the cached active-user count across rooms
- `/discover` returns up to 50 active, currently playing rooms for the public discovery UI
- `apps/server/src/routes/audio.ts` and `apps/server/src/routes/cleanup.ts` exist, but they are not currently mounted

WebSocket flow:

1. Client connects to `/ws` with `roomId`, `username`, and `clientId` query params
2. `handleOpen()` subscribes the socket, adds the client to the room, and sends initial room state
3. `NTP_REQUEST` is a hot path handled directly in `apps/server/src/routes/websocketHandlers.ts`
4. Most other client actions are validated with `WSRequestSchema`, then dispatched through `apps/server/src/websocket/dispatch.ts` and `apps/server/src/websocket/registry.ts`
5. Server responses are defined in `packages/shared/types/WSBroadcast.ts` and `packages/shared/types/WSUnicast.ts`

When adding a new WebSocket action:

1. Update the shared request/response schemas in `packages/shared/types/`
2. Add a server handler in `apps/server/src/websocket/handlers/`
3. Register it in `apps/server/src/websocket/registry.ts`
4. Update client handling in `apps/client/src/components/room/WebSocketManager.tsx` and the relevant Zustand store or hooks

### Time Synchronization

Synchronization is still NTP-inspired, but the implementation is more advanced than the original AGENTS version:

- The client sends coded two-probe `NTP_REQUEST` pairs
- The client keeps the best offset from the minimum-RTT pure probe pair
- After initial rapid sampling, the client continues with steady-state heartbeats
- The server tracks per-client RTT plus client-reported compensation and manual nudge
- Scheduled play/pause actions use server time and account for client latency compensation, not just raw RTT

Playback coordination flow:

1. A play request triggers `LOAD_AUDIO_SOURCE`
2. Clients load/decode the source and respond with `AUDIO_SOURCE_LOADED`
3. The server waits for every active client or a 3 second timeout
4. The server broadcasts a scheduled play action with `serverTimeToExecute`

Demo mode bypasses some of this by preloading demo audio and tracking `DEMO_AUDIO_READY_COUNT`.

### Storage, Uploads, And Imports

Storage is no longer R2-only.

- If full S3/R2 credentials are present, the server uses remote object storage
- Otherwise it falls back to local storage rooted at `LOCAL_STORAGE_ROOT` or `apps/server/storage`
- Local mode serves audio from `/audio/*` and accepts uploads via `/upload/local/:token`

Upload flow:

1. Client requests `POST /upload/get-presigned-url`
2. Server returns either a presigned remote upload URL or a local upload token URL
3. Client uploads bytes directly to that target
4. Client calls `POST /upload/complete`
5. Server validates the uploaded file, adds it to room state, and broadcasts `SET_AUDIO_SOURCES`

Storage key format:

`room-{roomId}/{sanitized-name}___{timestamp}.{ext}`

The server also supports:

- Provider-backed music search and stream import
- YouTube single-video and playlist import via the yt-dlp helpers in `apps/server/src/lib/youtube.ts`
- Playlist objects stored directly in room state

## Client State Management

There are still three Zustand stores in `apps/client/src/store/`:

- **`global.tsx`**: Main app store for audio sources, playlist library state, selected track/playlist, WebSocket state, reconnection state, NTP sync/probe stats, playback state, spatial audio, global volume, low-pass, metronome, search results, stream jobs, demo counters, and the LRU audio buffer cache
- **`room.tsx`**: Room metadata and loading state
- **`chat.tsx`**: Chat messages and sync behavior

Client-side message flow is split across several files:

- `apps/client/src/utils/ws.ts`: outbound request serialization
- `apps/client/src/components/room/WebSocketManager.tsx`: inbound parsing and message handling
- `apps/client/src/hooks/useNtpHeartbeat.ts`: heartbeat lifecycle
- `apps/client/src/hooks/useWebSocketReconnection.ts`: reconnection policy

HTTP usage:

- Axios is used for upload and API calls
- TanStack React Query is provided via `apps/client/src/components/TQProvider.tsx`
- The discovery UI polls `/discover`

Notable current client features:

- Demo mode
- Playlist library derivation and server sync
- YouTube import UI helpers
- Room discovery UI with geolocation flags
- PostHog and Vercel analytics hooks

## Environment Setup

Client local development typically uses:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

Client notes:

- If those variables are unset, the client falls back to same-origin API and WebSocket URLs derived from `window.location`
- This same-origin mode is what the checked-in `Caddyfile` and `apps/client/.env.production` are built around
- Demo mode uses `NEXT_PUBLIC_DEMO_MODE=1`
- PostHog is enabled when `NEXT_PUBLIC_POSTHOG_KEY` is present

Server env vars in active use include:

```bash
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
LOCAL_STORAGE_ROOT=./storage

S3_BUCKET_NAME=
S3_PUBLIC_URL=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

PROVIDER_URL=
CREATOR_SECRET=

DEMO=0
DEMO_AUDIO_DIR=./demo-audio
DEMO_ADMIN_SECRET=beatsync

YTDLP_BINARY=
YTDLP_COOKIES_FILE=
YTDLP_COOKIES_FROM_BROWSER=
YTDLP_EXTRACTOR_ARGS=
YTDLP_FORMAT=
```

Notes:

- `apps/server/.env.production` is currently set up for local-storage plus loopback binding behind a reverse proxy
- `PUBLIC_BASE_URL` matters in local-storage mode so generated public URLs are correct when the app sits behind Caddy or another proxy

## Deployment

- `Dockerfile` builds a **server-only** image; it does not package the Next.js client
- `pm2.config.js` is also server-only
- Single-hostname LAN deployments use the checked-in `Caddyfile` plus `bun run lan:*`
- The repo includes `systemd/` units for server, client, and Caddy
- `vercel.json` exists for client builds

For full setup and deployment details, prefer the checked-in docs over duplicating long instructions here:

- `README.md`
- `local-mac.md`
- `raspberrypi.md`

## Development Notes

- The client has Bun tests; do not assume it is test-free
- The server test suite covers room cleanup, backup/restore, playlists, chat persistence, demo mode, WebSocket dispatch, and coded-probe sync behavior
- Room IDs are commonly generated as 6-digit codes in the UI, but the server currently validates presence rather than enforcing that format; demo mode hardcodes room `000000`
- The server still uses native `Bun.serve()` with a pathname switch, not Hono routing
- Graceful shutdown backs up server state before exit
