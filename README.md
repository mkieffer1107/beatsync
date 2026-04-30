# Beatsync

Beatsync is a high-precision web audio player built for multi-device playback. The official app is [beatsync.gg](https://www.beatsync.gg/).

https://github.com/user-attachments/assets/2aa385a7-2a07-4ab5-80b1-fda553efc57b

## Features

- **Millisecond-accurate synchronization**: Abstracts [NTP-inspired](https://en.wikipedia.org/wiki/Network_Time_Protocol) time synchronization primitives to achieve a high degree of accuracy
- **Cross-platform**: Works on any device with a modern browser (Chrome recommended for best performance)
- **Spatial audio:** Allows controlling device volumes through a virtual listening source for interesting sonic effects
- **Polished interface**: Smooth loading states, status indicators, and all UI elements come built-in
- **Self-hostable**: Run your own instance with a few commands

> [!NOTE]
> Beatsync is in early development. Mobile support is working, but experimental. Please consider creating an issue or contributing with a PR if you run into problems!

## Quickstart

This project uses [Turborepo](https://turbo.build/repo).

For explicit local client/server URLs, fill in the `.env` file in `apps/client` with:

```sh
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

If you leave those two variables unset:

- local Next dev on `http://localhost:3000` will automatically talk to the Bun server on `http://localhost:8080`
- reverse-proxy and LAN single-hostname setups will continue to use same-origin API and WebSocket URLs

A sample LAN reverse proxy config is checked in at [`Caddyfile`](./Caddyfile).
For a Pi-style single-hostname stack, use `bun run lan:dev` for development or
`bun run lan:start` after building. Those scripts start the client, server, and
Caddy together.
For the LAN launcher, use `CLIENT_HOSTNAME` / `CLIENT_PORT` in those env files if
you need to override the client bind address. That avoids conflicts with the
shell's own `HOSTNAME` variable on systems like Raspberry Pi OS.

### Production Run

Use `bun run lan:prod` to install dependencies, build the app, validate Caddy,
and start the single-hostname production stack. It reads
[`apps/server/.env.production`](./apps/server/.env.production) and
[`apps/client/.env.production`](./apps/client/.env.production).

For a one-room LAN setup, use `bun run lan:prod --single-room` or
`bun run lan:prod:single-room`. That builds the client so the root URL redirects
to `/room/123456`; use `--single-room=654321` if you want a different 6-digit
room.

To make every joining user an admin in the production LAN stack, add
`--admin-all`. Flags can be combined, for example:

```sh
bun run lan:prod --admin-all --single-room
```

On a Raspberry Pi desktop, add `--open-site` with `--single-room` to open
Chromium directly to the room and auto-enter the main queue UI after sync:

```sh
bun run lan:prod --single-room --admin-all --open-site
```

`--open-site` requires `--single-room`. It opens
`http://vibe.mathnasium.pro` by default; set `BEATSYNC_DOMAIN` or
`BEATSYNC_SITE_URL` if your Caddy hostname is different. If Chromium is installed
under a custom command, set `CHROMIUM_BIN`.

Run the following commands to start the server and client:

```sh
bun install          # installs once for all workspaces
bun dev              # starts both client (:3000) and server (:8080)
```

| Directory         | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `apps/server`     | Bun HTTP + WebSocket server                                    |
| `apps/client`     | Next.js frontend with Tailwind & Shadcn/ui                     |
| `packages/shared` | Type-safe schemas and functions shared between client & server |
