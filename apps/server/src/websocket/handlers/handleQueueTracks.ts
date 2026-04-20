import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleQueueTracks: HandlerFunction<ExtractWSRequestFrom["QUEUE_TRACKS"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  const queued = room.queueTracks(message.urls);

  if (queued.addedCount === 0) {
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
