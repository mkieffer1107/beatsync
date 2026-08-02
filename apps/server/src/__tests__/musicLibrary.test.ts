import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { listConfiguredMusicLibrary, musicLibraryAudioExists, serveMusicLibraryAudio } from "@/lib/musicLibrary";

const originalMusicDirectory = process.env.BEATSYNC_MUSIC_DIR;
const temporaryDirectories: string[] = [];

async function createLibrary(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "beatsync-music-library-"));
  temporaryDirectories.push(directory);
  process.env.BEATSYNC_MUSIC_DIR = directory;
  return directory;
}

afterEach(async () => {
  if (originalMusicDirectory === undefined) {
    delete process.env.BEATSYNC_MUSIC_DIR;
  } else {
    process.env.BEATSYNC_MUSIC_DIR = originalMusicDirectory;
  }

  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("configured music library", () => {
  it("lists supported audio recursively while ignoring unrelated files", async () => {
    const directory = await createLibrary();
    await mkdir(path.join(directory, "Favorites"));
    await Bun.write(path.join(directory, "Favorites", "A Song___2026-08-02T12-00-00.mp3"), "audio");
    await Bun.write(path.join(directory, "Z Song.flac"), "audio");
    await Bun.write(path.join(directory, "cover.jpg"), "image");

    expect(await listConfiguredMusicLibrary()).toEqual([
      {
        sourceKind: "upload",
        title: "A Song",
        url: "/audio/library/Favorites/A%20Song___2026-08-02T12-00-00.mp3",
      },
      {
        sourceKind: "upload",
        title: "Z Song",
        url: "/audio/library/Z%20Song.flac",
      },
    ]);
  });

  it("serves library audio and validates persisted relative URLs", async () => {
    const directory = await createLibrary();
    await Bun.write(path.join(directory, "song.mp3"), "audio-bytes");

    const url = "/audio/library/song.mp3";
    expect(await musicLibraryAudioExists(url)).toBe(true);

    const response = await serveMusicLibraryAudio(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("audio-bytes");
  });

  it("rejects traversal and unsupported files", async () => {
    const directory = await createLibrary();
    await Bun.write(path.join(directory, "notes.txt"), "not audio");

    // Assert through the validator because several legacy suites globally mock
    // the shared error-response helper when all tests run in one Bun process.
    expect(await musicLibraryAudioExists("/audio/library/%2E%2E/notes.txt")).toBe(false);
    expect(await musicLibraryAudioExists("/audio/library/notes.txt")).toBe(false);
  });
});
