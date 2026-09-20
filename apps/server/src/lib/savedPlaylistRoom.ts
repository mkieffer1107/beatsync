import type { RoomManager } from "@/managers/RoomManager";
import type { AudioSourceType, PlaylistType } from "@beatsync/shared";

function sourceIdentity(source: AudioSourceType): string[] {
  return [source.externalId, source.originalUrl, source.metadata?.sourceUrl]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
}

function findReplacement(source: AudioSourceType, playlist: PlaylistType): AudioSourceType | undefined {
  const identities = new Set(sourceIdentity(source));
  return playlist.tracks.find((candidate) => sourceIdentity(candidate).some((identity) => identities.has(identity)));
}

export function applySavedPlaylistToRoom({
  playlist,
  previousPlaylist,
  queueIfNew = false,
  room,
}: {
  playlist: PlaylistType;
  previousPlaylist?: PlaylistType;
  queueIfNew?: boolean;
  room: RoomManager;
}): AudioSourceType[] {
  const nextPlaylist = {
    ...playlist,
    // A YouTube refresh/rename returns a freshly materialized playlist. Carry
    // the room's default marker across that replacement so the empty-queue
    // action keeps pointing at the same saved playlist.
    isDefault: playlist.isDefault || previousPlaylist?.isDefault === true,
  };
  const previousTracks = previousPlaylist?.tracks ?? [];
  const previousIdentities = new Set(previousTracks.flatMap(sourceIdentity));
  let wasLoaded = false;

  const nextQueue = room.getAudioSources().flatMap((source) => {
    const belongsToPrevious = sourceIdentity(source).some((identity) => previousIdentities.has(identity));
    if (!belongsToPrevious) return [source];

    wasLoaded = true;
    const replacement = findReplacement(source, playlist);
    return replacement ? [replacement] : [];
  });

  if (previousPlaylist) room.deletePlaylist(previousPlaylist.id);
  room.deletePlaylist(nextPlaylist.id);
  room.createPlaylist(nextPlaylist);
  room.setAudioSources(nextQueue);

  if (queueIfNew || wasLoaded) {
    room.queuePlaylist(nextPlaylist.id);
  }

  return room.getAudioSources();
}
