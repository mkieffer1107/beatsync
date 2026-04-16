import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2_AUDIO_FILE_NAME_DELIMITER } from "@beatsync/shared";
import { config } from "dotenv";
import { mkdir, readdir, readFile, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import sanitize from "sanitize-filename";
import { corsHeaders, errorResponse } from "@/utils/responses";

config();

const S3_CONFIG = {
  BUCKET_NAME: process.env.S3_BUCKET_NAME,
  PUBLIC_URL: process.env.S3_PUBLIC_URL,
  ENDPOINT: process.env.S3_ENDPOINT,
  ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
};

const LOCAL_STORAGE_ROOT = path.resolve(process.env.LOCAL_STORAGE_ROOT ?? path.join(process.cwd(), "storage"));
const DEFAULT_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
const LOCAL_AUDIO_ROUTE_PREFIX = "/audio/";
const LOCAL_UPLOAD_ROUTE_PREFIX = "/upload/local/";
const DEFAULT_UPLOAD_EXPIRY_SECONDS = 3600;

type StorageMode = "local" | "r2";

interface StorageObject {
  Key?: string;
  Size?: number;
}

interface PendingLocalUpload {
  contentType: string;
  expiresAt: number;
  key: string;
}

const pendingLocalUploads = new Map<string, PendingLocalUpload>();
let observedPublicBaseUrl: string | null = DEFAULT_PUBLIC_BASE_URL ?? null;

const r2Client = hasValidR2Config()
  ? new S3Client({
      region: "auto",
      endpoint: S3_CONFIG.ENDPOINT,
      credentials: {
        accessKeyId: S3_CONFIG.ACCESS_KEY_ID!,
        secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY!,
      },
    })
  : null;

export interface AudioFileMetadata {
  roomId: string;
  fileName: string;
  originalName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface OrphanedRoomInfo {
  roomId: string;
  fileCount: number;
}

export interface OrphanCleanupResult {
  orphanedRooms: OrphanedRoomInfo[];
  totalRooms: number;
  totalFiles: number;
  deletedFiles?: number;
  errors?: string[];
}

function hasValidR2Config(): boolean {
  return Object.values(S3_CONFIG).every(Boolean);
}

function requireR2Client(): S3Client {
  if (!r2Client) {
    throw new Error("R2 client requested but S3/R2 configuration is incomplete");
  }

  return r2Client;
}

function normalizeBaseUrl(baseUrl?: string | null): string | null {
  if (!baseUrl) return null;
  return baseUrl.replace(/\/$/, "");
}

function encodeKeyForUrl(key: string): string {
  return key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function decodeKeyFromPath(pathname: string): string | null {
  const withoutLeadingSlash = pathname.replace(/^\/+/, "");
  const withoutAudioPrefix = withoutLeadingSlash.startsWith("audio/")
    ? withoutLeadingSlash.slice("audio/".length)
    : withoutLeadingSlash;

  if (!withoutAudioPrefix) {
    return null;
  }

  try {
    return withoutAudioPrefix
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch (error) {
    console.error(`Failed to decode storage key from path ${pathname}:`, error);
    return null;
  }
}

function resolvePublicBaseUrl(baseUrl?: string): string {
  const normalized = normalizeBaseUrl(baseUrl) ?? observedPublicBaseUrl ?? "http://localhost:8080";
  observedPublicBaseUrl = normalized;
  return normalized;
}

function ensureSafeStorageKey(key: string): string {
  const normalizedKey = key.replace(/^\/+/, "");
  const segments = normalizedKey.split("/").filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    throw new Error(`Invalid storage key: ${key}`);
  }

  return segments.join("/");
}

function resolveLocalPathFromKey(key: string): string {
  const safeKey = ensureSafeStorageKey(key);
  const fullPath = path.resolve(LOCAL_STORAGE_ROOT, ...safeKey.split("/"));

  if (fullPath !== LOCAL_STORAGE_ROOT && !fullPath.startsWith(`${LOCAL_STORAGE_ROOT}${path.sep}`)) {
    throw new Error(`Refusing to access path outside storage root: ${key}`);
  }

  return fullPath;
}

async function ensureParentDirectoryForKey(key: string): Promise<string> {
  const filePath = resolveLocalPathFromKey(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  return filePath;
}

async function localFileExists(key: string): Promise<boolean> {
  try {
    const stats = await stat(resolveLocalPathFromKey(key));
    return stats.isFile();
  } catch {
    return false;
  }
}

async function listLocalObjectsRecursively(dir = LOCAL_STORAGE_ROOT): Promise<StorageObject[]> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const results: StorageObject[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await listLocalObjectsRecursively(fullPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStats = await stat(fullPath);
    const key = path.relative(LOCAL_STORAGE_ROOT, fullPath).split(path.sep).join("/");
    results.push({
      Key: key,
      Size: fileStats.size,
    });
  }

  return results;
}

async function listLocalObjectsWithPrefix(prefix: string): Promise<StorageObject[]> {
  const normalizedPrefix = prefix.replace(/^\/+/, "");
  const objects = await listLocalObjectsRecursively();

  return objects.filter((obj) => obj.Key?.startsWith(normalizedPrefix));
}

async function writeLocalBytesForKey(
  key: string,
  bytes: Uint8Array | ArrayBuffer,
  _contentType = "application/octet-stream"
): Promise<void> {
  const filePath = await ensureParentDirectoryForKey(key);
  const body = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  await Bun.write(filePath, body);
}

async function pruneEmptyDirectories(startDir: string): Promise<void> {
  let currentDir = path.resolve(startDir);

  while (currentDir.startsWith(LOCAL_STORAGE_ROOT) && currentDir !== LOCAL_STORAGE_ROOT) {
    try {
      const contents = await readdir(currentDir);
      if (contents.length > 0) {
        return;
      }

      await rmdir(currentDir);
      currentDir = path.dirname(currentDir);
    } catch {
      return;
    }
  }
}

function pruneExpiredLocalUploadTokens(): void {
  const now = Date.now();

  for (const [token, upload] of pendingLocalUploads.entries()) {
    if (upload.expiresAt <= now) {
      pendingLocalUploads.delete(token);
    }
  }
}

async function deleteLocalObject(key: string): Promise<void> {
  const filePath = resolveLocalPathFromKey(key);
  await rm(filePath, { force: true });
  await pruneEmptyDirectories(path.dirname(filePath));
}

async function deleteLocalObjectsWithPrefix(prefix = ""): Promise<{ deletedCount: number }> {
  const objects = await listLocalObjectsWithPrefix(prefix);

  for (const object of objects) {
    if (!object.Key) continue;
    await deleteLocalObject(object.Key);
  }

  return {
    deletedCount: objects.length,
  };
}

function getContentTypeForLocalFile(filePath: string): string {
  return Bun.file(filePath).type || "application/octet-stream";
}

function isLocalAudioPath(pathname: string): boolean {
  return pathname.startsWith(LOCAL_AUDIO_ROUTE_PREFIX);
}

/**
 * Create a consistent key for room-scoped storage
 */
export function createKey(roomId: string, fileName: string): string {
  return `room-${roomId}/${fileName}`;
}

export function observePublicBaseUrl(baseUrl?: string | null): void {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return;
  observedPublicBaseUrl = normalized;
}

export function getStorageMode(): StorageMode {
  return hasValidR2Config() ? "r2" : "local";
}

/**
 * Generate a presigned URL for uploading audio files to R2
 */
export async function generatePresignedUploadUrl(
  roomId: string,
  fileName: string,
  contentType: string,
  expiresIn = DEFAULT_UPLOAD_EXPIRY_SECONDS
): Promise<string> {
  const key = createKey(roomId, fileName);

  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Metadata: {
      roomId,
      uploadedAt: new Date().toISOString(),
    },
  });

  return await getSignedUrl(requireR2Client(), command, { expiresIn });
}

export async function createUploadTarget({
  baseUrl,
  contentType,
  expiresIn = DEFAULT_UPLOAD_EXPIRY_SECONDS,
  fileName,
  roomId,
}: {
  baseUrl?: string;
  contentType: string;
  expiresIn?: number;
  fileName: string;
  roomId: string;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  if (getStorageMode() === "r2") {
    return {
      uploadUrl: await generatePresignedUploadUrl(roomId, fileName, contentType, expiresIn),
      publicUrl: getPublicAudioUrl(roomId, fileName, baseUrl),
    };
  }

  pruneExpiredLocalUploadTokens();
  observePublicBaseUrl(baseUrl);

  const token = crypto.randomUUID();
  pendingLocalUploads.set(token, {
    contentType,
    expiresAt: Date.now() + expiresIn * 1000,
    key: createKey(roomId, fileName),
  });

  return {
    uploadUrl: `${resolvePublicBaseUrl(baseUrl)}${LOCAL_UPLOAD_ROUTE_PREFIX}${encodeURIComponent(token)}`,
    publicUrl: getPublicAudioUrl(roomId, fileName, baseUrl),
  };
}

export async function handleLocalUpload(req: Request, token: string): Promise<Response> {
  if (getStorageMode() !== "local") {
    return errorResponse("Local upload route is unavailable while R2 storage is configured", 404);
  }

  if (req.method !== "PUT") {
    return errorResponse("Method not allowed", 405);
  }

  observePublicBaseUrl(new URL(req.url).origin);
  pruneExpiredLocalUploadTokens();

  const upload = pendingLocalUploads.get(token);
  if (!upload) {
    return errorResponse("Upload URL expired or invalid", 404);
  }

  try {
    const buffer = await req.arrayBuffer();
    await writeLocalBytesForKey(upload.key, buffer, upload.contentType);
    pendingLocalUploads.delete(token);

    return new Response(null, {
      headers: corsHeaders,
      status: 200,
    });
  } catch (error) {
    console.error(`Failed local upload for key ${upload.key}:`, error);
    return errorResponse("Failed to write uploaded file", 500);
  }
}

/**
 * Get the public URL for an audio file
 */
export function getPublicAudioUrl(roomId: string, fileName: string, baseUrl?: string): string {
  return getPublicUrlForKey(createKey(roomId, fileName), baseUrl);
}

export function getPublicUrlForKey(key: string, baseUrl?: string): string {
  if (getStorageMode() === "r2") {
    return `${S3_CONFIG.PUBLIC_URL}/${encodeKeyForUrl(key)}`;
  }

  return `${resolvePublicBaseUrl(baseUrl)}${LOCAL_AUDIO_ROUTE_PREFIX}${encodeKeyForUrl(key)}`;
}

/**
 * Extract the storage key from a public or local audio URL
 */
export function extractKeyFromUrl(url: string): string | null {
  const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
  const isAbsolutePath = url.startsWith("/");

  if (!isAbsoluteUrl && !isAbsolutePath) {
    return null;
  }

  try {
    const urlParts = isAbsoluteUrl ? new URL(url) : new URL(url, "http://localhost");
    return decodeKeyFromPath(urlParts.pathname);
  } catch (error) {
    console.error(`Failed to extract key from URL ${url}:`, error);
    return null;
  }
}

/**
 * Validate if an audio file exists in active storage
 */
export async function validateAudioFileExists(audioUrl: string): Promise<boolean> {
  const key = extractKeyFromUrl(audioUrl);

  if (!key) {
    console.error(`Could not extract key from URL: ${audioUrl}`);
    return false;
  }

  if (getStorageMode() === "local") {
    return await localFileExists(key);
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });

    await requireR2Client().send(command);
    return true;
  } catch {
    console.error(`Error validating audio file ${audioUrl}:`);
    return false;
  }
}

/**
 * Generate a unique file name for audio uploads
 */
export function generateAudioFileName(originalName: string): string {
  const extensionRaw = originalName.split(".").pop();
  const extension = extensionRaw && extensionRaw.length > 0 ? extensionRaw : "mp3";
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
  const nameWithoutSlashes = nameWithoutExt.replace(/[/\\]/g, "-");

  let safeName = sanitize(nameWithoutSlashes, { replacement: "*" });

  const maxNameLength = 400;
  if (safeName.length > maxNameLength) {
    safeName = safeName.substring(0, maxNameLength);
  }

  if (!safeName) {
    safeName = "audio";
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(":", "-");

  return `${safeName}${R2_AUDIO_FILE_NAME_DELIMITER}${dateStr}.${extension}`;
}

/**
 * Validate R2 configuration
 */
export function validateR2Config(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(S3_CONFIG)) {
    if (!value) {
      errors.push(`S3 CONFIG: ${key} is not defined`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * List all objects with a given prefix
 */
export async function listObjectsWithPrefix(prefix: string, options: { includeFolders?: boolean } = {}) {
  if (getStorageMode() === "local") {
    const objects = await listLocalObjectsWithPrefix(prefix);
    if (options.includeFolders) {
      return objects;
    }
    return objects.filter((obj) => obj.Key && (!obj.Key.endsWith("/") || (obj.Size ?? 0) > 0));
  }

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Prefix: prefix,
    });

    const listResponse = await requireR2Client().send(listCommand);

    if (options.includeFolders) {
      return listResponse.Contents?.filter((obj) => obj.Key);
    }

    return listResponse.Contents?.filter((obj) => obj.Key && !obj.Key.endsWith("/") && obj.Size && obj.Size > 0);
  } catch (error) {
    console.error(`Failed to list objects with prefix "${prefix}":`, error);
    throw error;
  }
}

async function deleteBatchObjects(objects: { Key: string }[]): Promise<{ deletedCount: number; errors: string[] }> {
  let deletedCount = 0;
  const errors: string[] = [];

  const batchSize = 1000;
  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Delete: {
        Objects: batch,
        Quiet: true,
      },
    });

    const deleteResponse = await requireR2Client().send(deleteCommand);

    const batchDeletedCount = batch.length - (deleteResponse.Errors?.length ?? 0);
    deletedCount += batchDeletedCount;

    if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
      deleteResponse.Errors.forEach((error) => {
        errors.push(`Failed to delete ${error.Key}: ${error.Message}`);
      });
    }
  }

  return { deletedCount, errors };
}

async function deleteIndividualObjects(
  objects: { Key: string }[]
): Promise<{ deletedCount: number; errors: string[] }> {
  let deletedCount = 0;
  const errors: string[] = [];

  for (const obj of objects) {
    try {
      await deleteObject(obj.Key);
      deletedCount++;
    } catch (error) {
      errors.push(`Failed to delete ${obj.Key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { deletedCount, errors };
}

/**
 * Delete all objects with a given prefix
 */
export async function deleteObjectsWithPrefix(prefix = ""): Promise<{ deletedCount: number }> {
  if (getStorageMode() === "local") {
    try {
      return await deleteLocalObjectsWithPrefix(prefix);
    } catch (error) {
      const errorMessage = `Failed to delete objects with prefix "${prefix}": ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  try {
    const objects = await listObjectsWithPrefix(prefix, {
      includeFolders: true,
    });

    if (!objects || objects.length === 0) {
      console.log(`No objects found with prefix "${prefix}"`);
      return { deletedCount: 0 };
    }

    const objectsToDelete = objects.map((obj) => ({
      Key: obj.Key!,
    }));

    try {
      const batchResult = await deleteBatchObjects(objectsToDelete);

      if (batchResult.errors.length === 0) {
        return { deletedCount: batchResult.deletedCount };
      }

      if (batchResult.deletedCount > 0) {
        console.warn(
          `Batch delete partially succeeded: ${batchResult.deletedCount} deleted, ${batchResult.errors.length} errors`
        );
        batchResult.errors.forEach((error) => console.warn(error));
        return { deletedCount: batchResult.deletedCount };
      }

      throw new Error(`Batch delete failed: ${batchResult.errors[0]}`);
    } catch (error) {
      if (
        (error instanceof Error && error.message.includes("NotImplemented")) ||
        (error && typeof error === "object" && "Code" in error && error.Code === "NotImplemented")
      ) {
        console.log(`Batch delete not supported, falling back to individual deletes...`);
        const individualResult = await deleteIndividualObjects(objectsToDelete);

        if (individualResult.errors.length > 0) {
          console.warn(`Individual delete had ${individualResult.errors.length} errors:`);
          individualResult.errors.forEach((deleteError) => console.warn(deleteError));
        }

        return { deletedCount: individualResult.deletedCount };
      }

      throw error;
    }
  } catch (error) {
    const errorMessage = `Failed to delete objects with prefix "${prefix}": ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Upload a file to active storage
 */
export async function uploadFile(filePath: string, roomId: string, fileName: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  return await uploadBytes(buffer, roomId, fileName, file.type || "audio/mpeg");
}

/**
 * Upload bytes directly to active storage without a temporary file
 */
export async function uploadBytes(
  bytes: Uint8Array | ArrayBuffer,
  roomId: string,
  fileName: string,
  contentType = "audio/mpeg"
): Promise<string> {
  const key = createKey(roomId, fileName);

  if (getStorageMode() === "local") {
    await writeLocalBytesForKey(key, bytes, contentType);
    return getPublicAudioUrl(roomId, fileName);
  }

  const body = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;

  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await requireR2Client().send(command);
  return getPublicAudioUrl(roomId, fileName);
}

/**
 * Upload JSON data to active storage
 */
export async function uploadJSON(key: string, data: object): Promise<void> {
  const jsonData = JSON.stringify(data, null, 2);

  if (getStorageMode() === "local") {
    const filePath = await ensureParentDirectoryForKey(key);
    await Bun.write(filePath, jsonData);
    return;
  }

  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: jsonData,
    ContentType: "application/json",
  });

  await requireR2Client().send(command);
}

/**
 * Download and parse JSON data from active storage
 */
export async function downloadJSON<T = unknown>(key: string): Promise<T | null> {
  if (getStorageMode() === "local") {
    try {
      const jsonData = await readFile(resolveLocalPathFromKey(key), "utf8");
      return JSON.parse(jsonData) as T;
    } catch (error) {
      console.error(`Failed to download JSON from ${key}:`, error);
      return null;
    }
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });

    const response = await requireR2Client().send(command);
    const jsonData = await response.Body?.transformToString();

    if (!jsonData) {
      return null;
    }

    return JSON.parse(jsonData) as T;
  } catch (error) {
    console.error(`Failed to download JSON from ${key}:`, error);
    return null;
  }
}

/**
 * Get the latest file with a given prefix
 */
export async function getLatestFileWithPrefix(prefix: string): Promise<string | null> {
  const objects = await listObjectsWithPrefix(prefix);

  if (!objects || objects.length === 0) {
    return null;
  }

  const sorted = objects.filter((obj) => obj.Key).sort((a, b) => (b.Key ?? "").localeCompare(a.Key ?? ""));
  return sorted[0]?.Key ?? null;
}

/**
 * Delete a single object from active storage
 */
export async function deleteObject(key: string): Promise<void> {
  if (getStorageMode() === "local") {
    await deleteLocalObject(key);
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
  });

  await requireR2Client().send(command);
}

/**
 * Get all files with a prefix, sorted by key name (newest first)
 */
export async function getSortedFilesWithPrefix(prefix: string, extension?: string): Promise<string[]> {
  const objects = await listObjectsWithPrefix(prefix);

  if (!objects || objects.length === 0) {
    return [];
  }

  return objects
    .filter((obj) => {
      if (!obj.Key) return false;
      if (extension && !obj.Key.endsWith(extension)) return false;
      return true;
    })
    .sort((a, b) => (b.Key ?? "").localeCompare(a.Key ?? ""))
    .map((obj) => obj.Key!);
}

/**
 * Clean up orphaned rooms that exist in active storage but not in server memory
 */
export async function cleanupOrphanedRooms(
  activeRoomIds: Set<string>,
  performDeletion = false
): Promise<OrphanCleanupResult> {
  const result: OrphanCleanupResult = {
    orphanedRooms: [],
    totalRooms: 0,
    totalFiles: 0,
    deletedFiles: 0,
    errors: [],
  };

  try {
    const roomObjects = await listObjectsWithPrefix("room-");

    if (!roomObjects || roomObjects.length === 0) {
      console.log(`  ✅ No room objects found in ${getStorageMode()} storage. Nothing to clean up!`);
      return result;
    }

    console.log(`  Found ${roomObjects.length} room objects in ${getStorageMode()} storage`);

    const roomsInStorage = new Map<string, string[]>();

    roomObjects.forEach((obj) => {
      if (!obj.Key) return;
      const match = /^room-([^/]+)\//.exec(obj.Key);
      if (!match) return;

      const roomId = match[1];
      if (!roomsInStorage.has(roomId)) {
        roomsInStorage.set(roomId, []);
      }
      roomsInStorage.get(roomId)!.push(obj.Key);
    });

    console.log(`  📁 Found ${roomsInStorage.size} unique rooms in storage`);
    console.log(`  🏃 Found ${activeRoomIds.size} active rooms in server memory`);

    const orphanedRooms: string[] = [];

    roomsInStorage.forEach((files, roomId) => {
      if (!activeRoomIds.has(roomId)) {
        orphanedRooms.push(roomId);
        result.orphanedRooms.push({
          roomId,
          fileCount: files.length,
        });
      }
    });

    result.totalRooms = orphanedRooms.length;

    if (orphanedRooms.length === 0) {
      return result;
    }

    console.log(`  🗑️  Found ${orphanedRooms.length} orphaned rooms to clean up`);

    orphanedRooms.forEach((roomId) => {
      result.totalFiles += roomsInStorage.get(roomId)?.length ?? 0;
    });

    console.log(`  📊 Total files to delete: ${result.totalFiles}`);

    if (performDeletion) {
      console.log("  🚀 Starting deletion process...");

      let totalDeleted = 0;

      for (const roomId of orphanedRooms) {
        try {
          const deleteResult = await deleteObjectsWithPrefix(`room-${roomId}/`);
          console.log(`    ✅ Deleted room-${roomId}: ${deleteResult.deletedCount} files`);
          totalDeleted += deleteResult.deletedCount;
        } catch (error) {
          const errorMsg = `Failed to delete room-${roomId}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`    ❌ ${errorMsg}`);
          result.errors!.push(errorMsg);
        }
      }

      result.deletedFiles = totalDeleted;
      console.log(`  ✨ Cleanup complete! Files deleted: ${totalDeleted}`);
    } else {
      console.log("  ⚠️  DRY RUN MODE - No files were deleted");
    }

    return result;
  } catch (error) {
    console.error("❌ Orphaned room cleanup failed:", error);
    throw error;
  }
}

export async function serveLocalAudio(pathname: string): Promise<Response> {
  if (!isLocalAudioPath(pathname)) {
    return errorResponse("File not found", 404);
  }

  const key = decodeKeyFromPath(pathname);
  if (!key) {
    return errorResponse("File not found", 404);
  }

  try {
    const filePath = resolveLocalPathFromKey(key);
    const fileStats = await stat(filePath);
    const file = Bun.file(filePath);

    return new Response(file, {
      headers: {
        ...corsHeaders,
        "Cache-Control": "public, max-age=3600, immutable",
        "Content-Length": fileStats.size.toString(),
        "Content-Type": getContentTypeForLocalFile(filePath),
      },
    });
  } catch {
    return errorResponse("File not found", 404);
  }
}
