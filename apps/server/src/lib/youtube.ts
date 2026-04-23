import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, extname, join } from "node:path";
import { spawn } from "node:child_process";

interface YoutubeThumbnail {
  url?: string;
}

interface YoutubeFlatEntry {
  _type?: string;
  id?: string;
  title?: string;
  duration?: number;
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
  durationSeconds?: number;
}

export type YoutubeImportMode = "video" | "playlist";

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

interface ResolvedYoutubeImportRequest {
  url: string;
  mode: YoutubeImportMode;
}

interface ResolvedYtDlpBinary {
  command: string;
  version: string | null;
}

interface YtDlpAttempt {
  label: string;
  args: string[];
}

let resolvedYtDlpBinaryPromise: Promise<ResolvedYtDlpBinary> | null = null;

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

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
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

function getYoutubeVideoId(url: URL): string | null {
  if (url.hostname === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0]?.trim();
    return videoId || null;
  }

  if (url.pathname === "/watch") {
    const videoId = url.searchParams.get("v")?.trim();
    return videoId || null;
  }

  return null;
}

function isGeneratedYoutubeRadioUrl(url: URL): boolean {
  return url.searchParams.get("start_radio")?.trim() === "1" && getYoutubeVideoId(url) !== null;
}

export function resolveYoutubeImportRequest(
  url: string,
  mode: YoutubeImportMode = "video"
): ResolvedYoutubeImportRequest {
  if (!isYoutubeUrl(url)) {
    throw new Error("Only YouTube URLs are supported");
  }

  const parsedUrl = new URL(url);

  if (!isGeneratedYoutubeRadioUrl(parsedUrl)) {
    return { url, mode };
  }

  const videoId = getYoutubeVideoId(parsedUrl);
  if (!videoId) {
    return { url, mode };
  }

  return {
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    mode: "video",
  };
}

function parseYtDlpVersion(version: string): number[] | null {
  const match = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(version.trim());
  if (!match) {
    return null;
  }

  return match.slice(1).map((segment) => Number.parseInt(segment, 10));
}

function compareParsedVersions(left: number[] | null, right: number[] | null): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

function getYtDlpCandidates(): string[] {
  const explicitBinary = process.env.YTDLP_BINARY?.trim();
  if (explicitBinary) {
    return [explicitBinary];
  }

  const candidates = new Set<string>();
  const pathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);

  for (const entry of pathEntries) {
    candidates.add(join(entry, "yt-dlp"));
  }

  const home = homedir();
  candidates.add(join(home, ".vibe", "yt-dlp-master-env", "bin", "yt-dlp"));
  candidates.add(join(home, ".vibe", "yt-dlp-env", "bin", "yt-dlp"));
  candidates.add(join(home, ".local", "bin", "yt-dlp"));
  candidates.add(join(home, "miniforge3", "bin", "yt-dlp"));
  candidates.add("/opt/homebrew/bin/yt-dlp");
  candidates.add("/usr/local/bin/yt-dlp");

  return [...candidates];
}

async function resolveYtDlpBinary(): Promise<ResolvedYtDlpBinary> {
  if (resolvedYtDlpBinaryPromise) {
    return resolvedYtDlpBinaryPromise;
  }

  resolvedYtDlpBinaryPromise = (async () => {
    const candidates = getYtDlpCandidates();
    const resolvedCandidates: ResolvedYtDlpBinary[] = [];

    for (const candidate of candidates) {
      if (!existsSync(candidate)) {
        continue;
      }

      try {
        const version = await runCommand(candidate, ["--version"]);
        resolvedCandidates.push({
          command: candidate,
          version: version.trim() || null,
        });
      } catch {
        // Ignore non-working candidates and continue scanning.
      }
    }

    if (resolvedCandidates.length === 0) {
      return {
        command: "yt-dlp",
        version: null,
      };
    }

    resolvedCandidates.sort((left, right) => {
      const versionComparison = compareParsedVersions(parseYtDlpVersion(left.version ?? ""), parseYtDlpVersion(right.version ?? ""));
      if (versionComparison !== 0) {
        return -versionComparison;
      }

      return left.command.localeCompare(right.command);
    });

    return resolvedCandidates[0];
  })();

  return resolvedYtDlpBinaryPromise;
}

function getYoutubeCookieArgs(): string[] {
  const cookieFile = process.env.YTDLP_COOKIES_FILE?.trim();
  if (cookieFile) {
    return ["--cookies", cookieFile];
  }

  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) {
    return ["--cookies-from-browser", browser];
  }

  return [];
}

function getYoutubeExtraArgs(): string[] {
  const extractorArgs = process.env.YTDLP_EXTRACTOR_ARGS?.trim();
  if (!extractorArgs) {
    return [];
  }

  return ["--extractor-args", extractorArgs];
}

function getYoutubeDownloadAttempts(track: YoutubeImportTrack): YtDlpAttempt[] {
  const cookiesArgs = getYoutubeCookieArgs();
  const extraArgs = getYoutubeExtraArgs();
  const preferredFormat = process.env.YTDLP_FORMAT?.trim();
  const directAudioFormat =
    preferredFormat ??
    "bestaudio[ext=m4a]/bestaudio[acodec*=mp4a]/140/bestaudio[ext=webm]/251/250/249/18/best[ext=mp4]/best";

  const attempts: YtDlpAttempt[] = [
    {
      label: "direct audio or progressive format",
      args: [
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        ...cookiesArgs,
        ...extraArgs,
        "-f",
        directAudioFormat,
        "--fixup",
        "never",
      ],
    },
    {
      label: "best progressive mp4 fallback",
      args: [
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        ...cookiesArgs,
        ...extraArgs,
        "-f",
        "18/best[ext=mp4]/best",
        "--fixup",
        "never",
      ],
    },
    {
      label: "tv client fallback",
      args: [
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        ...cookiesArgs,
        "--extractor-args",
        "youtube:player_client=tv",
        "-f",
        directAudioFormat,
        "--fixup",
        "never",
      ],
    },
    {
      label: "ios client fallback",
      args: [
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        ...cookiesArgs,
        "--extractor-args",
        "youtube:player_client=ios",
        "-f",
        directAudioFormat,
        "--fixup",
        "never",
      ],
    },
  ];

  return attempts.map((attempt) => ({
    label: attempt.label,
    args: [
      ...attempt.args,
      "--output",
      join("%(tmpdir)s", "%(id)s.%(ext)s").replace("%(tmpdir)s", "__TEMP_DIR__"),
      "--print",
      "after_move:filepath",
      track.sourceUrl,
    ],
  }));
}

function formatYoutubeDownloadError(params: {
  errors: Error[];
  ytDlpBinary: ResolvedYtDlpBinary;
}): Error {
  const { errors, ytDlpBinary } = params;
  const lastError = errors[errors.length - 1];
  const combined = errors.map((error) => error.message).join("\n");
  const hints: string[] = [];

  if (/Requested format is not available/i.test(combined)) {
    hints.push(
      "The server retried multiple yt-dlp format fallbacks, but YouTube still rejected the selected media format."
    );
  }

  if (/Sign in to confirm you(?:'|’)re not a bot|cookies-from-browser|HTTP Error 403|The page needs to be reloaded/i.test(combined)) {
    hints.push(
      "This video currently needs an authenticated YouTube session. Set YTDLP_COOKIES_FROM_BROWSER=chrome (or another supported browser) in apps/server/.env and restart the server."
    );
  }

  if (ytDlpBinary.version && compareParsedVersions(parseYtDlpVersion(ytDlpBinary.version), [2026, 3, 17]) < 0) {
    hints.push(
      `Your yt-dlp binary looks old (${ytDlpBinary.version}). Install a newer build or set YTDLP_BINARY to a current yt-dlp executable. On macOS, a current master/nightly build is often required for YouTube imports.`
    );
  }

  const hintText = hints.length > 0 ? ` ${hints.join(" ")}` : "";

  return new Error(
    `Unable to import YouTube media using ${ytDlpBinary.command}${ytDlpBinary.version ? ` (${ytDlpBinary.version})` : ""}.` +
      hintText +
      ` Last error: ${lastError?.message ?? "unknown yt-dlp failure"}`
  );
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

  const title = entry.title?.trim() ?? `youtube-${id}`;
  const sourceUrl = entry.webpage_url ?? entry.original_url ?? `https://www.youtube.com/watch?v=${id}`;

  return {
    id,
    title,
    sourceUrl,
    thumbnailUrl: getBestThumbnailUrl(entry),
    durationSeconds: typeof entry.duration === "number" && entry.duration > 0 ? entry.duration : undefined,
  };
}

export const getYoutubeMetadataArgs = (mode: YoutubeImportMode) => [
  "--dump-single-json",
  ...(mode === "playlist" ? ["--flat-playlist"] : ["--no-playlist"]),
  "--no-warnings",
  ...getYoutubeCookieArgs(),
  ...getYoutubeExtraArgs(),
];

export function buildYoutubeImportPlanFromMetadata(
  metadata: YoutubeMetadata,
  mode: YoutubeImportMode = "video"
): YoutubeImportPlan {
  if (mode === "playlist" && Array.isArray(metadata.entries) && metadata.entries.length > 0) {
    const tracks = metadata.entries
      .map((entry) => toTrack(entry))
      .filter((track): track is YoutubeImportTrack => track !== null);

    return {
      kind: "playlist",
      title: metadata.title?.trim() ?? "Imported Playlist",
      playlistId: metadata.id ?? metadata.playlist_id,
      tracks,
    };
  }

  const singleTrack =
    toTrack(metadata) ??
    metadata.entries?.map((entry) => toTrack(entry)).find((track): track is YoutubeImportTrack => track !== null);

  if (!singleTrack) {
    throw new Error("Could not extract YouTube video information");
  }

  return {
    kind: "single",
    title: singleTrack.title,
    tracks: [singleTrack],
  };
}

export async function getYoutubeImportPlan(url: string, mode: YoutubeImportMode = "video"): Promise<YoutubeImportPlan> {
  const request = resolveYoutubeImportRequest(url, mode);
  const ytDlpBinary = await resolveYtDlpBinary();
  const raw = await runCommand(ytDlpBinary.command, [...getYoutubeMetadataArgs(request.mode), request.url]);

  const metadata = JSON.parse(raw) as YoutubeMetadata;
  return buildYoutubeImportPlanFromMetadata(metadata, request.mode);
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

async function transcodeAudioToMp3(inputPath: string, outputPath: string): Promise<void> {
  await runCommand("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vn",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "2",
    outputPath,
  ]);
}

export async function downloadYoutubeTrack(track: YoutubeImportTrack): Promise<DownloadedYoutubeTrack> {
  const tempDir = await mkdtemp(join(tmpdir(), "beatsync-youtube-"));
  const ytDlpBinary = await resolveYtDlpBinary();
  const attempts = getYoutubeDownloadAttempts(track);
  const errors: Error[] = [];

  try {
    for (const attempt of attempts) {
      try {
        const args = attempt.args.map((argument) =>
          argument === "__TEMP_DIR__" ? tempDir : argument.replace("__TEMP_DIR__", tempDir)
        );

        const stdout = await runCommand(ytDlpBinary.command, args);
        const downloadedPath = getDownloadedFilePath(stdout);
        const extension = extname(downloadedPath).toLowerCase();
        const filePath = extension === ".mp3" ? downloadedPath : join(tempDir, `${track.id}.mp3`);

        if (filePath !== downloadedPath) {
          await transcodeAudioToMp3(downloadedPath, filePath);
        }

        return {
          filePath,
          cleanup: async () => {
            await rm(tempDir, { recursive: true, force: true });
          },
        };
      } catch (error) {
        errors.push(
          error instanceof Error ? new Error(`${attempt.label}: ${error.message}`) : new Error(`${attempt.label}: ${String(error)}`)
        );
      }
    }

    throw formatYoutubeDownloadError({
      errors,
      ytDlpBinary,
    });
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
