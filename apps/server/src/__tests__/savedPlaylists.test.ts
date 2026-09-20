import { RoomManager } from "@/managers/RoomManager";
import {
  getSavedDefaultPlaylistId,
  isPermanentYoutubeUnavailableError,
  listSavedPlaylists,
  renameSavedPlaylist,
  savedPlaylistAudioExists,
  setSavedDefaultPlaylistId,
  syncSavedYoutubePlaylist,
} from "@/lib/savedPlaylists";
import * as youtube from "@/lib/youtube";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const originalRoot = process.env.BEATSYNC_PLAYLISTS_DIR;
const temporaryRoots: string[] = [];

async function createSavedPlaylist(name = "Vibes") {
  const root = await mkdtemp(path.join(tmpdir(), "beatsync-saved-playlists-"));
  temporaryRoots.push(root);
  process.env.BEATSYNC_PLAYLISTS_DIR = root;
  const directory = path.join(root, name);
  await mkdir(directory);
  await Bun.write(path.join(directory, "First Track [abc123].mp3"), "mp3");
  await Bun.write(
    path.join(directory, ".beatsync-playlist.json"),
    JSON.stringify({
      version: 1,
      id: "saved-1",
      name,
      sourceKind: "youtube",
      externalId: "PL123",
      originalUrl: "https://www.youtube.com/playlist?list=PL123",
      createdAt: 10,
      updatedAt: 20,
      tracks: [
        {
          youtubeId: "abc123",
          title: "First Track",
          fileName: "First Track [abc123].mp3",
          sourceUrl: "https://www.youtube.com/watch?v=abc123",
        },
      ],
    })
  );
  return { root, directory };
}

afterEach(async () => {
  if (originalRoot === undefined) delete process.env.BEATSYNC_PLAYLISTS_DIR;
  else process.env.BEATSYNC_PLAYLISTS_DIR = originalRoot;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("saved playlists", () => {
  it("rolls back shared links after a failed import without deleting the original audio", async () => {
    const { root, directory } = await createSavedPlaylist();
    const plan = spyOn(youtube, "getYoutubeImportPlan").mockResolvedValue({
      kind: "playlist",
      playlistId: "PL-failed",
      title: "Failed playlist",
      tracks: [
        { id: "abc123", title: "Shared track", sourceUrl: "https://www.youtube.com/watch?v=abc123" },
        { id: "missing", title: "Unavailable", sourceUrl: "https://www.youtube.com/watch?v=missing" },
      ],
    });
    const download = spyOn(youtube, "downloadYoutubeTrack").mockImplementation(() =>
      Promise.reject(new Error("ETIMEDOUT"))
    );
    try {
      const failure: unknown = await syncSavedYoutubePlaylist({
        originalUrl: "https://www.youtube.com/playlist?list=PL-failed",
      }).then(
        () => null,
        (error: unknown) => error
      );
      expect(failure).toMatchObject({ message: "ETIMEDOUT" });
      expect(await Bun.file(path.join(directory, "First Track [abc123].mp3")).text()).toBe("mp3");
      expect(existsSync(path.join(root, "Failed playlist"))).toBe(false);
    } finally {
      plan.mockRestore();
      download.mockRestore();
    }
  });

  it("reuses a track from another playlist without downloading and keeps it when that playlist is removed", async () => {
    const { root, directory } = await createSavedPlaylist();
    const plan = spyOn(youtube, "getYoutubeImportPlan").mockResolvedValue({
      kind: "playlist",
      playlistId: "PL456",
      title: "Second playlist",
      tracks: [{ id: "abc123", title: "Renamed track", sourceUrl: "https://www.youtube.com/watch?v=abc123" }],
    });
    const download = spyOn(youtube, "downloadYoutubeTrack").mockImplementation(() =>
      Promise.reject(new Error("Should not download"))
    );
    try {
      const result = await syncSavedYoutubePlaylist({ originalUrl: "https://www.youtube.com/playlist?list=PL456" });
      expect(result.addedCount).toBe(1);
      expect(download).not.toHaveBeenCalled();
      const newFile = path.join(root, "Second playlist", "Renamed track [abc123].mp3");
      expect((await stat(newFile)).ino).toBe((await stat(path.join(directory, "First Track [abc123].mp3"))).ino);
      await rm(directory, { recursive: true });
      expect(await Bun.file(newFile).text()).toBe("mp3");
    } finally {
      plan.mockRestore();
      download.mockRestore();
    }
  });

  it("distinguishes unavailable videos from transient download failures", () => {
    expect(
      isPermanentYoutubeUnavailableError(
        new Error("Video unavailable. The account associated with this video has been terminated.")
      )
    ).toBe(true);
    expect(isPermanentYoutubeUnavailableError(new Error("ETIMEDOUT while contacting YouTube"))).toBe(false);
  });

  it("loads persistent tracks without coupling queue removal to source deletion", async () => {
    const { directory } = await createSavedPlaylist();
    const [playlist] = await listSavedPlaylists();
    expect(playlist).toMatchObject({ id: "saved-1", isSaved: true, name: "Vibes" });
    expect(await savedPlaylistAudioExists(playlist.tracks[0].url)).toBe(true);

    const room = new RoomManager("saved-room");
    room.createPlaylist(playlist);
    room.queuePlaylist(playlist.id);
    room.removeAudioSources([playlist.tracks[0].url]);

    expect(room.getAudioSources()).toEqual([]);
    expect(existsSync(path.join(directory, "First Track [abc123].mp3"))).toBe(true);
  });

  it("renames both the playlist and its persistent directory", async () => {
    const { root } = await createSavedPlaylist();
    const renamed = await renameSavedPlaylist("saved-1", "Friday Vibes");

    expect(renamed.name).toBe("Friday Vibes");
    expect(renamed.tracks[0]?.url).toContain("/Friday%20Vibes/");
    expect(existsSync(path.join(root, "Friday Vibes", "First Track [abc123].mp3"))).toBe(true);
    expect(existsSync(path.join(root, "Vibes"))).toBe(false);
  });

  it("persists the selected default playlist outside the room state", async () => {
    await createSavedPlaylist();

    expect(await getSavedDefaultPlaylistId()).toBeNull();
    await setSavedDefaultPlaylistId("saved-1");
    expect(await getSavedDefaultPlaylistId()).toBe("saved-1");
  });
});
