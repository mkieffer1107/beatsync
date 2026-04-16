import { beforeEach, describe, expect, it } from "bun:test";
import { globalManager } from "@/managers/GlobalManager";

describe("Playlist State", () => {
  beforeEach(() => {
    const roomIds = globalManager.getRoomIds();
    for (const roomId of roomIds) {
      globalManager.deleteRoom(roomId);
    }
  });

  it("persists playlist-owned tracks in room backups even when the live queue is smaller on restore", () => {
    const room = globalManager.getOrCreateRoom("playlist-backup-room");
    room.addAudioSource({ url: "https://example.com/one.mp3", title: "One" });
    room.addAudioSource({ url: "https://example.com/two.mp3", title: "Two" });

    room.createPlaylist({
      name: "Imported Set",
      sourceKind: "youtube",
      originalUrl: "https://www.youtube.com/playlist?list=test",
      externalId: "test",
      trackUrls: ["https://example.com/one.mp3", "https://example.com/two.mp3"],
    });

    const backup = room.createBackup();

    expect(backup.playlists).toHaveLength(1);
    expect(backup.playlists[0]?.name).toBe("Imported Set");
    expect(backup.playlists[0]?.trackUrls).toEqual(["https://example.com/one.mp3", "https://example.com/two.mp3"]);

    globalManager.deleteRoom("playlist-backup-room");

    const restoredRoom = globalManager.getOrCreateRoom("playlist-backup-room");
    restoredRoom.setAudioSources([backup.audioSources[0]]);
    restoredRoom.restorePlaylists(backup.playlists);

    expect(restoredRoom.getPlaylists()).toHaveLength(1);
    expect(restoredRoom.getPlaylists()[0]?.trackUrls).toEqual([
      "https://example.com/one.mp3",
      "https://example.com/two.mp3",
    ]);
    expect(restoredRoom.getPlaylists()[0]?.tracks.map((track) => track.url)).toEqual([
      "https://example.com/one.mp3",
      "https://example.com/two.mp3",
    ]);
  });

  it("keeps playlist tracks when queue entries are removed and can queue them again later", () => {
    const room = globalManager.getOrCreateRoom("playlist-delete-room");
    room.addAudioSource({ url: "https://example.com/alpha.mp3" });
    room.addAudioSource({ url: "https://example.com/beta.mp3" });

    const playlist = room.createPlaylist({
      name: "Set A",
      trackUrls: ["https://example.com/alpha.mp3", "https://example.com/beta.mp3"],
    });

    const result = room.removeAudioSources(["https://example.com/alpha.mp3"]);

    expect(result.playlistsChanged).toBe(false);
    expect(result.playlists).toHaveLength(1);
    expect(result.playlists[0]?.id).toBe(playlist.id);
    expect(result.playlists[0]?.trackUrls).toEqual(["https://example.com/alpha.mp3", "https://example.com/beta.mp3"]);
    expect(result.updated.map((source) => source.url)).toEqual(["https://example.com/beta.mp3"]);

    const queued = room.queuePlaylist(playlist.id);

    expect(queued).not.toBeNull();
    expect(queued?.addedCount).toBe(1);
    expect(room.getAudioSources().map((source) => source.url)).toEqual([
      "https://example.com/beta.mp3",
      "https://example.com/alpha.mp3",
    ]);
  });
});
