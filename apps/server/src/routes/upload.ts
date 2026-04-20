import type { UploadCompleteResponseType, UploadUrlResponseType } from "@beatsync/shared";
import { GetUploadUrlSchema, UploadCompleteSchema } from "@beatsync/shared";
import type { BunServer } from "@/utils/websocket";
import {
  createUploadTarget,
  generateAudioFileName,
  getStorageMode,
  handleLocalUpload as handleLocalUploadRequest,
  observePublicBaseUrl,
  validateAudioFileExists,
} from "@/lib/r2";
import { globalManager } from "@/managers";
import { errorResponse, jsonResponse, sendBroadcast } from "@/utils/responses";

export const handleGetPresignedURL = async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const origin = new URL(req.url).origin;
    observePublicBaseUrl(origin);

    const body: unknown = await req.json();
    const parseResult = GetUploadUrlSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(`Invalid request data: ${parseResult.error.message}`, 400);
    }

    const { roomId, fileName, contentType } = parseResult.data;

    // Check if room exists
    const room = globalManager.getRoom(roomId);
    if (!room) {
      return errorResponse("Room not found. Please join the room before uploading files.", 404);
    }

    // Generate unique filename
    const uniqueFileName = generateAudioFileName(fileName);

    const { uploadUrl, publicUrl } = await createUploadTarget({
      baseUrl: origin,
      contentType,
      fileName: uniqueFileName,
      roomId,
    });

    console.log(`Generated ${getStorageMode()} upload URL for room ${roomId}: ${uniqueFileName}`);

    const response: UploadUrlResponseType = {
      uploadUrl,
      publicUrl,
    };

    return jsonResponse(response);
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return errorResponse("Failed to generate upload URL", 500);
  }
};

// Endpoint to confirm successful upload and broadcast to room
export const handleUploadComplete = async (req: Request, server: BunServer) => {
  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const body: unknown = await req.json();
    const parseResult = UploadCompleteSchema.safeParse(body);

    if (!parseResult.success) {
      return errorResponse(`Invalid request data: ${parseResult.error.message}`, 400);
    }

    const { roomId, originalName, publicUrl, durationSeconds } = parseResult.data;
    observePublicBaseUrl(new URL(req.url).origin);

    // Check if room exists
    const room = globalManager.getRoom(roomId);
    if (!room) {
      return errorResponse("Room not found. The room may have been closed during upload.", 404);
    }

    const fileExists = await validateAudioFileExists(publicUrl);
    if (!fileExists) {
      return errorResponse("Uploaded file not found in storage.", 400);
    }

    const title = originalName.replace(/\.[^/.]+$/, "").trim() || originalName;
    const sources = room.addAudioSource({
      url: publicUrl,
      title,
      sourceKind: "upload",
      metadata: durationSeconds && durationSeconds > 0 ? { durationSeconds } : undefined,
    });

    console.log(`✅ Audio upload completed - broadcasting to room ${roomId} new sources: ${JSON.stringify(sources)}`);

    // Broadcast to room that new audio is available
    sendBroadcast({
      server,
      roomId,
      message: {
        type: "ROOM_EVENT",
        event: {
          type: "SET_AUDIO_SOURCES",
          sources,
        },
      },
    });

    const response: UploadCompleteResponseType = { success: true };
    return jsonResponse(response);
  } catch (error) {
    console.error("Error confirming upload:", error);
    return errorResponse("Failed to confirm upload", 500);
  }
};

export const handleLocalUpload = async (req: Request, pathname: string) => {
  const token = decodeURIComponent(pathname.slice("/upload/local/".length));
  if (!token) {
    return errorResponse("Upload URL expired or invalid", 404);
  }

  return await handleLocalUploadRequest(req, token);
};
