import { createReadStream } from "node:fs";
import { copyFile, link, readdir, rename, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import pLimit from "p-limit";

// Imports may overlap between playlists. Serialize file commits so each import
// can see the files committed by another import before allocating another copy.
const commitFile = pLimit(1);

async function findAudioFiles(roots: string[]): Promise<string[]> {
  const files = new Set<string>();
  const visited = new Set<string>();
  async function visit(directory: string): Promise<void> {
    directory = path.resolve(directory);
    if (visited.has(directory)) return;
    visited.add(directory);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp3")) files.add(file);
    }
  }
  for (const root of roots) await visit(root);
  return [...files];
}

async function checksum(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Uint8Array);
  return hash.digest("hex");
}

/** Store an immutable MP3, sharing disk data only when its bytes match exactly.
 * All URL paths remain valid. Removing one playlist cannot remove another's data.
 * Cross-filesystem libraries fall back to copying (hard links cannot cross devices).
 */
export async function storeUniqueAudio(source: string, destination: string, roots: string[]): Promise<void> {
  await commitFile(async () => {
    const sourceStat = await stat(source);
    let sourceHash: string | undefined;
    let existing = source;
    const destinationDevice = (await stat(path.dirname(destination))).dev;
    for (const candidate of await findAudioFiles(roots)) {
      if (candidate === path.resolve(destination)) continue;
      const candidateStat = await stat(candidate).catch(() => null);
      if (candidateStat?.dev !== destinationDevice || candidateStat.size !== sourceStat.size) continue;
      if (candidateStat.dev === sourceStat.dev && candidateStat.ino === sourceStat.ino) {
        existing = candidate;
        break;
      }
      sourceHash ??= await checksum(source);
      if ((await checksum(candidate)) === sourceHash) {
        existing = candidate;
        break;
      }
    }

    const temporary = path.join(path.dirname(destination), `.${randomUUID()}.part.mp3`);
    try {
      // A downloaded temporary file may be removed immediately after this call;
      // the committed hard link retains the underlying data independently.
      try {
        await link(existing, temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await copyFile(existing, temporary);
      }
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  });
}
