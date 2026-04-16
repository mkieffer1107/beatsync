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
git clone <your-fork-or-repo-url> /home/pi/beatsync
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

For a first Pi deployment, Option A is simpler.

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
cd /home/pi/beatsync
bun --cwd apps/server run start
```

Start the client in a second shell and bind it to the LAN:

```bash
cd /home/pi/beatsync
HOSTNAME=0.0.0.0 PORT=3000 bun --cwd apps/client run start
```

This repo's Bun server already binds to `0.0.0.0:8080`, so other devices on the LAN can reach it as long as the network allows it.

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

1. Use the Pi's default mDNS name, usually `http://raspberrypi.local:3000` or whatever you set with `hostnamectl`.
2. Give the Pi a static DHCP reservation in your router so its IP does not change.
3. Add a local DNS entry in your router if your router supports it.

For most home LAN setups, a DHCP reservation plus `raspberrypi.local` is enough.

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

### The app opens on the Pi itself but not on other devices

- confirm the Pi IP with `hostname -I`
- confirm the client is listening on `0.0.0.0`, not only `localhost`
- confirm the device is on the same LAN
- check for guest Wi-Fi or AP isolation
- check `ufw` or any other firewall rules

### The page loads, but uploads or YouTube imports fail

- make sure `PUBLIC_BASE_URL` points at a LAN-reachable server URL
- make sure `apps/client/.env` points at the correct server URL and WebSocket URL
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
- confirm `NEXT_PUBLIC_WS_URL` uses `ws://.../ws` on LAN HTTP setups
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
