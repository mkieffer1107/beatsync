import { describe, expect, it } from "bun:test";
import {
  canDriveAutoplay,
  getAutoplayDriverClientId,
  getQueuePlaybackOrder,
  resolvePlaybackOrder,
  type PlaybackOrderStateLike,
} from "@/lib/playbackOrder";

const createState = (overrides?: Partial<PlaybackOrderStateLike>): PlaybackOrderStateLike => ({
  audioSources: [
    { source: { url: "track-1" } },
    { source: { url: "track-2" } },
    { source: { url: "track-3" } },
    { source: { url: "track-4" } },
    { source: { url: "track-5" } },
  ],
  playbackContext: null,
  selectedAudioUrl: "track-1",
  ...overrides,
});

describe("playbackOrder", () => {
  it("uses queue order when there is no playback context", () => {
    const state = createState();

    expect(getQueuePlaybackOrder(state.audioSources)).toEqual(["track-1", "track-2", "track-3", "track-4", "track-5"]);
    expect(resolvePlaybackOrder(state)).toEqual(["track-1", "track-2", "track-3", "track-4", "track-5"]);
  });

  it("uses the scoped context order for manual skips", () => {
    const state = createState({
      playbackContext: {
        scope: "playlist",
        playlistId: "playlist-1",
        urls: ["track-1", "track-5", "track-2", "track-3", "track-4"],
      },
    });

    expect(resolvePlaybackOrder(state)).toEqual(["track-1", "track-5", "track-2", "track-3", "track-4"]);
  });

  it("uses live queue order for autoplay even when a local playlist context exists", () => {
    const state = createState({
      playbackContext: {
        scope: "playlist",
        playlistId: "playlist-1",
        urls: ["track-1", "track-5", "track-2", "track-3", "track-4"],
      },
    });

    expect(resolvePlaybackOrder(state, { autoplay: true })).toEqual([
      "track-1",
      "track-2",
      "track-3",
      "track-4",
      "track-5",
    ]);
  });

  it("selects one stable autoplay driver from room admins", () => {
    const state = {
      connectedClients: [
        { clientId: "viewer", isAdmin: false, joinedAt: 1 },
        { clientId: "admin-later", isAdmin: true, joinedAt: 3 },
        { clientId: "admin-first", isAdmin: true, joinedAt: 2 },
      ],
      currentUser: { clientId: "admin-first", isAdmin: true, joinedAt: 2 },
      playbackControlsPermissions: "EVERYONE" as const,
    };

    expect(getAutoplayDriverClientId(state)).toBe("admin-first");
    expect(canDriveAutoplay(state)).toBe(true);
  });

  it("falls back to the first connected client only when everyone can control playback", () => {
    const state = {
      connectedClients: [
        { clientId: "client-2", isAdmin: false, joinedAt: 2 },
        { clientId: "client-1", isAdmin: false, joinedAt: 1 },
      ],
      currentUser: { clientId: "client-2", isAdmin: false, joinedAt: 2 },
      playbackControlsPermissions: "EVERYONE" as const,
    };

    expect(getAutoplayDriverClientId(state)).toBe("client-1");
    expect(canDriveAutoplay(state)).toBe(false);
  });
});
