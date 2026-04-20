import {
  DiscoverRoomsType,
  GetActiveRoomsType,
  GetDefaultAudioType,
  GetUploadUrlType,
  UploadCompleteResponseType,
  UploadCompleteType,
  UploadUrlResponseType,
} from "@beatsync/shared";
import axios from "axios";
import { getApiUrl } from "./urls";

const baseAxios = axios.create({
  get baseURL() {
    return getApiUrl();
  },
});

const readFileDuration = (file: File) =>
  new Promise<number>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
      URL.revokeObjectURL(objectUrl);
      audio.src = "";
    };

    const handleLoadedMetadata = () => {
      const durationSeconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      cleanup();
      resolve(durationSeconds);
    };

    const handleError = () => {
      cleanup();
      resolve(0);
    };

    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("error", handleError);
    audio.src = objectUrl;
  });

export const uploadAudioFile = async (data: { file: File; roomId: string }) => {
  try {
    const durationSeconds = await readFileDuration(data.file);

    // Step 1: Get presigned upload URL from server
    const uploadUrlRequest: GetUploadUrlType = {
      roomId: data.roomId,
      fileName: data.file.name,
      contentType: data.file.type,
    };

    const presignedURLResponse = await baseAxios.post<UploadUrlResponseType>(
      "/upload/get-presigned-url",
      uploadUrlRequest
    );

    const { uploadUrl, publicUrl } = presignedURLResponse.data;

    // Step 2: Upload directly to R2 using presigned URL
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: data.file,
      headers: {
        "Content-Type": data.file.type,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    // Step 3: Notify server that upload completed successfully
    const uploadCompleteRequest: UploadCompleteType = {
      roomId: data.roomId,
      originalName: data.file.name,
      publicUrl,
      durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
    };

    await baseAxios.post<UploadCompleteResponseType>("/upload/complete", uploadCompleteRequest);

    return {
      success: true,
      publicUrl,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.message || "Failed to upload audio file");
    }
    throw error;
  }
};

export const fetchAudio = async (url: string) => {
  try {
    // Direct fetch from R2 public URL - zero server bandwidth
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    throw new Error(`Failed to fetch audio: ${error}`);
  }
};

export async function fetchDefaultAudioSources() {
  try {
    const response = await fetch(`${getApiUrl()}/default`);

    if (!response.ok) {
      console.error("Failed to fetch default audio sources:", response.status);
      return [];
    }

    const files: GetDefaultAudioType = await response.json();
    return files;
  } catch (error) {
    console.error("Error fetching default audio sources:", error);
    return [];
  }
}

export async function fetchActiveRooms() {
  const response = await fetch(`${getApiUrl()}/active-rooms`);
  const data: GetActiveRoomsType = await response.json();
  return data;
}

export async function fetchDiscoverRooms() {
  const response = await fetch(`${getApiUrl()}/discover`);
  const data: DiscoverRoomsType = await response.json();
  return data;
}
