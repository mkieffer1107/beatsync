import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handleSetShuffle: HandlerFunction<ExtractWSRequestFrom["SET_SHUFFLE"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);
  room.setShuffle(message.enabled);

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_SHUFFLE",
        enabled: message.enabled,
      },
    },
  });
};
