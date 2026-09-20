import { IS_DEMO_MODE } from "@/demo";
import { applySavedPlaylistToRoom } from "@/lib/savedPlaylistRoom";
import { syncSavedYoutubePlaylist } from "@/lib/savedPlaylists";
import { globalManager } from "@/managers";
import { sendBroadcast, sendUnicast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleSaveYoutubePlaylist: HandlerFunction<ExtractWSRequestFrom["SAVE_YOUTUBE_PLAYLIST"]> = async ({
  ws,
  message,
  server,
}) => {
  if (IS_DEMO_MODE) {
    sendUnicast({
      ws,
      message: { type: "IMPORT_STATUS", status: "error", message: "Saved playlists are disabled in demo mode" },
    });
    return;
  }

  const { room } = requireCanMutate(ws);
  const roomId = ws.data.roomId;
  const sourcePlaylist = message.playlistId ? room.getPlaylist(message.playlistId) : undefined;
  const originalUrl = message.url ?? sourcePlaylist?.originalUrl;

  if (!originalUrl || (sourcePlaylist && sourcePlaylist.sourceKind !== "youtube")) {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: sourcePlaylist
          ? `"${sourcePlaylist.name}" is not a YouTube playlist`
          : "A YouTube playlist URL is required",
      },
    });
    return;
  }

  const jobKey = `saved-playlist:${message.playlistId ?? originalUrl}`;
  if (room.hasActiveStreamJob(jobKey)) {
    sendUnicast({
      ws,
      message: { type: "IMPORT_STATUS", status: "error", message: "That playlist is already being saved" },
    });
    return;
  }

  room.cancelCleanup();
  room.addStreamJob(jobKey);
  sendBroadcast({
    server,
    roomId,
    message: { type: "STREAM_JOB_UPDATE", activeJobCount: room.getActiveStreamJobCount() },
  });
  sendUnicast({
    ws,
    message: {
      type: "IMPORT_STATUS",
      status: "started",
      message: `Saving "${[message.name, sourcePlaylist?.name].find((candidate) => candidate?.trim())?.trim() ?? "YouTube playlist"}" for offline use`,
    },
  });

  try {
    const result = await syncSavedYoutubePlaylist({
      name: message.name ?? sourcePlaylist?.name,
      originalUrl,
      playlistId: sourcePlaylist?.isSaved ? sourcePlaylist.id : undefined,
    });
    const previousPlaylist = room.getPlaylist(result.playlist.id) ?? sourcePlaylist;
    const sources = applySavedPlaylistToRoom({
      room,
      playlist: result.playlist,
      previousPlaylist,
      queueIfNew: !previousPlaylist,
    });

    sendBroadcast({
      server,
      roomId,
      message: { type: "ROOM_EVENT", event: { type: "SET_AUDIO_SOURCES", sources } },
    });
    sendBroadcast({
      server,
      roomId,
      message: { type: "ROOM_EVENT", event: { type: "SET_PLAYLISTS", playlists: room.getPlaylists() } },
    });
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "completed",
        message: `Saved "${result.playlist.name}" (${result.playlist.tracks.length} tracks${result.failedCount ? `; ${result.failedCount} unavailable skipped` : ""})`,
        importedCount: result.addedCount,
        failedCount: result.failedCount,
        collectionName: result.playlist.name,
        playlistId: result.playlist.id,
      },
    });
  } catch (error) {
    console.error("Error saving YouTube playlist:", error);
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: error instanceof Error ? error.message : "Failed to save YouTube playlist",
      },
    });
  } finally {
    room.removeStreamJob(jobKey);
    sendBroadcast({
      server,
      roomId,
      message: { type: "STREAM_JOB_UPDATE", activeJobCount: room.getActiveStreamJobCount() },
    });
    if (room.getActiveStreamJobCount() === 0 && !room.hasActiveConnections()) {
      globalManager.scheduleRoomCleanup(roomId);
    }
  }
};
