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

  it("clears the live queue without deleting playlist-backed tracks", () => {
    const room = globalManager.getOrCreateRoom("playlist-clear-room");
    room.addAudioSource({ url: "https://example.com/alpha.mp3" });
    room.addAudioSource({ url: "https://example.com/beta.mp3" });

    const playlist = room.createPlaylist({
      name: "Set A",
      trackUrls: ["https://example.com/alpha.mp3", "https://example.com/beta.mp3"],
    });

    room.updatePlaybackSchedulePlay(
      { type: "PLAY", audioSource: "https://example.com/alpha.mp3", trackTimeSeconds: 3 },
      Date.now()
    );

    const cleared = room.clearAudioQueue();

    expect(cleared).toEqual([]);
    expect(room.getAudioSources()).toEqual([]);
    expect(room.getPlaybackState().type).toBe("paused");
    expect(room.getPlaylists()[0]?.id).toBe(playlist.id);
    expect(room.getPlaylists()[0]?.trackUrls).toEqual([
      "https://example.com/alpha.mp3",
      "https://example.com/beta.mp3",
    ]);

    const queued = room.queuePlaylist(playlist.id);
    expect(queued?.addedCount).toBe(2);
  });

  it("finds existing tracks by external id across queue and playlist storage", () => {
    const room = globalManager.getOrCreateRoom("playlist-external-id-room");
    room.addAudioSource({
      url: "https://example.com/provider-track.mp3",
      sourceKind: "provider",
      externalId: "provider:42",
      metadata: {
        providerTrackId: "42",
      },
    });

    room.createPlaylist({
      name: "Imported Set",
      sourceKind: "youtube",
      trackUrls: ["https://example.com/youtube-track.mp3"],
      tracks: [
        {
          url: "https://example.com/youtube-track.mp3",
          sourceKind: "youtube",
          externalId: "youtube:abc123",
          originalUrl: "https://www.youtube.com/watch?v=abc123",
          metadata: {
            sourceUrl: "https://www.youtube.com/watch?v=abc123",
            youtubeVideoId: "abc123",
          },
        },
      ],
    });

    expect(room.findTrackByExternalId("provider:42")?.url).toBe("https://example.com/provider-track.mp3");
    expect(room.findTrackByExternalId("youtube:abc123")?.url).toBe("https://example.com/youtube-track.mp3");
  });

  it("appends playlist-only tracks without forcing them into the live queue", () => {
    const room = globalManager.getOrCreateRoom("playlist-append-room");
    const playlist = room.createPlaylist({
      name: "Imported Set",
      sourceKind: "youtube",
      trackUrls: ["https://example.com/one.mp3"],
      tracks: [
        {
          url: "https://example.com/one.mp3",
          sourceKind: "youtube",
          externalId: "youtube:one",
          originalUrl: "https://www.youtube.com/watch?v=one",
          metadata: {
            sourceUrl: "https://www.youtube.com/watch?v=one",
            youtubeVideoId: "one",
          },
        },
      ],
    });

    room.appendTracksToPlaylist(playlist.id, [
      {
        url: "https://example.com/two.mp3",
        sourceKind: "youtube",
        externalId: "youtube:two",
        originalUrl: "https://www.youtube.com/watch?v=two",
        metadata: {
          sourceUrl: "https://www.youtube.com/watch?v=two",
          youtubeVideoId: "two",
        },
      },
    ]);

    expect(room.getAudioSources()).toHaveLength(0);
    expect(room.getPlaylists()[0]?.trackUrls).toEqual(["https://example.com/one.mp3", "https://example.com/two.mp3"]);
    expect(room.getPlaylists()[0]?.tracks.map((track) => track.externalId)).toEqual(["youtube:one", "youtube:two"]);
  });

  it("can queue playlist-only tracks by url so library playback can start from saved tracks", () => {
    const room = globalManager.getOrCreateRoom("playlist-queue-tracks-room");
    room.createPlaylist({
      name: "Saved Set",
      trackUrls: ["https://example.com/one.mp3", "https://example.com/two.mp3"],
      tracks: [
        {
          url: "https://example.com/one.mp3",
          title: "One",
          sourceKind: "youtube",
          externalId: "youtube:one",
          originalUrl: "https://www.youtube.com/watch?v=one",
          metadata: {
            sourceUrl: "https://www.youtube.com/watch?v=one",
            youtubeVideoId: "one",
          },
        },
        {
          url: "https://example.com/two.mp3",
          title: "Two",
          sourceKind: "youtube",
          externalId: "youtube:two",
          originalUrl: "https://www.youtube.com/watch?v=two",
          metadata: {
            sourceUrl: "https://www.youtube.com/watch?v=two",
            youtubeVideoId: "two",
          },
        },
      ],
    });

    const queued = room.queueTracks(["https://example.com/two.mp3", "https://example.com/one.mp3"]);

    expect(queued.addedCount).toBe(2);
    expect(room.getAudioSources().map((source) => source.url)).toEqual([
      "https://example.com/two.mp3",
      "https://example.com/one.mp3",
    ]);
  });
});
