import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleQueuePlaylist: HandlerFunction<ExtractWSRequestFrom["QUEUE_PLAYLIST"]> = ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);
  const queued = room.queuePlaylist(message.playlistId);
  if (!queued) {
    return;
  }

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_AUDIO_SOURCES",
        sources: room.getAudioSources(),
        currentAudioSource: room.getPlaybackState().audioSource || undefined,
      },
    },
  });
};
