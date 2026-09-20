import type { ExtractWSRequestFrom } from "@beatsync/shared";
import { IS_DEMO_MODE } from "@/demo";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";

export const handlePlay: HandlerFunction<ExtractWSRequestFrom["PLAY"]> = ({ ws, message, server }) => {
  const { room } = requireCanMutate(ws);

  if (IS_DEMO_MODE) {
    // Skip audio loading coordination — audio is pre-cached on clients.
    // Broadcast play immediately to avoid 3s timeout dead air on stage.
    room.executeImmediatePlay(message, server);
  } else {
    // Default: play as each browser becomes ready. Synchronized mode waits for loading.
    room.initiateAudioSourceLoad(message, ws.data.clientId, server);
  }
};
