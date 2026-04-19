# Running Beatsync on a Local Mac

This guide is for running this repo directly on a Mac instead of a Raspberry Pi.

It covers two setups:

1. local-only: you use Beatsync on the same Mac that is running it
2. LAN mode from your Mac: other devices on your network connect to your Mac-hosted instance

This repo was verified locally with:

- client on `http://127.0.0.1:3000`
- server on `http://127.0.0.1:8080`
- local storage mode enabled

## 0. Fastest option

If you just want one command that starts everything, use:

```bash
cd ~/programming/beatsync
./scripts/run-local-mac.sh
```

For LAN mode from your Mac:

```bash
cd ~/programming/beatsync
./scripts/run-local-mac.sh --lan
```

That LAN mode now uses a production build by default, which is the recommended path for phones and tablets.
If you explicitly want live-reload development servers on the LAN, use:

```bash
cd ~/programming/beatsync
./scripts/run-local-mac.sh --lan --dev
```

What the script does:

- creates a local storage directory if needed
- sets the required server/client env vars
- in local mode, starts dev servers by default
- in LAN mode, builds the app and starts production servers by default
- starts the server on `8080`
- starts the client on `3000`
- on macOS, automatically uses `YTDLP_COOKIES_FROM_BROWSER=chrome` if Google Chrome is installed and you did not set another cookie source
- stops both when you press `Ctrl-C`

## 1. Install prerequisites

Install the tools with Homebrew:

```bash
brew install bun ffmpeg uv
```

Install `yt-dlp` with `uv`:

```bash
uv tool install yt-dlp
```

Check the tools:

```bash
bun --version
ffmpeg -version
ffprobe -version
yt-dlp --version
```

If `yt-dlp` is not found after installing it, make sure your shell can see `uv` tool binaries. On most macOS setups that means ensuring the relevant user bin directory is on `PATH`.

## 2. Clone the repo and install dependencies

```bash
git clone https://github.com/mkieffer1107/beatsync.git ~/programming/beatsync
cd ~/programming/beatsync
bun install
```

## 3. Choose a local storage directory

Use a normal writable directory on your Mac. A simple choice is:

```bash
mkdir -p ~/.vibe/storage
```

Do not use a storage directory inside the repo while running `next dev` / `bun --hot`.
When YouTube imports, uploads, thumbnails, or state backups write files into the workspace, the dev tooling can interpret those writes as project changes and force reloads or apparent restarts.

This repo uses `LOCAL_STORAGE_ROOT` for:

- uploaded tracks
- imported YouTube audio
- thumbnails
- state backups

## 4. Pick your run mode

You have two sane choices on a Mac:

1. local-only mode with `localhost`
2. LAN mode with your Mac's network IP or hostname

### Local-only mode

Use this if you are only opening Beatsync on the same Mac.

Create `apps/server/.env`:

```env
LOCAL_STORAGE_ROOT=/Users/your-username/.vibe/storage
PUBLIC_BASE_URL=http://localhost:8080
```

Optional but recommended for more reliable YouTube imports:

```env
YTDLP_COOKIES_FROM_BROWSER=chrome
```

Create `apps/client/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

### LAN mode from your Mac

Use this if you want phones, tablets, or other computers on your network to connect to the instance running on your Mac.

First, find your Mac's LAN IP:

```bash
ipconfig getifaddr en0
ipconfig getifaddr en1
```

Use the address that matches your active interface. For example:

```text
192.168.254.10
```

Create `apps/server/.env`:

```env
LOCAL_STORAGE_ROOT=/Users/your-username/.vibe/storage
PUBLIC_BASE_URL=http://192.168.254.10:8080
```

Optional but recommended for more reliable YouTube imports:

```env
YTDLP_COOKIES_FROM_BROWSER=chrome
```

Create `apps/client/.env`:

```env
NEXT_PUBLIC_API_URL=http://192.168.254.10:8080
NEXT_PUBLIC_WS_URL=ws://192.168.254.10:8080/ws
```

Important:

- do not use `localhost` in the client env if other devices will open the app
- when a phone loads the app, `localhost` would point at the phone itself, not your Mac

If you prefer a hostname, you can replace the IP with a hostname that other devices on your LAN can actually resolve.

### Notes about YouTube imports on macOS

Current YouTube downloading is more fragile than it used to be. Some videos work anonymously, but others now require:

- a current `yt-dlp`
- and sometimes browser cookies from a signed-in session

This repo now:

- tries multiple `yt-dlp` download strategies instead of only one
- prefers a newer installed `yt-dlp` if multiple copies exist on your machine
- supports these optional server env vars:

```env
YTDLP_BINARY=/full/path/to/yt-dlp
YTDLP_COOKIES_FROM_BROWSER=chrome
YTDLP_COOKIES_FILE=/full/path/to/cookies.txt
YTDLP_FORMAT=ba/b
YTDLP_EXTRACTOR_ARGS=
```

Recommended default on a Mac:

```env
YTDLP_COOKIES_FROM_BROWSER=chrome
```

If you have an older `yt-dlp` somewhere earlier on your `PATH`, you can pin the one you want:

```env
YTDLP_BINARY=/Users/your-username/.local/bin/yt-dlp
```

## 5. Start it in development mode

From the repo root:

```bash
bun dev
```

That starts:

- client on port `3000`
- server on port `8080`

In local-only mode, open:

- `http://localhost:3000`

In LAN mode, open:

- `http://<your-mac-ip>:3000`

Examples:

- `http://127.0.0.1:3000`
- `http://192.168.254.10:3000`

## 6. Start it in production mode

Build everything from the repo root:

```bash
cd ~/programming/beatsync
bun run build
```

Start the server:

```bash
cd ~/programming/beatsync/apps/server
bun run start
```

Start the client in a second shell.

For local-only mode:

```bash
cd ~/programming/beatsync/apps/client
HOSTNAME=127.0.0.1 PORT=3000 bun run start
```

For LAN mode:

```bash
cd ~/programming/beatsync/apps/client
HOSTNAME=0.0.0.0 PORT=3000 bun run start
```

Port behavior in this repo:

- the server listens on `8080`
- the client listens on `3000` by default
- the client port can be changed with `PORT=...`
- the server port is currently fixed in code at `8080`

Useful check:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

Expected processes:

- `next dev` or `next start` on `3000`
- `bun` on `8080`

## 7. Which URL should you open?

### Same Mac

Use:

- `http://localhost:3000`
- or `http://127.0.0.1:3000`

### Other devices on your LAN

Use:

- `http://<your-mac-ip>:3000`

Example:

- `http://192.168.254.10:3000`

If you use a hostname instead of an IP, make sure that hostname resolves correctly on the other device.

## 8. macOS firewall and permissions

If another device on your network cannot reach the app:

- check macOS firewall settings
- allow incoming connections for terminal apps if prompted
- make sure your Mac and the client device are on the same network
- make sure you started the client with `HOSTNAME=0.0.0.0` for LAN mode

## 9. Troubleshooting

### Port `3000` is already in use

Find the process:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Stop it:

```bash
kill <PID>
```

If needed:

```bash
kill -9 <PID>
```

### Port `8080` is already in use

Find the process:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

Stop it:

```bash
kill <PID>
```

### The browser opens but uploads or imports fail

Check:

```bash
which yt-dlp
which ffmpeg
which ffprobe
ls -ld ~/.vibe/storage
```

Make sure:

- `LOCAL_STORAGE_ROOT` exists
- your user can write to it
- `yt-dlp`, `ffmpeg`, and `ffprobe` are on `PATH`

### Another device cannot reach the app on your Mac

Check:

```bash
ipconfig getifaddr en0
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Make sure:

- the client is bound to `0.0.0.0`
- the IP in `apps/client/.env` and `apps/server/.env` matches your Mac's current LAN IP
- your Mac firewall is not blocking the connection
- both devices are on the same LAN

## 10. Verified local run

This repo was actually started locally with:

- server responding on `http://127.0.0.1:8080`
- client responding on `http://127.0.0.1:3000`
- storage mode set to local

If you want to keep it simple, start with local-only mode first. Once that works, switch the env files to your Mac's LAN IP if you want other devices to connect.
