import { describe, expect, it } from "bun:test";
import {
  buildYoutubeImportPlanFromMetadata,
  extractYoutubeContinuationTokens,
  extractYoutubeTracksFromWebData,
  getYoutubeMetadataArgs,
  formatYoutubeDownloadError,
  resolveYoutubeImportRequest,
} from "@/lib/youtube";

describe("youtube download diagnostics", () => {
  const ytDlpBinary = { command: "yt-dlp", version: null };

  it("does not diagnose authentication from a generic 403 followed by unavailable formats", () => {
    const error = formatYoutubeDownloadError({
      ytDlpBinary,
      errors: [new Error("HTTP Error 403: Forbidden"), new Error("Requested format is not available")],
    });
    expect(error.message).toContain("supported JavaScript runtime");
    expect(error.message).not.toContain("YTDLP_COOKIES");
  });

  it("does not diagnose authentication from a reload request or generic cookie advice", () => {
    const error = formatYoutubeDownloadError({
      ytDlpBinary,
      errors: [new Error("The page needs to be reloaded; try --cookies-from-browser")],
    });
    expect(error.message).not.toContain("YouTube explicitly requested sign-in");
  });

  it("explains server-side cookies when YouTube explicitly requests sign-in", () => {
    const error = formatYoutubeDownloadError({
      ytDlpBinary,
      errors: [new Error("Sign in to confirm you're not a bot")],
    });
    expect(error.message).toContain("YTDLP_COOKIES_FILE");
    expect(error.message).toContain(".env.production");
    expect(error.message).toContain("browser profile must exist on the server");
  });

  it("flags builds older than 90 days without a permanently fixed version cutoff", () => {
    const error = formatYoutubeDownloadError({
      ytDlpBinary: { command: "yt-dlp", version: "2020.01.01" },
      errors: [new Error("Download failed")],
    });
    expect(error.message).toContain("over 90 days old");
  });
});

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

  it("sanitizes generated radio URLs to a single-video import", () => {
    const request = resolveYoutubeImportRequest(
      "https://www.youtube.com/watch?v=CVxMTl6cUSE&list=RDCVxMTl6cUSE&start_radio=1",
      "playlist"
    );

    expect(request).toEqual({
      url: "https://www.youtube.com/watch?v=CVxMTl6cUSE",
      mode: "video",
    });
  });

  it("keeps real playlist URLs in playlist mode", () => {
    const request = resolveYoutubeImportRequest("https://www.youtube.com/playlist?list=PL123456789", "playlist");

    expect(request).toEqual({
      url: "https://www.youtube.com/playlist?list=PL123456789",
      mode: "playlist",
    });
  });

  it("does not downgrade non-radio watch URLs that include a playlist id", () => {
    const request = resolveYoutubeImportRequest(
      "https://www.youtube.com/watch?v=video-123&list=PL123456789",
      "playlist"
    );

    expect(request).toEqual({
      url: "https://www.youtube.com/watch?v=video-123&list=PL123456789",
      mode: "playlist",
    });
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

  it("extracts modern YouTube lockup playlist entries", () => {
    const tracks = extractYoutubeTracksFromWebData({
      contents: [
        {
          lockupViewModel: {
            contentId: "video-123",
            contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
            contentImage: {
              thumbnailViewModel: {
                image: {
                  sources: [
                    {
                      url: "https://i.ytimg.com/vi/video-123/default.jpg",
                      width: 120,
                      height: 90,
                    },
                    {
                      url: "https://i.ytimg.com/vi/video-123/hqdefault.jpg",
                      width: 480,
                      height: 360,
                    },
                  ],
                },
                overlays: [
                  {
                    thumbnailBottomOverlayViewModel: {
                      badges: [
                        {
                          thumbnailBadgeViewModel: {
                            text: "1:02:03",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            metadata: {
              lockupMetadataViewModel: {
                title: {
                  content: "Modern Playlist Entry",
                },
              },
            },
          },
        },
        {
          lockupViewModel: {
            contentId: "playlist-123",
            contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST",
            metadata: {
              lockupMetadataViewModel: {
                title: {
                  content: "Related Playlist",
                },
              },
            },
          },
        },
      ],
    });

    expect(tracks).toEqual([
      {
        id: "video-123",
        title: "Modern Playlist Entry",
        sourceUrl: "https://www.youtube.com/watch?v=video-123",
        thumbnailUrl: "https://i.ytimg.com/vi/video-123/hqdefault.jpg",
        durationSeconds: 3723,
      },
    ]);
  });

  it("extracts YouTube continuation tokens from nested web data", () => {
    const tokens = extractYoutubeContinuationTokens({
      contents: [
        {
          continuationItemViewModel: {
            button: {
              command: {
                continuationCommand: {
                  token: "token-1",
                },
              },
            },
          },
        },
        {
          continuationCommand: {
            token: "token-2",
          },
        },
      ],
    });

    expect(tokens).toEqual(["token-1", "token-2"]);
  });
});
