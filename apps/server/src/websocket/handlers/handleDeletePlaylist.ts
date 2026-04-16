import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleDeletePlaylist: HandlerFunction<ExtractWSRequestFrom["DELETE_PLAYLIST"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);

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
