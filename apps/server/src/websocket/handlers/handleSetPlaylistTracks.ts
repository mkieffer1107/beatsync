import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleSetPlaylistTracks: HandlerFunction<ExtractWSRequestFrom["SET_PLAYLIST_TRACKS"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);

  const updated = room.setPlaylistTracks(message.playlistId, message.trackUrls);
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
