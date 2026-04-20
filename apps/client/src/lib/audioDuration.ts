import type { AudioSourceType } from "@beatsync/shared";

import { getApiUrl } from "./urls";

type AudioSourceWithDurationMetadata = AudioSourceType & {
  durationSeconds?: number;
  metadata?: AudioSourceType["metadata"] & {
    durationSeconds?: number;
  };
};

const resolvedTrackDurations = new Map<string, number>();
const pendingTrackDurationLoads = new Map<string, Promise<number>>();

const isValidDuration = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

const resolveTrackAssetUrl = (url: string) => (url.startsWith("/") ? `${getApiUrl()}${url}` : url);

export const getStoredAudioDuration = (source: AudioSourceType | null | undefined) => {
  if (!source) {
    return 0;
  }

  const record = source as AudioSourceWithDurationMetadata;
  if (isValidDuration(record.metadata?.durationSeconds)) {
    return record.metadata.durationSeconds;
  }

  if (isValidDuration(record.durationSeconds)) {
    return record.durationSeconds;
  }

  return 0;
};

export const getCachedAudioDuration = (url: string) => resolvedTrackDurations.get(url) ?? 0;

export const primeAudioDuration = (url: string, durationSeconds: number) => {
  if (isValidDuration(durationSeconds)) {
    resolvedTrackDurations.set(url, durationSeconds);
  }
};

export const resolveAudioDuration = (params: { url: string; source?: AudioSourceType | null }) => {
  const { url, source } = params;
  const storedDuration = getStoredAudioDuration(source);
  if (storedDuration > 0) {
    primeAudioDuration(url, storedDuration);
    return Promise.resolve(storedDuration);
  }

  const cachedDuration = getCachedAudioDuration(url);
  if (cachedDuration > 0) {
    return Promise.resolve(cachedDuration);
  }

  const pendingLoad = pendingTrackDurationLoads.get(url);
  if (pendingLoad) {
    return pendingLoad;
  }

  const durationPromise = new Promise<number>((resolve) => {
    const audio = new Audio();

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
      audio.src = "";
    };

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (nextDuration > 0) {
        primeAudioDuration(url, nextDuration);
      }
      pendingTrackDurationLoads.delete(url);
      cleanup();
      resolve(nextDuration);
    };

    const handleError = () => {
      pendingTrackDurationLoads.delete(url);
      cleanup();
      resolve(0);
    };

    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("error", handleError);
    audio.src = resolveTrackAssetUrl(url);
  });

  pendingTrackDurationLoads.set(url, durationPromise);
  return durationPromise;
};
