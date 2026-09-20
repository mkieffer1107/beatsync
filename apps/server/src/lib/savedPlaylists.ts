import { downloadYoutubeTrack, getYoutubeImportPlan, type YoutubeImportTrack } from "@/lib/youtube";
import { storeUniqueAudio } from "@/lib/audioFileStore";
import { corsHeaders, errorResponse } from "@/utils/responses";
import { PlaylistSchema, type AudioSourceType, type PlaylistType } from "@beatsync/shared";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import sanitize from "sanitize-filename";
import { z } from "zod";

export const SAVED_PLAYLIST_ROUTE_PREFIX = "/audio/saved-playlists/";
const MANIFEST_FILE_NAME = ".beatsync-playlist.json";
const DEFAULT_PLAYLIST_FILE_NAME = ".beatsync-default-playlist.json";
const MANIFEST_VERSION = 1;
const DOWNLOAD_CONCURRENCY = 3;

const SavedPlaylistTrackSchema = z.object({
  youtubeId: z.string().min(1),
  title: z.string().min(1),
  fileName: z.string().min(1),
  sourceUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  durationSeconds: z.number().positive().optional(),
});

const SavedPlaylistManifestSchema = z.object({
  version: z.literal(MANIFEST_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  sourceKind: z.literal("youtube"),
  externalId: z.string().min(1).optional(),
  originalUrl: z.string().url(),
  createdAt: z.number(),
  updatedAt: z.number(),
  tracks: z.array(SavedPlaylistTrackSchema),
});

const DefaultPlaylistSchema = z.object({
  playlistId: z.string().min(1),
  updatedAt: z.number().optional(),
});

type SavedPlaylistManifest = z.infer<typeof SavedPlaylistManifestSchema>;

interface LoadedManifest {
  directoryName: string;
  directoryPath: string;
  manifest: SavedPlaylistManifest;
}

export interface SavedPlaylistSyncResult {
  addedCount: number;
  failedCount: number;
  failedTracks: { title: string; youtubeId: string }[];
  playlist: PlaylistType;
  removedCount: number;
  unchangedCount: number;
}

const activeSyncs = new Map<string, Promise<SavedPlaylistSyncResult>>();

export function isPermanentYoutubeUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /video unavailable|video is not available|requested format is not available|this video is unavailable|private video|uploader has not made this video available|account associated with this video has been terminated|copyright claim|members-only content/i.test(
    message
  );
}

export function getSavedPlaylistsRoot(): string {
  const configured = process.env.BEATSYNC_PLAYLISTS_DIR?.trim();
  return path.resolve(configured?.length ? configured : path.join(process.cwd(), "storage", "saved-playlists"));
}

function getDefaultPlaylistFilePath(): string {
  return path.join(getSavedPlaylistsRoot(), DEFAULT_PLAYLIST_FILE_NAME);
}

export async function getSavedDefaultPlaylistId(): Promise<string | null> {
  try {
    const raw = await readFile(getDefaultPlaylistFilePath(), "utf8");
    return DefaultPlaylistSchema.parse(JSON.parse(raw)).playlistId;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Ignoring invalid saved default playlist setting:", error);
    }
    return null;
  }
}

export async function setSavedDefaultPlaylistId(playlistId: string): Promise<void> {
  const root = getSavedPlaylistsRoot();
  await mkdir(root, { recursive: true });
  const destination = getDefaultPlaylistFilePath();
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ playlistId, updatedAt: Date.now() }, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
}

function safeDirectoryName(name: string): string {
  const normalized = sanitize(name.trim(), { replacement: "-" }).replace(/\s+/g, " ").trim();
  return normalized || "Saved Playlist";
}

function safeTrackFileName(track: YoutubeImportTrack): string {
  const title = sanitize(track.title.trim(), { replacement: "-" }).replace(/\s+/g, " ").trim() || "Track";
  const boundedTitle = title.slice(0, 140).trim();
  const safeId = track.id.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${boundedTitle} [${safeId}].mp3`;
}

function encodePath(relativePath: string): string {
  return relativePath
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function playlistAudioUrl(directoryName: string, fileName: string): string {
  return `${SAVED_PLAYLIST_ROUTE_PREFIX}${encodePath(path.join(directoryName, fileName))}`;
}

async function pathIsFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function loadManifest(directoryPath: string, directoryName: string): Promise<LoadedManifest | null> {
  try {
    const raw = await readFile(path.join(directoryPath, MANIFEST_FILE_NAME), "utf8");
    return {
      directoryName,
      directoryPath,
      manifest: SavedPlaylistManifestSchema.parse(JSON.parse(raw)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Ignoring invalid saved playlist manifest in ${directoryPath}:`, error);
    }
    return null;
  }
}

async function listLoadedManifests(): Promise<LoadedManifest[]> {
  const root = getSavedPlaylistsRoot();
  await mkdir(root, { recursive: true });
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const manifests: LoadedManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const loaded = await loadManifest(path.join(root, entry.name), entry.name);
    if (loaded) manifests.push(loaded);
  }

  return manifests;
}

function toPlaylist(loaded: LoadedManifest): PlaylistType {
  const { directoryName, manifest } = loaded;
  const tracks: AudioSourceType[] = manifest.tracks.map((track, index) => ({
    url: playlistAudioUrl(directoryName, track.fileName),
    title: track.title,
    artworkUrl: track.thumbnailUrl,
    originalUrl: track.sourceUrl,
    sourceKind: "youtube",
    externalId: `youtube:${track.youtubeId}`,
    metadata: {
      sourceUrl: track.sourceUrl,
      youtubeVideoId: track.youtubeId,
      durationSeconds: track.durationSeconds,
    },
    collection: {
      type: "youtube-playlist",
      id: manifest.id,
      externalId: manifest.externalId,
      name: manifest.name,
      position: index + 1,
    },
  }));

  return PlaylistSchema.parse({
    id: manifest.id,
    name: manifest.name,
    artworkUrl: tracks.find((track) => track.artworkUrl)?.artworkUrl,
    sourceKind: "youtube",
    externalId: manifest.externalId,
    originalUrl: manifest.originalUrl,
    isSaved: true,
    trackUrls: tracks.map((track) => track.url),
    tracks,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  });
}

async function uniqueDirectoryName(name: string, playlistId: string, currentDirectoryName?: string): Promise<string> {
  const root = getSavedPlaylistsRoot();
  const base = safeDirectoryName(name);
  let candidate = base;
  let suffix = 2;

  while (candidate !== currentDirectoryName) {
    const candidatePath = path.join(root, candidate);
    try {
      const candidateStats = await stat(candidatePath);
      if (!candidateStats.isDirectory()) {
        candidate = `${base} ${suffix++}`;
        continue;
      }

      const loaded = await loadManifest(candidatePath, candidate);
      if (loaded?.manifest.id === playlistId) return candidate;
      candidate = `${base} ${suffix++}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
      throw error;
    }
  }

  return candidate;
}

async function writeManifest(directoryPath: string, manifest: SavedPlaylistManifest): Promise<void> {
  const destination = path.join(directoryPath, MANIFEST_FILE_NAME);
  const temporary = path.join(directoryPath, `${MANIFEST_FILE_NAME}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
}

async function syncSavedYoutubePlaylistInternal(params: {
  name?: string;
  originalUrl: string;
  playlistId?: string;
}): Promise<SavedPlaylistSyncResult> {
  const plan = await getYoutubeImportPlan(params.originalUrl, "playlist");
  if (plan.kind !== "playlist") throw new Error("That URL does not resolve to a YouTube playlist");
  const uniquePlanTracks = [...new Map(plan.tracks.map((track) => [track.id, track])).values()];
  if (uniquePlanTracks.length === 0) {
    throw new Error("YouTube returned an empty playlist. The saved copy was left unchanged.");
  }

  const manifests = await listLoadedManifests();
  const existing =
    (params.playlistId ? manifests.find((item) => item.manifest.id === params.playlistId) : undefined) ??
    (plan.playlistId ? manifests.find((item) => item.manifest.externalId === plan.playlistId) : undefined);
  const playlistId = existing?.manifest.id ?? params.playlistId ?? randomUUID();
  const name =
    [params.name, existing?.manifest.name, plan.title].find((candidate) => candidate?.trim())?.trim() ??
    "Saved Playlist";
  const root = getSavedPlaylistsRoot();
  await mkdir(root, { recursive: true });

  let directoryName = existing?.directoryName ?? (await uniqueDirectoryName(name, playlistId, existing?.directoryName));
  let directoryPath = existing?.directoryPath ?? path.join(root, directoryName);
  await mkdir(directoryPath, { recursive: true });

  const existingTracks = new Map(existing?.manifest.tracks.map((track) => [track.youtubeId, track]) ?? []);
  const reusableTracks = new Map<string, string[]>();
  for (const item of manifests) {
    for (const track of item.manifest.tracks) {
      const files = reusableTracks.get(track.youtubeId) ?? [];
      files.push(path.join(item.directoryPath, track.fileName));
      reusableTracks.set(track.youtubeId, files);
    }
  }
  const deduplicationRoots = [
    root,
    path.resolve(process.env.LOCAL_STORAGE_ROOT ?? path.join(process.cwd(), "storage")),
    ...(process.env.BEATSYNC_MUSIC_DIR?.trim() ? [path.resolve(process.env.BEATSYNC_MUSIC_DIR.trim())] : []),
  ];
  const createdFiles: string[] = [];
  const limit = pLimit(DOWNLOAD_CONCURRENCY);
  let addedCount = 0;
  let unchangedCount = 0;

  try {
    const outcomes = await Promise.all(
      uniquePlanTracks.map(async (track) => {
        try {
          return await limit(async () => {
            const previous = existingTracks.get(track.id);
            if (previous && (await pathIsFile(path.join(directoryPath, previous.fileName)))) {
              unchangedCount += 1;
              return {
                kind: "track" as const,
                track: {
                  ...previous,
                  title: track.title,
                  sourceUrl: track.sourceUrl,
                  thumbnailUrl: track.thumbnailUrl,
                  durationSeconds: track.durationSeconds,
                },
              };
            }

            const fileName = safeTrackFileName(track);
            const finalPath = path.join(directoryPath, fileName);
            let reusableFile: string | undefined;
            for (const candidate of reusableTracks.get(track.id) ?? []) {
              if (await pathIsFile(candidate)) {
                reusableFile = candidate;
                break;
              }
            }
            if (reusableFile) {
              await storeUniqueAudio(reusableFile, finalPath, deduplicationRoots);
              createdFiles.push(finalPath);
            } else {
              const download = await downloadYoutubeTrack(track);
              try {
                await storeUniqueAudio(download.filePath, finalPath, deduplicationRoots);
                createdFiles.push(finalPath);
              } finally {
                await download.cleanup();
              }
            }

            addedCount += 1;
            return {
              kind: "track" as const,
              track: {
                youtubeId: track.id,
                title: track.title,
                fileName,
                sourceUrl: track.sourceUrl,
                thumbnailUrl: track.thumbnailUrl,
                durationSeconds: track.durationSeconds,
              },
            };
          });
        } catch (error) {
          return isPermanentYoutubeUnavailableError(error)
            ? { kind: "unavailable" as const, title: track.title, youtubeId: track.id }
            : { kind: "error" as const, error };
        }
      })
    );

    const fatalFailure = outcomes.find((outcome) => outcome.kind === "error");
    if (fatalFailure?.kind === "error") throw fatalFailure.error;

    const tracks = outcomes.filter((outcome) => outcome.kind === "track").map((outcome) => outcome.track);
    const failedTracks = outcomes
      .filter((outcome) => outcome.kind === "unavailable")
      .map((outcome) => ({ title: outcome.title, youtubeId: outcome.youtubeId }));
    if (tracks.length === 0) {
      throw new Error("No available tracks could be saved. The existing playlist was left unchanged.");
    }

    const now = Date.now();
    const manifest: SavedPlaylistManifest = {
      version: MANIFEST_VERSION,
      id: playlistId,
      name,
      sourceKind: "youtube",
      externalId: plan.playlistId ?? existing?.manifest.externalId,
      originalUrl: params.originalUrl,
      createdAt: existing?.manifest.createdAt ?? now,
      updatedAt: now,
      tracks,
    };

    await writeManifest(directoryPath, manifest);

    const upstreamTrackIds = new Set(uniquePlanTracks.map((track) => track.id));
    const removedTracks = (existing?.manifest.tracks ?? []).filter((track) => !upstreamTrackIds.has(track.youtubeId));
    for (const removedTrack of removedTracks) {
      await rm(path.join(directoryPath, removedTrack.fileName), { force: true });
    }

    const desiredDirectoryName = await uniqueDirectoryName(name, playlistId, directoryName);
    if (desiredDirectoryName !== directoryName) {
      const desiredDirectoryPath = path.join(root, desiredDirectoryName);
      await rename(directoryPath, desiredDirectoryPath);
      directoryName = desiredDirectoryName;
      directoryPath = desiredDirectoryPath;
    }

    return {
      addedCount,
      failedCount: failedTracks.length,
      failedTracks,
      removedCount: removedTracks.length,
      unchangedCount,
      playlist: toPlaylist({ directoryName, directoryPath, manifest }),
    };
  } catch (error) {
    await Promise.all(createdFiles.map((filePath) => rm(filePath, { force: true })));
    if (!existing) {
      try {
        await rmdir(directoryPath);
      } catch (cleanupError) {
        const code = (cleanupError as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTEMPTY") {
          console.warn(`Could not remove empty failed-playlist directory ${directoryPath}:`, cleanupError);
        }
      }
    }
    throw error;
  }
}

export async function syncSavedYoutubePlaylist(params: {
  name?: string;
  originalUrl: string;
  playlistId?: string;
}): Promise<SavedPlaylistSyncResult> {
  const key = params.playlistId ?? params.originalUrl;
  const active = activeSyncs.get(key);
  if (active) return await active;

  const sync = syncSavedYoutubePlaylistInternal(params).finally(() => activeSyncs.delete(key));
  activeSyncs.set(key, sync);
  return await sync;
}

export async function listSavedPlaylists(): Promise<PlaylistType[]> {
  const manifests = await listLoadedManifests();
  return manifests.map(toPlaylist).sort((left, right) => left.name.localeCompare(right.name));
}

export async function renameSavedPlaylist(playlistId: string, name: string): Promise<PlaylistType> {
  const manifests = await listLoadedManifests();
  const existing = manifests.find((item) => item.manifest.id === playlistId);
  if (!existing) throw new Error("Saved playlist not found");

  const nextName = name.trim();
  const nextDirectoryName = await uniqueDirectoryName(nextName, playlistId, existing.directoryName);
  const root = getSavedPlaylistsRoot();
  let directoryPath = existing.directoryPath;

  if (nextDirectoryName !== existing.directoryName) {
    directoryPath = path.join(root, nextDirectoryName);
    await rename(existing.directoryPath, directoryPath);
  }

  const manifest: SavedPlaylistManifest = {
    ...existing.manifest,
    name: nextName,
    updatedAt: Date.now(),
  };
  await writeManifest(directoryPath, manifest);
  return toPlaylist({ directoryName: nextDirectoryName, directoryPath, manifest });
}

function decodeSavedPlaylistPath(pathname: string): string[] | null {
  if (!pathname.startsWith(SAVED_PLAYLIST_ROUTE_PREFIX)) return null;
  const encoded = pathname.slice(SAVED_PLAYLIST_ROUTE_PREFIX.length).split("/").filter(Boolean);
  if (encoded.length !== 2) return null;

  try {
    const segments = encoded.map((segment) => decodeURIComponent(segment));
    return segments.some(
      (segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")
    )
      ? null
      : segments;
  } catch {
    return null;
  }
}

async function resolveSavedPlaylistFile(pathname: string): Promise<string | null> {
  const segments = decodeSavedPlaylistPath(pathname);
  if (!segments) return null;

  try {
    const canonicalRoot = await realpath(getSavedPlaylistsRoot());
    const candidate = path.resolve(canonicalRoot, ...segments);
    const canonicalFile = await realpath(candidate);
    if (
      !canonicalFile.startsWith(`${canonicalRoot}${path.sep}`) ||
      path.extname(canonicalFile).toLowerCase() !== ".mp3"
    ) {
      return null;
    }
    return (await stat(canonicalFile)).isFile() ? canonicalFile : null;
  } catch {
    return null;
  }
}

export function isSavedPlaylistPath(pathname: string): boolean {
  return pathname.startsWith(SAVED_PLAYLIST_ROUTE_PREFIX);
}

export async function savedPlaylistAudioExists(audioUrl: string): Promise<boolean> {
  try {
    return (await resolveSavedPlaylistFile(new URL(audioUrl, "http://localhost").pathname)) !== null;
  } catch {
    return false;
  }
}

export async function serveSavedPlaylistAudio(pathname: string): Promise<Response> {
  const filePath = await resolveSavedPlaylistFile(pathname);
  if (!filePath) return errorResponse("File not found", 404);
  const file = Bun.file(filePath);
  const fileStats = await stat(filePath);
  return new Response(file, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=3600",
      "Content-Length": fileStats.size.toString(),
      "Content-Type": file.type || "audio/mpeg",
    },
  });
}
