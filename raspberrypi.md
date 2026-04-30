# Running Beatsync on a Raspberry Pi

This guide is for running this repo on a Raspberry Pi in LAN/local-storage mode:

- audio files are stored on the Pi, not R2/Cloudflare
- YouTube imports run locally on the Pi with `yt-dlp` + `ffmpeg`
- other devices on the same network open the app in a browser and connect over your LAN

The examples below assume:

- Raspberry Pi OS or another Debian-based Linux
- this repo is checked out at `/home/pi/beatsync`
- you want the client on port `3000`
- you want the API/WebSocket server on port `8080`

## 1. Choose storage first

Do not rely on the SD card if you plan to import a lot of YouTube audio. Use an external SSD or USB drive if possible.

Recommended layout:

- app repo: `/home/pi/beatsync`
- audio + backups: `/mnt/beatsync-storage`

Create the storage directory:

```bash
sudo mkdir -p /mnt/beatsync-storage
sudo chown -R pi:pi /mnt/beatsync-storage
```

This repo supports local storage through `LOCAL_STORAGE_ROOT`. Set it explicitly so uploads, imports, backups, and cleanup all use the same stable location.

## 2. Install system packages

Update the Pi first:

```bash
sudo apt update
sudo apt upgrade -y
```

Install the basics:

```bash
sudo apt install -y curl unzip git ffmpeg python3 python3-pip pipx
```

`ffprobe` is installed as part of the `ffmpeg` package.

Install `yt-dlp` with `pipx`:

```bash
pipx ensurepath
pipx install yt-dlp
```

Open a new shell after `pipx ensurepath`, or run:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Check that the required tools are visible:

```bash
bun --version
yt-dlp --version
ffmpeg -version
ffprobe -version
```

## 3. Install Bun

Install Bun for the `pi` user:

```bash
curl -fsSL https://bun.sh/install | bash
```

Then load it in your shell:

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun --version
```

If you later run Beatsync from `systemd`, `pm2`, or another service manager, make sure that `PATH` also includes:

- `$HOME/.bun/bin`
- `$HOME/.local/bin`
- `/usr/bin`

That matters because the app needs `bun`, `yt-dlp`, `ffmpeg`, and `ffprobe` available on `PATH`.

## 4. Install repo dependencies

Clone the repo and install workspace dependencies:

```bash
git clone https://github.com/mkieffer1107/beatsync.git /home/pi/beatsync
cd /home/pi/beatsync
bun install
```

## 5. Configure the server for local mode

Create `apps/server/.env`:

```env
LOCAL_STORAGE_ROOT=/mnt/beatsync-storage
PUBLIC_BASE_URL=http://beatsync-pi.local:8080
```

Notes:

- `LOCAL_STORAGE_ROOT` is where uploaded audio, imported YouTube tracks, thumbnails, and local backups live.
- `PUBLIC_BASE_URL` should be the URL other devices on your LAN use to reach the server.
- Do not set `S3_BUCKET_NAME`, `S3_PUBLIC_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, or `S3_SECRET_ACCESS_KEY` if you want local mode. When those are absent, the server falls back to local disk storage.

If you do not have a hostname yet, use the Pi's LAN IP instead:

```env
PUBLIC_BASE_URL=http://192.168.1.50:8080
```

## 6. Configure the client

You have two valid options.

### Option A: simplest setup, separate client/server ports

Create `apps/client/.env`:

```env
NEXT_PUBLIC_API_URL=http://beatsync-pi.local:8080
NEXT_PUBLIC_WS_URL=ws://beatsync-pi.local:8080/ws
```

If you do not have a hostname yet, use the Pi's IP:

```env
NEXT_PUBLIC_API_URL=http://192.168.1.50:8080
NEXT_PUBLIC_WS_URL=ws://192.168.1.50:8080/ws
```

With this setup:

- users browse to `http://beatsync-pi.local:3000`
- the Next.js client talks to the Bun server on `:8080`

### Option B: reverse proxy, single origin

This repo's client can also infer API/WebSocket URLs from the page URL when `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` are not set. That is useful if you later put Caddy or Nginx in front of both apps and serve everything from one hostname.

This repo now includes a root `Caddyfile` for a LAN-only `vibe.mathnasium.pro` deployment.

For that setup:

- leave `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` unset in `apps/client/.env`
- set `PUBLIC_BASE_URL=http://vibe.mathnasium.pro`
- set `SERVER_HOST=127.0.0.1`
- optionally set `SERVER_PORT=8080` if you want to keep the default explicit
- start the client on loopback with `HOSTNAME=127.0.0.1 PORT=3000 bun run start`
- run Caddy with the repo's `Caddyfile`

Important: `cd apps/server && bun run dev` still only starts the Bun server.
It does not start the Next.js client or Caddy. If you want the whole single-hostname
stack, run one of these from the repo root instead:

```bash
bun run lan:dev
bun run lan:start
bun run lan:prod
```

Use `bun run lan:prod` when you want the simplest Pi command. It runs `bun install`,
builds the workspace, validates the checked-in `Caddyfile`, and then starts the
client, server, and Caddy together.

For a kiosk-style Pi that should open the room locally in Chromium, combine
single-room mode with `--open-site`:

```bash
bun run lan:prod --single-room --admin-all --open-site
```

`--open-site` only works with an explicit `--single-room` flag. It opens the
single room and automatically continues past the "Synchronization Complete"
screen into the main queue UI. By default it opens `http://vibe.mathnasium.pro`;
set `BEATSYNC_DOMAIN` or `BEATSYNC_SITE_URL` before launching if your Caddy
hostname is different. If Chromium is installed under a custom command, set
`CHROMIUM_BIN`. The launcher defaults the browser display to `:0` when started
from SSH and prefers `/usr/lib/chromium/chromium` to avoid stale Chromium wrapper
flags.

`bun run lan:prod` reads these production env files:

- `apps/server/.env.production`
- `apps/client/.env.production`

That lets you keep your existing `.env` files for development.
If you need to override the client bind address for the root LAN launchers, set
`CLIENT_HOSTNAME` and `CLIENT_PORT` there instead of relying on the shell's own
`HOSTNAME` variable.

For a first Pi deployment, Option A is still simpler, but Option B is the cleanest branded setup once local DNS is working.

## 7. Start it in development mode

From the repo root:

```bash
bun dev
```

That starts:

- client on `http://<pi-host>:3000`
- server on `http://<pi-host>:8080`

Use this first to confirm that uploads, WebSocket sync, and YouTube imports work on your LAN.

## 8. Start it in production mode

Build everything from the repo root:

```bash
bun run build
```

Start the server:

```bash
cd /home/pi/beatsync/apps/server
bun run start
```

Start the client in a second shell and bind it to the LAN:

```bash
cd /home/pi/beatsync/apps/client
HOSTNAME=0.0.0.0 PORT=3000 bun run start
```

This repo's Bun server defaults to `0.0.0.0:8080`, so other devices on the LAN can reach it as long as the network allows it. You can override that with `SERVER_HOST` and `SERVER_PORT` if you put a reverse proxy in front.

Important:

- `bun run start` expects that you already ran `bun run build`
- if you skip the build step, the server will fail because `dist/index.js` does not exist yet
- if `bun --cwd apps/server run start` prints the Bun help menu on your system, use the `cd ... && bun run start` form above instead

Port behavior in this repo:

- the server listens on `8080`
- the client listens on `3000` by default
- the client port can be changed with `PORT=...`
- the server host defaults to `0.0.0.0`, but you can override it with `SERVER_HOST`
- the server port defaults to `8080`, but you can override it with `SERVER_PORT`

Expected processes after startup:

- client: `next start` listening on `*:3000` unless you changed `PORT`
- server: Bun listening on `0.0.0.0:8080` by default, or whatever you set with `SERVER_HOST` and `SERVER_PORT`

Useful check:

```bash
sudo ss -ltnp | grep -E ':3000|:8080'
```

Expected output should show something like:

- a `node ... next start` process on `3000`
- a `bun` process on `8080`

If you want the Pi to start Beatsync automatically at boot, use `systemd` or `pm2`. The repo already includes a `pm2.config.js` for the server, but not for the client, so you will need a second process definition or a `systemd` unit for the Next.js app.

## 9. Make it reachable on the LAN

Other devices on the same Wi-Fi or Ethernet network should connect using either:

- the Pi's LAN IP, for example `http://192.168.1.50:3000`
- a hostname that resolves to the Pi, for example `http://beatsync-pi.local:3000`

### Finding the Pi's IP

On the Pi:

```bash
hostname -I
```

Use the IPv4 address from that output.

### Using a hostname instead of an IP

You have three common options:

1. Use the Pi's current mDNS hostname, which in your setup is `http://pi.local:3000`.
2. Give the Pi a static DHCP reservation in your router so its IP does not change.
3. Add a local DNS entry in your router if your router supports it.

Because you are already connecting with:

```bash
ssh bot@pi.local
```

that means:

- the Pi's hostname is currently `pi`
- mDNS name resolution is already working on your LAN
- `pi.local` is the most natural hostname to use first

For most home LAN setups, a DHCP reservation plus `pi.local` is enough.

### Which hostname should you actually use?

There are three sane choices for a home LAN setup:

1. `pi.local` or another `.local` hostname you set on the Pi
2. a fixed LAN IP like `192.168.1.50`
3. a router-managed local DNS name such as `beatsync.home.arpa`

Recommended order:

- easiest for your current setup: `pi.local`
- most reliable: a DHCP reservation plus `beatsync.home.arpa` or another router-managed local hostname
- fallback that always works: a fixed LAN IP

Notes:

- `.local` usually works through mDNS/Bonjour/Avahi. It is convenient, but some devices and networks handle it better than others.
- `home.arpa` is the reserved suffix intended for home-network naming. If your router supports local DNS records, something like `beatsync.home.arpa` is a clean choice for LAN-only access.
- A DHCP reservation is strongly recommended no matter which hostname you use, because it keeps the Pi on the same IP.

### If you own a real domain

Because you own `mathnasium.pro`, you can absolutely use a name like:

- `vibe.mathnasium.pro`

The important question is not whether you can use that name. It is how you want that name to resolve.

Because `mathnasium.pro` is registered at Namecheap:

- Namecheap can manage the public DNS records for `mathnasium.pro`
- Namecheap does not automatically solve LAN-only name resolution inside your house
- for a LAN-only Beatsync setup, your router or internal DNS still needs to resolve `vibe.mathnasium.pro` to the Pi's local IP

There are two sane patterns:

1. LAN-only DNS for `vibe.mathnasium.pro`
2. Public DNS for `vibe.mathnasium.pro`

### Option 1: LAN-only DNS for `vibe.mathnasium.pro`

This is the best fit for your current setup.

In this model:

- devices on your local network resolve `vibe.mathnasium.pro` to the Pi's LAN IP, for example `192.168.1.50`
- devices outside your LAN either do not resolve it that way, or do not use it at all
- the app stays private to your local network

You usually do this with one of:

- a local DNS override in your router
- a split-horizon DNS setup
- a local DNS server such as Pi-hole, AdGuard Home, Unbound, or your router's built-in DNS feature

With Namecheap in the picture, this means:

- Namecheap continues to host the public DNS for `mathnasium.pro`
- your router or internal DNS overrides `vibe.mathnasium.pro` on your LAN only
- devices on your LAN use the local answer and reach the Pi directly

Recommended setup if your router supports it:

- reserve `192.168.1.50` for the Pi in DHCP
- create a local DNS record `vibe.mathnasium.pro -> 192.168.1.50`
- set `PUBLIC_BASE_URL=http://vibe.mathnasium.pro:8080`
- set `NEXT_PUBLIC_API_URL=http://vibe.mathnasium.pro:8080`
- set `NEXT_PUBLIC_WS_URL=ws://vibe.mathnasium.pro:8080/ws`

Then users on your LAN browse to:

- `http://vibe.mathnasium.pro:3000`

This gives you a clean hostname while keeping the app LAN-only.

If you want a single hostname with no visible `:3000` or `:8080`, use the checked-in `Caddyfile` instead:

- reserve `192.168.1.50` for the Pi in DHCP
- create a local DNS record `vibe.mathnasium.pro -> 192.168.1.50`
- set `PUBLIC_BASE_URL=http://vibe.mathnasium.pro`
- set `SERVER_HOST=127.0.0.1`
- leave `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` unset
- start the client on `127.0.0.1:3000`
- start Caddy with the repo's `Caddyfile`

Then users browse to:

- `http://vibe.mathnasium.pro`

### Option 2: Public DNS for `vibe.mathnasium.pro`

You can also control the public DNS for `vibe.mathnasium.pro` because you own `mathnasium.pro`, and you would normally do that through Namecheap.

But public DNS only makes sense if you intentionally want to expose the app outside your LAN.

If you put a public DNS record in the real public zone:

- outside users will try to reach whatever IP that record points to
- if that record points to a private LAN IP like `192.168.1.50`, it will not work for outside users
- even on your LAN, using a public DNS record that points to a private IP is usually not the cleanest approach

So for this project:

- if the app should stay LAN-only, prefer a local DNS override for `vibe.mathnasium.pro`
- if the app should be reachable from the internet, that is a different deployment model and you should plan for reverse proxy, TLS, and network exposure explicitly

### What Namecheap is useful for here

Namecheap is useful if you want one of these:

1. A future public DNS record for `vibe.mathnasium.pro`
2. A split-DNS setup where public DNS lives at Namecheap and your LAN overrides that hostname locally
3. A branded hostname you may later expose publicly after adding proper proxying and TLS

Namecheap is not enough by itself for LAN-only use. For LAN-only use, the missing piece is still:

- router DNS override
- or an internal DNS server on your network

### Better hostname options for your setup

Use one of these:

1. `http://pi.local:3000`
2. `http://vibe.mathnasium.pro:3000` with local router DNS
3. `http://beatsync.home.arpa:3000`
4. `http://192.168.1.50:3000`

Recommended order for your case:

1. simplest right now: `http://pi.local:3000`
2. clean branded LAN hostname: `http://vibe.mathnasium.pro:3000`
3. router-managed local name: `http://beatsync.home.arpa:3000`
4. direct fallback: `http://192.168.1.50:3000`

### When `vibe.mathnasium.pro` is a good idea

It is a good idea if:

- you want a nicer hostname than `pi.local`
- you control DNS for `mathnasium.pro`
- you can add a local DNS override in your router or internal DNS server
- you understand that this is still a LAN-only app unless you separately expose it

It is not a good idea if:

- your router does not support local DNS overrides and you do not want to run internal DNS
- some client devices are bypassing your local DNS with VPN DNS, encrypted DNS, or other overrides
- you expect the same hostname to work identically both inside and outside your LAN without setting up proper split DNS and public routing

### Do you need router changes?

For devices on the same LAN:

- usually no port forwarding is needed
- you do not need a public IP
- you do not need to expose anything to the internet

You may need to change router or Wi-Fi settings if:

- your router has client isolation or AP isolation enabled
- guest Wi-Fi is separated from your main LAN
- devices on Wi-Fi are blocked from reaching devices on Ethernet, or the reverse

If devices are all on the same normal home network, they should be able to reach the Pi directly.

Useful router changes, if your router supports them:

- create a DHCP reservation for the Pi
- add a local DNS hostname for the Pi
- make sure client isolation is disabled on the network you want to use
- avoid guest Wi-Fi for Beatsync clients unless you explicitly allow LAN access from the guest network

## 10. Simple hostname setup recipes

Pick one of these and keep it simple.

### Recipe A: easiest

- use `pi.local`
- set a DHCP reservation in your router
- browse to `http://pi.local:3000`

Server env:

```env
PUBLIC_BASE_URL=http://pi.local:8080
```

Client env:

```env
NEXT_PUBLIC_API_URL=http://pi.local:8080
NEXT_PUBLIC_WS_URL=ws://pi.local:8080/ws
```

### Recipe B: cleaner LAN hostname

- reserve a fixed IP for the Pi, for example `192.168.1.50`
- create a local DNS record such as `beatsync.home.arpa`
- browse to `http://beatsync.home.arpa:3000`

Server env:

```env
PUBLIC_BASE_URL=http://beatsync.home.arpa:8080
```

Client env:

```env
NEXT_PUBLIC_API_URL=http://beatsync.home.arpa:8080
NEXT_PUBLIC_WS_URL=ws://beatsync.home.arpa:8080/ws
```

### Recipe C: use your real domain on the LAN

- reserve a fixed IP for the Pi, for example `192.168.1.50`
- create a local DNS override `vibe.mathnasium.pro -> 192.168.1.50`
- browse to `http://vibe.mathnasium.pro:3000`

Server env:

```env
PUBLIC_BASE_URL=http://vibe.mathnasium.pro:8080
```

Client env:

```env
NEXT_PUBLIC_API_URL=http://vibe.mathnasium.pro:8080
NEXT_PUBLIC_WS_URL=ws://vibe.mathnasium.pro:8080/ws
```

This is the best branded option if your router or internal DNS can resolve `vibe.mathnasium.pro` to the Pi on your LAN.

### Recipe D: no hostname, just IP

- reserve a fixed IP for the Pi
- browse to `http://192.168.1.50:3000`

Server env:

```env
PUBLIC_BASE_URL=http://192.168.1.50:8080
```

Client env:

```env
NEXT_PUBLIC_API_URL=http://192.168.1.50:8080
NEXT_PUBLIC_WS_URL=ws://192.168.1.50:8080/ws
```

### Recipe E: one hostname with Caddy

- reserve a fixed IP for the Pi, for example `192.168.1.50`
- create a local DNS override `vibe.mathnasium.pro -> 192.168.1.50`
- leave `apps/client/.env` without `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`
- browse to `http://vibe.mathnasium.pro`

Server env:

```env
LOCAL_STORAGE_ROOT=/mnt/beatsync-storage
PUBLIC_BASE_URL=http://vibe.mathnasium.pro
SERVER_HOST=127.0.0.1
SERVER_PORT=8080
```

Client start command:

```bash
cd /home/pi/beatsync/apps/client
HOSTNAME=127.0.0.1 PORT=3000 bun run start
```

Caddy start command:

```bash
cd /home/pi/beatsync
caddy run --config ./Caddyfile
```

This is the cleanest option if you want a single branded LAN URL and do not want users to see separate client and server ports.

You can also use the repo launcher instead of three separate shells:

```bash
cd /home/pi/beatsync
bun run lan:start
```

Or use the all-in-one production launcher:

```bash
cd /home/pi/beatsync
bun run lan:prod
```

That starts:

- Bun server on `127.0.0.1:8080`
- Next.js client on `127.0.0.1:3000`
- Caddy on `vibe.mathnasium.pro`

The default production server env in this repo uses:

```env
LOCAL_STORAGE_ROOT=./storage
PUBLIC_BASE_URL=http://vibe.mathnasium.pro
SERVER_HOST=127.0.0.1
SERVER_PORT=8080
YTDLP_COOKIES_FROM_BROWSER=chrome
```

Because `LOCAL_STORAGE_ROOT` is relative and the server runs from `apps/server`,
uploaded files and backups stay inside the repo at `apps/server/storage`.

If you want these to come up at boot, sample systemd units are checked in under [`systemd/`](./systemd).

## 10. Firewall and network caveats

If you use a host firewall on the Pi, allow the app ports:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 8080/tcp
```

Check firewall status:

```bash
sudo ufw status
```

If you are using a reverse proxy later, you may only need to expose `80` and `443` publicly on the Pi and keep `3000` and `8080` private to localhost or the LAN.

## 11. Outside-LAN access

If you want remote access from outside your house, that is a different setup.

For outside-LAN access, you would need one of:

- port forwarding on your router
- a VPN such as Tailscale or WireGuard
- a proper reverse proxy with TLS and a public DNS name

For this app, direct port forwarding is not the first thing to try. A VPN is usually safer and easier than exposing raw app ports to the internet.

If you only care about people in the same house or studio network, skip this entirely.

## 12. Where files end up in local mode

With `LOCAL_STORAGE_ROOT=/mnt/beatsync-storage`, the server stores files locally. In this repo's local mode, expect paths roughly like:

- room audio: `/mnt/beatsync-storage/room-<roomId>/...`
- default audio: `/mnt/beatsync-storage/default/...`
- state backups: `/mnt/beatsync-storage/state-backup/...`

That is why using an SSD-backed path matters.

## 13. Quick test checklist

From another device on the LAN:

1. Open `http://<pi-host>:3000`
2. Create or join a room
3. Upload one local audio file
4. Import one single YouTube URL
5. Import one YouTube playlist URL
6. Confirm tracks appear, play, and survive a server restart

If those all work, your Pi deployment is in good shape.

## 14. Troubleshooting

### `Failed to start server. Is port 3000 in use?`

That error means something is already listening on the client port.

Most likely causes:

- another `next dev` or `next start` process is already running
- you already started Beatsync client in another shell, `tmux` session, `screen`, `pm2`, or `systemd`
- some unrelated app on the Pi is already using port `3000`

Check what is listening on port `3000`:

```bash
sudo ss -ltnp | grep ':3000'
```

Important: in `ss` output, the PID is the value inside `pid=...`.

Example:

```text
users:((\"node\",pid=2374,fd=13))
```

In that example, the PID is `2374`.

Do not use the `512` column from the left side of `ss` output as the PID. That number is not the process ID.

If you see a PID, inspect it:

```bash
ps -fp <PID>
```

If it says something like:

```text
node /home/bot/programming/beatsync/node_modules/.bin/next start
```

that means the Beatsync client is already running on `3000`.

In that case, your second `bun run start` attempt fails only because the first one already succeeded and is still active.

If it is an old Beatsync client process, stop it:

```bash
kill <PID>
```

If it does not stop cleanly:

```bash
kill -9 <PID>
```

Then start the client again:

```bash
cd /home/pi/beatsync/apps/client
HOSTNAME=0.0.0.0 PORT=3000 bun run start
```

If you are running through Caddy, bind the client to loopback instead:

```bash
cd /home/pi/beatsync/apps/client
HOSTNAME=127.0.0.1 PORT=3000 bun run start
```

If you are using a service manager, also check:

```bash
pm2 list
systemctl --type=service | grep -i beatsync
```

If you do not want to free port `3000`, you can move the client to another port:

```bash
cd /home/pi/beatsync/apps/client
HOSTNAME=0.0.0.0 PORT=3001 bun run start
```

Then browse to:

- `http://pi.local:3001`
- or `http://vibe.mathnasium.pro:3001`

If you are using Caddy, leave the client on `127.0.0.1:3000` and keep the browser pointed at `http://vibe.mathnasium.pro` instead of exposing an alternate client port directly.

### The app opens on the Pi itself but not on other devices

- confirm the Pi IP with `hostname -I`
- confirm the client is listening on `0.0.0.0`, not only `localhost`, unless you intentionally put Caddy in front and bound it to `127.0.0.1`
- confirm the device is on the same LAN
- check for guest Wi-Fi or AP isolation
- check `ufw` or any other firewall rules

### The page loads, but uploads or YouTube imports fail

- make sure `PUBLIC_BASE_URL` points at a LAN-reachable server URL
- make sure `apps/client/.env` points at the correct server URL and WebSocket URL, or leave those unset when you use same-origin reverse proxying
- verify `yt-dlp`, `ffmpeg`, and `ffprobe` are on `PATH`
- verify `LOCAL_STORAGE_ROOT` exists and is writable by the app user

Useful checks:

```bash
which yt-dlp
which ffmpeg
which ffprobe
ls -la /mnt/beatsync-storage
```

### WebSocket connection fails

- confirm the server is running on port `8080`
- confirm `NEXT_PUBLIC_WS_URL` uses `ws://.../ws` on LAN HTTP setups, or leave it unset when you use same-origin reverse proxying
- do not use `wss://` unless you actually put TLS in front of the app

### Imports work manually in a shell but fail when started as a service

Your service manager probably has the wrong `PATH`.

Make sure it can see:

- Bun in `$HOME/.bun/bin`
- `yt-dlp` in `$HOME/.local/bin` or wherever you installed it
- `ffmpeg` and `ffprobe` in `/usr/bin`

### The Pi becomes slow during playlist imports

- use an SSD instead of the SD card
- avoid running other heavy workloads on the same Pi
- use a Pi 4 or Pi 5 if you expect frequent YouTube playlist imports
- keep an eye on free disk space:

```bash
df -h
```

### The Pi's IP changes and clients stop connecting

Set a DHCP reservation in your router so the Pi keeps the same LAN IP, or switch your client/server envs to a stable hostname that resolves to the Pi.
