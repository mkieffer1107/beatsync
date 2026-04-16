import type { AudioSourceType } from "@beatsync/shared";

import { extractFileNameFromUrl } from "./utils";

type AudioSourceWithMetadata = AudioSourceType & Record<string, unknown>;

const asRecord = (source: AudioSourceType): AudioSourceWithMetadata => source as AudioSourceWithMetadata;

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        return trimmedValue;
      }
    }
  }

  return null;
};

const readNestedString = (value: unknown, path: string[]) => {
  let currentValue: unknown = value;

  for (const segment of path) {
    if (!currentValue || typeof currentValue !== "object" || !(segment in currentValue)) {
      return null;
    }
    currentValue = (currentValue as Record<string, unknown>)[segment];
  }

  return typeof currentValue === "string" && currentValue.trim() ? currentValue.trim() : null;
};

export const getAudioSourceDisplayTitle = (source: AudioSourceType) => {
  const record = asRecord(source);
  const metadataTitle = readString(
    record.title,
    record.trackTitle,
    record.trackName,
    record.name,
    readNestedString(record, ["metadata", "title"]),
    readNestedString(record, ["youtube", "title"])
  );

  if (metadataTitle) {
    return metadataTitle;
  }

  try {
    return extractFileNameFromUrl(source.url);
  } catch {
    return source.url;
  }
};

export const getAudioSourceArtworkUrl = (source: AudioSourceType) => {
  const record = asRecord(source);

  return readString(
    record.artworkUrl,
    record.artUrl,
    record.thumbnailUrl,
    readNestedString(record, ["artwork", "url"]),
    readNestedString(record, ["metadata", "artworkUrl"]),
    readNestedString(record, ["youtube", "artworkUrl"])
  );
};

export const getAudioSourceCollectionLabel = (source: AudioSourceType) => {
  const record = asRecord(source);

  return readString(
    record.collectionLabel,
    record.playlistTitle,
    readNestedString(record, ["collection", "label"]),
    readNestedString(record, ["collection", "title"]),
    readNestedString(record, ["collection", "name"]),
    readNestedString(record, ["playlist", "title"]),
    readNestedString(record, ["playlist", "name"]),
    readNestedString(record, ["youtube", "playlistTitle"])
  );
};
