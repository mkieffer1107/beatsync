import { setSavedDefaultPlaylistId } from "@/lib/savedPlaylists";
import { sendBroadcast, sendUnicast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleSetDefaultPlaylist: HandlerFunction<ExtractWSRequestFrom["SET_DEFAULT_PLAYLIST"]> = async ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
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

  if (!playlist.isSaved) {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: "Only saved playlists can be the default because the setting survives restarts.",
      },
    });
    return;
  }

  await setSavedDefaultPlaylistId(playlist.id);
  room.setDefaultPlaylist(playlist.id);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "SET_PLAYLISTS", playlists: room.getPlaylists() },
    },
  });
  sendUnicast({
    ws,
    message: {
      type: "IMPORT_STATUS",
      status: "completed",
      message: `"${playlist.name}" is now the default playlist`,
      collectionName: playlist.name,
      playlistId: playlist.id,
    },
  });
};

