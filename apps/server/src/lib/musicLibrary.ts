import { R2_AUDIO_FILE_NAME_DELIMITER } from "@beatsync/shared";
import type { AudioSourceType } from "@beatsync/shared";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { corsHeaders, errorResponse } from "@/utils/responses";

export const MUSIC_LIBRARY_ROUTE_PREFIX = "/audio/library/";

const AUDIO_EXTENSIONS = new Set([".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav", ".webm"]);

function configuredDirectory(): string | null {
  const value = process.env.BEATSYNC_MUSIC_DIR?.trim();
  return value ? path.resolve(value) : null;
}

function isAudioFile(fileName: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function encodeRelativePath(relativePath: string): string {
  return relativePath
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const generatedSuffixIndex = withoutExtension.lastIndexOf(R2_AUDIO_FILE_NAME_DELIMITER);

  if (generatedSuffixIndex > 0) {
    return withoutExtension.slice(0, generatedSuffixIndex);
  }

  return withoutExtension;
}

async function listAudioFiles(root: string, currentDirectory = root): Promise<string[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listAudioFiles(root, fullPath)));
      continue;
    }

    // Deliberately ignore symlinks and non-audio files. Hard-linked files are
    // normal files and remain supported for zero-copy migrations on the Pi.
    if (entry.isFile() && isAudioFile(entry.name)) {
      files.push(path.relative(root, fullPath));
    }
  }

  return files;
}

function decodeLibraryPath(pathname: string): string[] | null {
  if (!pathname.startsWith(MUSIC_LIBRARY_ROUTE_PREFIX)) return null;

  const encodedSegments = pathname.slice(MUSIC_LIBRARY_ROUTE_PREFIX.length).split("/").filter(Boolean);
  if (encodedSegments.length === 0) return null;

  try {
    const segments = encodedSegments.map((segment) => decodeURIComponent(segment));
    if (
      segments.some(
        (segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")
      )
    ) {
      return null;
    }
    return segments;
  } catch {
    return null;
  }
}

async function resolveLibraryFile(pathname: string): Promise<string | null> {
  const root = configuredDirectory();
  const segments = decodeLibraryPath(pathname);
  if (!root || !segments) return null;

  try {
    const canonicalRoot = await realpath(root);
    const candidate = path.resolve(canonicalRoot, ...segments);
    const canonicalFile = await realpath(candidate);

    if (!canonicalFile.startsWith(`${canonicalRoot}${path.sep}`) || !isAudioFile(canonicalFile)) {
      return null;
    }

    const fileStats = await stat(canonicalFile);
    return fileStats.isFile() ? canonicalFile : null;
  } catch {
    return null;
  }
}

export function hasConfiguredMusicLibrary(): boolean {
  return configuredDirectory() !== null;
}

export function isMusicLibraryPath(pathname: string): boolean {
  return pathname.startsWith(MUSIC_LIBRARY_ROUTE_PREFIX);
}

export async function listConfiguredMusicLibrary(): Promise<AudioSourceType[]> {
  const root = configuredDirectory();
  if (!root) return [];

  const canonicalRoot = await realpath(root);
  const relativePaths = await listAudioFiles(canonicalRoot);

  return relativePaths
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))
    .map((relativePath) => ({
      sourceKind: "upload" as const,
      title: titleFromFileName(path.basename(relativePath)),
      url: `${MUSIC_LIBRARY_ROUTE_PREFIX}${encodeRelativePath(relativePath)}`,
    }));
}

export async function musicLibraryAudioExists(audioUrl: string): Promise<boolean> {
  try {
    const pathname = new URL(audioUrl, "http://localhost").pathname;
    return (await resolveLibraryFile(pathname)) !== null;
  } catch {
    return false;
  }
}

export async function serveMusicLibraryAudio(pathname: string): Promise<Response> {
  const filePath = await resolveLibraryFile(pathname);
  if (!filePath) return errorResponse("File not found", 404);

  const file = Bun.file(filePath);
  const fileStats = await stat(filePath);

  return new Response(file, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=3600",
      "Content-Length": fileStats.size.toString(),
      "Content-Type": file.type || "application/octet-stream",
    },
  });
}
