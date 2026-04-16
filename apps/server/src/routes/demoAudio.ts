import { AUDIO_FILE_CACHE } from "@/demo";
import { getStorageMode, serveLocalAudio } from "@/lib/r2";
import { corsHeaders, errorResponse } from "@/utils/responses";

export async function handleServeAudio(pathname: string): Promise<Response> {
  const filename = decodeURIComponent(pathname.slice("/audio/".length));

  const cached = AUDIO_FILE_CACHE.get(filename);
  if (cached) {
    return new Response(cached.bytes.buffer as ArrayBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": cached.type,
        "Content-Length": cached.bytes.byteLength.toString(),
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  }

  if (getStorageMode() === "local") {
    return await serveLocalAudio(pathname);
  }

  return errorResponse("File not found", 404);
}
