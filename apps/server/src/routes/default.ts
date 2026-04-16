import { IS_DEMO_MODE } from "@/demo";
import { getPublicUrlForKey, listObjectsWithPrefix, observePublicBaseUrl } from "@/lib/r2";
import { errorResponse, jsonResponse } from "@/utils/responses";
import type { GetDefaultAudioType } from "@beatsync/shared";

export async function handleGetDefaultAudio(req: Request) {
  if (IS_DEMO_MODE) return jsonResponse([]);

  try {
    const origin = new URL(req.url).origin;
    observePublicBaseUrl(origin);

    // List all objects with "default/" prefix
    const objects = await listObjectsWithPrefix("default/");

    if (!objects || objects.length === 0) {
      return jsonResponse([]);
    }

    // Map to array of objects with public URLs
    const response: GetDefaultAudioType = objects.map((obj) => ({
      sourceKind: "upload",
      title: obj.Key?.split("/")
        .pop()
        ?.replace(/\.[^/.]+$/, ""),
      url: getPublicUrlForKey(obj.Key!, origin),
    }));

    return jsonResponse(response);
  } catch (error) {
    console.error("Failed to list default audio files:", error);
    return errorResponse("Failed to list default audio files", 500);
  }
}
