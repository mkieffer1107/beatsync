import { randomUUID } from "node:crypto";
import { IS_DEMO_MODE } from "@/demo";
import { getYoutubeImportPlan } from "@/lib/youtube";
import { buildYoutubeTrackExternalId, resolveYoutubeTrackForRoom } from "@/lib/youtubeRoomImport";
import { observePublicBaseUrl } from "@/lib/r2";
import { globalManager } from "@/managers";
import { sendBroadcast, sendUnicast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { AudioSourceType, ExtractWSRequestFrom } from "@beatsync/shared";

export const handleImportYoutube: HandlerFunction<ExtractWSRequestFrom["IMPORT_YOUTUBE"]> = async ({
  ws,
  message,
  server,
}) => {
  if (IS_DEMO_MODE) {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: "YouTube import is disabled in demo mode",
      },
    });
    return;
  }

  const { room } = requireCanMutate(ws);
  const roomId = ws.data.roomId;
  observePublicBaseUrl(ws.data.serverOrigin);
  room.cancelCleanup();

  try {
    const plan = await getYoutubeImportPlan(message.url, message.mode ?? "video");

    if (plan.kind === "playlist" && plan.playlistId) {
      const existingPlaylist = room.findPlaylistBySource({
        sourceKind: "youtube",
        externalId: plan.playlistId,
        originalUrl: message.url,
      });

      if (existingPlaylist) {
        const queuedPlaylist = room.queuePlaylist(existingPlaylist.id);

        if (queuedPlaylist?.addedCount) {
          sendBroadcast({
            server,
            roomId,
            message: {
              type: "ROOM_EVENT",
              event: {
                type: "SET_AUDIO_SOURCES",
                sources: queuedPlaylist.sources,
              },
            },
          });
        }

        sendUnicast({
          ws,
          message: {
            type: "IMPORT_STATUS",
            status: "completed",
            message:
              queuedPlaylist && queuedPlaylist.addedCount > 0
                ? `Queued "${existingPlaylist.name}" from your library`
                : `"${existingPlaylist.name}" is already in your library`,
            importedCount: existingPlaylist.trackUrls.length,
            failedCount: 0,
            collectionName: existingPlaylist.name,
          },
        });
        return;
      }
    }

    const tracks = plan.tracks.filter((track) => !room.hasActiveStreamJob(buildYoutubeTrackExternalId(track.id)));

    if (tracks.length === 0) {
      sendUnicast({
        ws,
        message: {
          type: "IMPORT_STATUS",
          status: "error",
          message: "Those YouTube tracks are already being imported",
          collectionName: plan.kind === "playlist" ? plan.title : undefined,
        },
      });
      return;
    }

    for (const track of tracks) {
      room.addStreamJob(buildYoutubeTrackExternalId(track.id));
    }

    sendBroadcast({
      server,
      roomId,
      message: {
        type: "STREAM_JOB_UPDATE",
        activeJobCount: room.getActiveStreamJobCount(),
      },
    });

    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "started",
        message:
          plan.kind === "playlist"
            ? `Importing playlist "${plan.title}" (${tracks.length} tracks)`
            : `Importing "${tracks[0]?.title ?? "YouTube video"}"`,
        collectionName: plan.kind === "playlist" ? plan.title : undefined,
      },
    });

    const playlistId = plan.kind === "playlist" ? randomUUID() : null;
    const playlistTracks: AudioSourceType[] = [];
    let importedCount = 0;
    let failedCount = 0;
    let queueChanged = false;
    let reusedCount = 0;
    const trackFailureMessages: string[] = [];

    for (let index = 0; index < tracks.length; index += 1) {
      const track = tracks[index];
      const jobKey = buildYoutubeTrackExternalId(track.id);
      const playlistCollection =
        playlistId && plan.title
          ? {
              type: "youtube-playlist" as const,
              id: playlistId,
              externalId: plan.playlistId,
              name: plan.title,
              position: index + 1,
            }
          : undefined;

      try {
        const { source, reusedExisting } = await resolveYoutubeTrackForRoom({
          room,
          roomId,
          track,
          collection: playlistCollection,
        });

        if (plan.kind === "playlist") {
          playlistTracks.push(source);
        }

        const alreadyInQueue = room.getAudioSources().some((audioSource) => audioSource.url === source.url);
        if (!alreadyInQueue) {
          room.addAudioSource(source);
          queueChanged = true;
        }

        if (reusedExisting) {
          reusedCount += 1;
        }

        importedCount += 1;
      } catch (error) {
        failedCount += 1;
        if (error instanceof Error && error.message.trim()) {
          trackFailureMessages.push(error.message.trim());
        }
        console.error(`Failed to import YouTube track ${track.title}:`, error);
      } finally {
        room.removeStreamJob(jobKey);
        sendBroadcast({
          server,
          roomId,
          message: {
            type: "STREAM_JOB_UPDATE",
            activeJobCount: room.getActiveStreamJobCount(),
          },
        });
      }
    }

    if (queueChanged) {
      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_AUDIO_SOURCES",
            sources: room.getAudioSources(),
          },
        },
      });
    }

    if (playlistId && playlistTracks.length > 0) {
      const artworkUrl = playlistTracks.find((track) => track.artworkUrl)?.artworkUrl;
      room.createPlaylist({
        id: playlistId,
        name: plan.title?.trim() ?? "Imported Playlist",
        artworkUrl,
        sourceKind: "youtube",
        externalId: plan.playlistId,
        originalUrl: message.url,
        trackUrls: playlistTracks.map((track) => track.url),
        tracks: playlistTracks,
      });

      sendBroadcast({
        server,
        roomId,
        message: {
          type: "ROOM_EVENT",
          event: {
            type: "SET_PLAYLISTS",
            playlists: room.getPlaylists(),
          },
        },
      });
    }

    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: failedCount > 0 && importedCount === 0 ? "error" : "completed",
        message:
          plan.kind === "playlist"
            ? `Imported ${importedCount} track${importedCount === 1 ? "" : "s"} into "${plan.title ?? "playlist"}"`
            : reusedCount > 0 && !queueChanged
              ? `"${tracks[0]?.title ?? "YouTube video"}" is already downloaded`
              : reusedCount > 0
                ? `Queued "${tracks[0]?.title ?? "YouTube video"}" from your library`
            : importedCount > 0
              ? `Imported "${tracks[0]?.title ?? "YouTube video"}"`
              : trackFailureMessages[0] ?? "Failed to import the YouTube media",
        importedCount,
        failedCount,
        collectionName: plan.kind === "playlist" ? plan.title : undefined,
      },
    });
  } catch (error) {
    console.error("Error importing YouTube URL:", error);
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: error instanceof Error ? error.message : "Failed to import YouTube media",
      },
    });
  } finally {
    if (room.getActiveStreamJobCount() === 0 && !room.hasActiveConnections()) {
      globalManager.scheduleRoomCleanup(roomId);
    }
  }
};
