import { IS_DEMO_MODE } from "@/demo";
import { getDefaultAudioSources } from "@/lib/defaultAudio";
import { observePublicBaseUrl } from "@/lib/r2";
import { errorResponse, jsonResponse } from "@/utils/responses";

export async function handleGetDefaultAudio(req: Request) {
  if (IS_DEMO_MODE) return jsonResponse([]);

  try {
    const origin = new URL(req.url).origin;
    observePublicBaseUrl(origin);

    return jsonResponse(await getDefaultAudioSources(origin));
  } catch (error) {
    console.error("Failed to list default audio files:", error);
    return errorResponse("Failed to list default audio files", 500);
  }
}
