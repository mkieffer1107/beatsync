import { describe, expect, it } from "bun:test";
import { getQueuePlaybackOrder, resolvePlaybackOrder, type PlaybackOrderStateLike } from "@/lib/playbackOrder";

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
});
