import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleClearAudioQueue: HandlerFunction<ExtractWSRequestFrom["CLEAR_AUDIO_QUEUE"]> = ({ ws, server }) => {
  const { room } = requireCanMutate(ws);
  room.clearAudioQueue();

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_AUDIO_SOURCES",
        sources: [],
      },
    },
  });
};
