import { applySavedPlaylistToRoom } from "@/lib/savedPlaylistRoom";
import { renameSavedPlaylist } from "@/lib/savedPlaylists";
import { sendBroadcast, sendUnicast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleUpdatePlaylist: HandlerFunction<ExtractWSRequestFrom["UPDATE_PLAYLIST"]> = async ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);

  const existing = room.getPlaylist(message.playlistId);
  if (!existing) return;

  if (existing.isSaved && message.name) {
    try {
      const renamed = await renameSavedPlaylist(existing.id, message.name);
      const sources = applySavedPlaylistToRoom({ room, playlist: renamed, previousPlaylist: existing });
      sendBroadcast({
        server,
        roomId: ws.data.roomId,
        message: { type: "ROOM_EVENT", event: { type: "SET_AUDIO_SOURCES", sources } },
      });
      sendBroadcast({
        server,
        roomId: ws.data.roomId,
        message: { type: "ROOM_EVENT", event: { type: "SET_PLAYLISTS", playlists: room.getPlaylists() } },
      });
      sendUnicast({
        ws,
        message: {
          type: "IMPORT_STATUS",
          status: "completed",
          message: `Renamed saved playlist to "${renamed.name}"`,
          collectionName: renamed.name,
          playlistId: renamed.id,
        },
      });
    } catch (error) {
      sendUnicast({
        ws,
        message: {
          type: "IMPORT_STATUS",
          status: "error",
          message: error instanceof Error ? error.message : "Failed to rename saved playlist",
        },
      });
    }
    return;
  }

  const updated = room.updatePlaylist(message.playlistId, {
    name: message.name,
    artworkUrl: message.artworkUrl,
  });

  if (!updated) {
    return;
  }

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_PLAYLISTS",
        playlists: room.getPlaylists(),
      },
    },
  });
};
