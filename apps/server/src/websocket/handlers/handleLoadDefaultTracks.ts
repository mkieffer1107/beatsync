import { IS_DEMO_MODE } from "@/demo";
import { getPublicUrlForKey, listObjectsWithPrefix, observePublicBaseUrl } from "@/lib/r2";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleLoadDefaultTracks: HandlerFunction<ExtractWSRequestFrom["LOAD_DEFAULT_TRACKS"]> = async ({
  ws,
  server,
}) => {
  if (IS_DEMO_MODE) return;
  const { room } = requireCanMutate(ws);
  observePublicBaseUrl(ws.data.serverOrigin);

  // List default objects from active storage and map to public URLs
  const objects = await listObjectsWithPrefix("default/");
  if (!objects || objects.length === 0) {
    return;
  }

  const urls = objects
    .filter((obj) => !!obj.Key)
    .map((obj) => ({
      url: getPublicUrlForKey(obj.Key!, ws.data.serverOrigin),
      title: obj.Key?.split("/")
        .pop()
        ?.replace(/\.[^/.]+$/, ""),
    }));

  // Existing room sources and simple URL set for dedupe
  const existingUrlSet = new Set(room.getAudioSources().map((s) => s.url));

  // Filter out any defaults already present in the room
  const toAdd = urls.filter((u) => !existingUrlSet.has(u.url));

  if (toAdd.length === 0) {
    console.log(`[${ws.data.roomId}] No new default tracks to add (all already present).`);
    return;
  }

  // Append only new sources
  for (const src of toAdd) {
    room.addAudioSource(src);
  }

  const updated = room.getAudioSources();

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources: updated },
    },
  });
};
