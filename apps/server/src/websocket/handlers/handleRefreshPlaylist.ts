import { globalManager } from "@/managers";
import { getYoutubeImportPlan } from "@/lib/youtube";
import { buildYoutubeTrackExternalId, resolveYoutubeTrackForRoom } from "@/lib/youtubeRoomImport";
import { observePublicBaseUrl } from "@/lib/r2";
import { sendBroadcast, sendUnicast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { AudioSourceType, ExtractWSRequestFrom } from "@beatsync/shared";

const getPlaylistRefreshUrl = (playlistOriginalUrl?: string, playlistExternalId?: string) => {
  if (playlistOriginalUrl?.trim()) {
    return playlistOriginalUrl;
  }

  if (playlistExternalId?.trim()) {
    return `https://www.youtube.com/playlist?list=${playlistExternalId}`;
  }

  return null;
};

export const handleRefreshPlaylist: HandlerFunction<ExtractWSRequestFrom["REFRESH_PLAYLIST"]> = async ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  const roomId = ws.data.roomId;
  observePublicBaseUrl(ws.data.serverOrigin);
  room.cancelCleanup();

  room.getPlaylists();
  const playlist = room.getPlaylist(message.playlistId);

  if (!playlist) {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: "Playlist not found",
      },
    });
    return;
  }

  if (playlist.sourceKind !== "youtube") {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: `"${playlist.name}" is not a YouTube playlist`,
      },
    });
    return;
  }

  const refreshUrl = getPlaylistRefreshUrl(playlist.originalUrl, playlist.externalId);
  if (!refreshUrl) {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: `No upstream playlist URL is saved for "${playlist.name}"`,
      },
    });
    return;
  }

  try {
    const plan = await getYoutubeImportPlan(refreshUrl, "playlist");
    if (plan.kind !== "playlist") {
      throw new Error("That URL no longer resolves to a YouTube playlist");
    }

    const existingSourceUrls = new Set(
      playlist.tracks
        .map((track) => track.metadata?.sourceUrl ?? track.originalUrl)
        .filter((sourceUrl): sourceUrl is string => Boolean(sourceUrl))
    );
    const existingExternalIds = new Set(
      playlist.tracks
        .map((track) => track.externalId)
        .filter((externalId): externalId is string => Boolean(externalId))
    );
    const missingTracks = plan.tracks.filter(
      (track) =>
        !existingSourceUrls.has(track.sourceUrl) &&
        !existingExternalIds.has(buildYoutubeTrackExternalId(track.id))
    );
    const tracksToImport = missingTracks.filter((track) => !room.hasActiveStreamJob(buildYoutubeTrackExternalId(track.id)));

    if (missingTracks.length === 0) {
      sendUnicast({
        ws,
        message: {
          type: "IMPORT_STATUS",
          status: "completed",
          message: `No new tracks found in "${playlist.name}"`,
          importedCount: 0,
          failedCount: 0,
          collectionName: playlist.name,
        },
      });
      return;
    }

    if (tracksToImport.length === 0) {
      sendUnicast({
        ws,
        message: {
          type: "IMPORT_STATUS",
          status: "error",
          message: `New tracks for "${playlist.name}" are already being imported`,
          collectionName: playlist.name,
        },
      });
      return;
    }

    for (const track of tracksToImport) {
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
        message: `Refreshing "${playlist.name}" (${tracksToImport.length} new track${tracksToImport.length === 1 ? "" : "s"})`,
        collectionName: playlist.name,
      },
    });

    const appendedTracks: AudioSourceType[] = [];
    let importedCount = 0;
    let failedCount = 0;
    let reusedCount = 0;
    const trackFailureMessages: string[] = [];
    const basePosition = playlist.tracks.length;
    const nextCollectionName = plan.title?.trim() ?? playlist.name;
    const nextPlaylistExternalId = plan.playlistId ?? playlist.externalId;

    for (let index = 0; index < tracksToImport.length; index += 1) {
      const track = tracksToImport[index];
      const jobKey = buildYoutubeTrackExternalId(track.id);

      try {
        const { source, reusedExisting } = await resolveYoutubeTrackForRoom({
          room,
          roomId,
          track,
          collection: {
            type: "youtube-playlist",
            id: playlist.id,
            externalId: nextPlaylistExternalId,
            name: nextCollectionName,
            position: basePosition + index + 1,
          },
        });

        appendedTracks.push(source);
        importedCount += 1;
        if (reusedExisting) {
          reusedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        if (error instanceof Error && error.message.trim()) {
          trackFailureMessages.push(error.message.trim());
        }
        console.error(`Failed to refresh YouTube track ${track.title}:`, error);
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

    const nextArtworkUrl = playlist.artworkUrl ?? appendedTracks.find((track) => track.artworkUrl)?.artworkUrl;
    room.updatePlaylist(playlist.id, {
      name: nextCollectionName,
      artworkUrl: nextArtworkUrl ?? undefined,
      externalId: nextPlaylistExternalId,
      originalUrl: refreshUrl,
      sourceKind: "youtube",
    });

    if (appendedTracks.length > 0) {
      room.appendTracksToPlaylist(playlist.id, appendedTracks);
    }

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

    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: failedCount > 0 && importedCount === 0 ? "error" : "completed",
        message:
          importedCount > 0
            ? `Added ${importedCount} new track${importedCount === 1 ? "" : "s"} to "${nextCollectionName}"${reusedCount > 0 ? " using existing downloads where possible" : ""}`
            : trackFailureMessages[0] ?? `Failed to refresh "${nextCollectionName}"`,
        importedCount,
        failedCount,
        collectionName: nextCollectionName,
      },
    });
  } catch (error) {
    console.error(`Error refreshing playlist ${playlist.name}:`, error);
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: error instanceof Error ? error.message : `Failed to refresh "${playlist.name}"`,
        collectionName: playlist.name,
      },
    });
  } finally {
    if (room.getActiveStreamJobCount() === 0 && !room.hasActiveConnections()) {
      globalManager.scheduleRoomCleanup(roomId);
    }
  }
};
