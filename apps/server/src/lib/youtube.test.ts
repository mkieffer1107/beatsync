import { describe, expect, it } from "bun:test";
import { buildYoutubeImportPlanFromMetadata, getYoutubeMetadataArgs } from "@/lib/youtube";

describe("youtube import planning", () => {
  it("uses no-playlist metadata args for single-video imports", () => {
    const args = getYoutubeMetadataArgs("video");

    expect(args).toContain("--no-playlist");
    expect(args).not.toContain("--flat-playlist");
  });

  it("uses flat-playlist metadata args for playlist imports", () => {
    const args = getYoutubeMetadataArgs("playlist");

    expect(args).toContain("--flat-playlist");
    expect(args).not.toContain("--no-playlist");
  });

  it("does not expand playlist-like metadata when video mode is requested", () => {
    const plan = buildYoutubeImportPlanFromMetadata(
      {
        id: "video-123",
        title: "Single Video",
        webpage_url: "https://www.youtube.com/watch?v=video-123",
        entries: [
          {
            id: "playlist-entry-1",
            title: "Unexpected Playlist Entry",
            webpage_url: "https://www.youtube.com/watch?v=playlist-entry-1",
          },
        ],
      },
      "video"
    );

    expect(plan.kind).toBe("single");
    expect(plan.tracks).toHaveLength(1);
    expect(plan.tracks[0]?.id).toBe("video-123");
  });

  it("returns every entry when playlist mode is requested", () => {
    const plan = buildYoutubeImportPlanFromMetadata(
      {
        id: "playlist-123",
        title: "Imported Playlist",
        playlist_id: "playlist-123",
        entries: [
          {
            id: "track-1",
            title: "Track 1",
            webpage_url: "https://www.youtube.com/watch?v=track-1",
          },
          {
            id: "track-2",
            title: "Track 2",
            webpage_url: "https://www.youtube.com/watch?v=track-2",
          },
        ],
      },
      "playlist"
    );

    expect(plan.kind).toBe("playlist");
    expect(plan.playlistId).toBe("playlist-123");
    expect(plan.tracks.map((track) => track.id)).toEqual(["track-1", "track-2"]);
  });
});
