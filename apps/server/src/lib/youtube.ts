import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";

interface YoutubeThumbnail {
  url?: string;
}

interface YoutubeFlatEntry {
  _type?: string;
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
  original_url?: string;
  thumbnail?: string;
  thumbnails?: YoutubeThumbnail[];
}

interface YoutubeMetadata extends YoutubeFlatEntry {
  entries?: YoutubeFlatEntry[];
  playlist_id?: string;
  webpage_url_basename?: string;
}

export interface YoutubeImportTrack {
  id: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl?: string;
}

export interface YoutubeImportPlan {
  kind: "single" | "playlist";
  title?: string;
  playlistId?: string;
  tracks: YoutubeImportTrack[];
}

export interface DownloadedYoutubeTrack {
  cleanup: () => Promise<void>;
  filePath: string;
}

function isYoutubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "youtu.be" || parsed.hostname.endsWith("youtube.com");
  } catch {
    return false;
  }
}

function runCommand(command: string, args: string[], options?: { cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      const details = stderr.trim() || stdout.trim() || `exit code ${code}`;
      reject(new Error(`${command} failed: ${details}`));
    });
  });
}

function getBestThumbnailUrl(metadata: YoutubeFlatEntry): string | undefined {
  if (metadata.thumbnail) {
    return metadata.thumbnail;
  }

  return metadata.thumbnails?.map((thumbnail) => thumbnail.url).find((url): url is string => !!url);
}

function toTrack(entry: YoutubeFlatEntry): YoutubeImportTrack | null {
  const id = entry.id ?? entry.url;
  if (!id) {
    return null;
  }

  const title = entry.title?.trim() || `youtube-${id}`;
  const sourceUrl = entry.webpage_url ?? entry.original_url ?? `https://www.youtube.com/watch?v=${id}`;

  return {
    id,
    title,
    sourceUrl,
    thumbnailUrl: getBestThumbnailUrl(entry),
  };
}

export async function getYoutubeImportPlan(url: string): Promise<YoutubeImportPlan> {
  if (!isYoutubeUrl(url)) {
    throw new Error("Only YouTube URLs are supported");
  }

  const raw = await runCommand("yt-dlp", ["--dump-single-json", "--flat-playlist", "--no-warnings", url]);

  const metadata = JSON.parse(raw) as YoutubeMetadata;

  if (Array.isArray(metadata.entries) && metadata.entries.length > 0) {
    const tracks = metadata.entries
      .map((entry) => toTrack(entry))
      .filter((track): track is YoutubeImportTrack => track !== null);

    return {
      kind: "playlist",
      title: metadata.title?.trim() || "Imported Playlist",
      playlistId: metadata.id ?? metadata.playlist_id,
      tracks,
    };
  }

  const singleTrack = toTrack(metadata);
  if (!singleTrack) {
    throw new Error("Could not extract YouTube video information");
  }

  return {
    kind: "single",
    title: metadata.title?.trim(),
    tracks: [singleTrack],
  };
}

function getDownloadedFilePath(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const downloadedPath = lines[lines.length - 1];
  if (!downloadedPath) {
    throw new Error("yt-dlp did not report a downloaded file path");
  }

  return downloadedPath;
}

export async function downloadYoutubeTrack(track: YoutubeImportTrack): Promise<DownloadedYoutubeTrack> {
  const tempDir = await mkdtemp(join(tmpdir(), "beatsync-youtube-"));

  try {
    const stdout = await runCommand("yt-dlp", [
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "--output",
      join(tempDir, "%(id)s.%(ext)s"),
      "--print",
      "after_move:filepath",
      track.sourceUrl,
    ]);

    const filePath = getDownloadedFilePath(stdout);

    return {
      filePath,
      cleanup: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function downloadYoutubeThumbnail(
  thumbnailUrl: string
): Promise<{ bytes: Uint8Array; contentType: string; extension: string } | null> {
  const response = await fetch(thumbnailUrl);
  if (!response.ok) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const pathname = new URL(thumbnailUrl).pathname;
  const extension = extname(pathname) || ".jpg";

  return {
    bytes: new Uint8Array(arrayBuffer),
    contentType,
    extension,
  };
}
