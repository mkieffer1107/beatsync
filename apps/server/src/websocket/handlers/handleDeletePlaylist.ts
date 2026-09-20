import { sendBroadcast, sendUnicast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleDeletePlaylist: HandlerFunction<ExtractWSRequestFrom["DELETE_PLAYLIST"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  const playlist = room.getPlaylist(message.playlistId);

  if (playlist?.isSaved) {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: "Saved playlists remain on this server. Remove their tracks from the queue instead.",
      },
    });
    return;
  }

  room.deletePlaylist(message.playlistId);

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
