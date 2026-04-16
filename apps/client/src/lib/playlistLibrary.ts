import type { AudioSourceType } from "@beatsync/shared";

import {
  getAudioSourceArtworkUrl,
  getAudioSourceCollectionLabel,
  getAudioSourceDisplayTitle,
} from "./audioSourceDisplay";

type UnknownRecord = Record<string, unknown>;

export interface PlaylistTrack {
  url: string;
  source: AudioSourceType;
  queueIndex: number;
  position: number;
  title: string;
  artworkUrl: string | null;
}

export interface PlaylistLibraryItem {
  id: string;
  name: string;
  description: string | null;
  artworkUrl: string | null;
  trackCount: number;
  origin: "derived" | "server";
  sourceKind: string | null;
  tracks: PlaylistTrack[];
}

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === "object" ? (value as UnknownRecord) : null;

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const readNestedString = (value: unknown, path: string[]) => {
  let currentValue: unknown = value;

  for (const segment of path) {
    const record = asRecord(currentValue);
    if (!record || !(segment in record)) {
      return null;
    }
    currentValue = record[segment];
  }

  return typeof currentValue === "string" && currentValue.trim() ? currentValue.trim() : null;
};

const readNestedNumber = (value: unknown, path: string[]) => {
  let currentValue: unknown = value;

  for (const segment of path) {
    const record = asRecord(currentValue);
    if (!record || !(segment in record)) {
      return null;
    }
    currentValue = record[segment];
  }

  if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
    return currentValue;
  }

  return null;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toAudioSource = (value: unknown): AudioSourceType | null => {
  const record = asRecord(value);
  if (!record || typeof record.url !== "string" || !record.url.trim()) {
    return null;
  }

  return record as AudioSourceType;
};

const toAudioSourceWithQueueIndex = (
  value: unknown,
  sourceIndexByUrl: Map<string, { source: AudioSourceType; queueIndex: number }>
) => {
  if (typeof value === "string") {
    return sourceIndexByUrl.get(value) ?? null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const sourceCandidate = toAudioSource(record.source) ?? toAudioSource(record.audioSource) ?? toAudioSource(record);
  if (!sourceCandidate) {
    const url = readString(record.url, record.audioSourceUrl, record.trackUrl);
    return url ? (sourceIndexByUrl.get(url) ?? null) : null;
  }

  return sourceIndexByUrl.get(sourceCandidate.url) ?? { source: sourceCandidate, queueIndex: -1 };
};

const getCollectionName = (source: AudioSourceType) => {
  const record = asRecord(source);

  return readString(
    readNestedString(record, ["collection", "name"]),
    readNestedString(record, ["collection", "title"]),
    readNestedString(record, ["playlist", "name"]),
    readNestedString(record, ["playlist", "title"]),
    record?.playlistTitle,
    record?.collectionLabel,
    getAudioSourceCollectionLabel(source)
  );
};

const getCollectionId = (source: AudioSourceType) => {
  const record = asRecord(source);

  return readString(
    readNestedString(record, ["collection", "id"]),
    readNestedString(record, ["playlist", "id"]),
    readNestedString(record, ["youtube", "playlistId"])
  );
};

const getCollectionPosition = (source: AudioSourceType, fallbackPosition: number) => {
  const record = asRecord(source);

  return (
    readNestedNumber(record, ["collection", "position"]) ??
    readNestedNumber(record, ["playlist", "position"]) ??
    readNestedNumber(record, ["youtube", "playlistPosition"]) ??
    fallbackPosition
  );
};

const getPlaylistSourceKind = (source: AudioSourceType) => {
  const record = asRecord(source);

  return readString(
    readNestedString(record, ["collection", "type"]),
    readNestedString(record, ["playlist", "type"]),
    record?.sourceKind
  );
};

const finalizePlaylist = (
  draft: Omit<PlaylistLibraryItem, "trackCount" | "artworkUrl" | "sourceKind"> & {
    artworkUrl?: string | null;
    sourceKind?: string | null;
  }
): PlaylistLibraryItem => {
  const tracks = [...draft.tracks].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.queueIndex - right.queueIndex;
  });

  return {
    ...draft,
    tracks,
    trackCount: tracks.length,
    artworkUrl: draft.artworkUrl ?? tracks.find((track) => track.artworkUrl)?.artworkUrl ?? null,
    sourceKind: draft.sourceKind ?? tracks.map((track) => getPlaylistSourceKind(track.source)).find(Boolean) ?? null,
  };
};

export const findPlaylistIdForTrack = (playlists: PlaylistLibraryItem[], url: string | null | undefined) => {
  if (!url) {
    return null;
  }

  const playlist = playlists.find((item) => item.tracks.some((track) => track.url === url));
  return playlist?.id ?? null;
};

export const derivePlaylistsFromAudioSources = (sources: AudioSourceType[]): PlaylistLibraryItem[] => {
  const drafts = new Map<
    string,
    Omit<PlaylistLibraryItem, "trackCount" | "artworkUrl" | "sourceKind"> & {
      artworkUrl?: string | null;
      sourceKind?: string | null;
    }
  >();

  sources.forEach((source, queueIndex) => {
    const collectionName = getCollectionName(source);
    if (!collectionName) {
      return;
    }

    const id = `derived:${getCollectionId(source) ?? slugify(collectionName)}`;
    const existing = drafts.get(id);
    const nextTrack: PlaylistTrack = {
      url: source.url,
      source,
      queueIndex,
      position: getCollectionPosition(source, queueIndex + 1),
      title: getAudioSourceDisplayTitle(source),
      artworkUrl: getAudioSourceArtworkUrl(source),
    };

    if (!existing) {
      drafts.set(id, {
        id,
        name: collectionName,
        description: null,
        origin: "derived",
        tracks: [nextTrack],
        artworkUrl: getAudioSourceArtworkUrl(source),
        sourceKind: getPlaylistSourceKind(source),
      });
      return;
    }

    existing.tracks.push(nextTrack);
    existing.artworkUrl = existing.artworkUrl ?? nextTrack.artworkUrl;
    existing.sourceKind = existing.sourceKind ?? getPlaylistSourceKind(source);
  });

  return [...drafts.values()]
    .map((draft) => finalizePlaylist(draft))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const normalizePlaylists = (playlists: unknown, sources: AudioSourceType[]): PlaylistLibraryItem[] => {
  if (!Array.isArray(playlists)) {
    return [];
  }

  const sourceIndexByUrl = new Map(sources.map((source, queueIndex) => [source.url, { source, queueIndex }]));
  const normalized: PlaylistLibraryItem[] = [];

  for (const candidate of playlists) {
    const record = asRecord(candidate);
    if (!record) {
      continue;
    }

    const name = readString(record.name, record.title, record.label);
    if (!name) {
      continue;
    }

    const trackCandidates = Array.isArray(record.tracks)
      ? record.tracks
      : Array.isArray(record.items)
        ? record.items
        : Array.isArray(record.audioSources)
          ? record.audioSources
          : Array.isArray(record.urls)
            ? record.urls
            : Array.isArray(record.trackUrls)
              ? record.trackUrls
              : [];

    const playlistId = readString(record.id, record.playlistId) ?? `server:${slugify(name)}`;
    const seenUrls = new Set<string>();
    const tracks: PlaylistTrack[] = [];

    trackCandidates.forEach((trackCandidate, index) => {
      const resolved = toAudioSourceWithQueueIndex(trackCandidate, sourceIndexByUrl);
      if (!resolved || seenUrls.has(resolved.source.url)) {
        return;
      }

      seenUrls.add(resolved.source.url);
      tracks.push({
        url: resolved.source.url,
        source: resolved.source,
        queueIndex: resolved.queueIndex,
        position:
          readNestedNumber(trackCandidate, ["position"]) ?? readNestedNumber(trackCandidate, ["order"]) ?? index + 1,
        title: getAudioSourceDisplayTitle(resolved.source),
        artworkUrl: getAudioSourceArtworkUrl(resolved.source),
      });
    });

    normalized.push(
      finalizePlaylist({
        id: playlistId,
        name,
        description: readString(record.description, record.subtitle),
        artworkUrl: readString(record.artworkUrl, record.thumbnailUrl, record.coverUrl),
        origin: "server",
        sourceKind: readString(record.sourceKind, record.kind, record.type),
        tracks,
      })
    );
  }

  return normalized.sort((left, right) => left.name.localeCompare(right.name));
};
