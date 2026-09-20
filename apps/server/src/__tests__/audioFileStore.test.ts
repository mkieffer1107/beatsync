import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { storeUniqueAudio } from "@/lib/audioFileStore";

let root: string;
let library: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "beatsync-audio-dedup-"));
  library = path.join(root, "library");
  await mkdir(library);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("audio storage deduplication", () => {
  it("shares identical bytes despite different names and survives deleting either path", async () => {
    const existing = path.join(library, "old-name.mp3");
    const download = path.join(root, "download.mp3");
    const destination = path.join(library, "new-name.mp3");
    await writeFile(existing, "same audio");
    await writeFile(download, "same audio");
    await storeUniqueAudio(download, destination, [library]);
    expect((await stat(destination)).ino).toBe((await stat(existing)).ino);
    await rm(existing);
    await rm(download);
    expect(await readFile(destination, "utf8")).toBe("same audio");
  });

  it("does not conflate different audio of the same size", async () => {
    const existing = path.join(library, "existing.mp3");
    const download = path.join(root, "download.mp3");
    const destination = path.join(library, "new.mp3");
    await writeFile(existing, "AAAA");
    await writeFile(download, "BBBB");
    await storeUniqueAudio(download, destination, [library]);
    expect((await stat(destination)).ino).not.toBe((await stat(existing)).ino);
    expect(await readFile(destination, "utf8")).toBe("BBBB");
  });

  it("deduplicates concurrent imports and tolerates absent optional libraries", async () => {
    const first = path.join(root, "download1.mp3");
    const second = path.join(root, "download2.mp3");
    await writeFile(first, "same audio");
    await writeFile(second, "same audio");
    const a = path.join(library, "a.mp3");
    const b = path.join(library, "b.mp3");
    await Promise.all([
      storeUniqueAudio(first, a, [library, path.join(root, "missing")]),
      storeUniqueAudio(second, b, [library]),
    ]);
    expect((await stat(a)).ino).toBe((await stat(b)).ino);
  });

  it("ignores incomplete hidden downloads", async () => {
    const partial = path.join(library, ".unfinished.part.mp3");
    const source = path.join(root, "download.mp3");
    const destination = path.join(library, "saved.mp3");
    await writeFile(partial, "audio");
    await writeFile(source, "audio");
    await storeUniqueAudio(source, destination, [library]);
    expect((await stat(destination)).ino).not.toBe((await stat(partial)).ino);
  });
});
