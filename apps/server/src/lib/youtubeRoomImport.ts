import { downloadYoutubeThumbnail, downloadYoutubeTrack, type YoutubeImportTrack } from "@/lib/youtube";
import { generateAudioFileName, uploadBytes } from "@/lib/r2";
import type { RoomManager } from "@/managers/RoomManager";
import type { AudioSourceCollectionType, AudioSourceType } from "@beatsync/shared";

export const buildYoutubeTrackExternalId = (trackId: string) => `youtube:${trackId}`;

export async function resolveYoutubeTrackForRoom(params: {
  room: RoomManager;
  roomId: string;
  track: YoutubeImportTrack;
  collection?: AudioSourceCollectionType;
}): Promise<{ source: AudioSourceType; reusedExisting: boolean }> {
  const { room, roomId, track, collection } = params;
  const externalId = buildYoutubeTrackExternalId(track.id);
  const existingTrack = room.findTrackByExternalId(externalId) ?? room.findTrackByOriginalUrl(track.sourceUrl);

  if (existingTrack) {
    return {
      source: {
        ...existingTrack,
        externalId: existingTrack.externalId ?? externalId,
        metadata: {
          ...existingTrack.metadata,
          sourceUrl: existingTrack.metadata?.sourceUrl ?? existingTrack.originalUrl ?? track.sourceUrl,
          youtubeVideoId: existingTrack.metadata?.youtubeVideoId ?? track.id,
          durationSeconds: existingTrack.metadata?.durationSeconds ?? track.durationSeconds,
        },
        collection: collection ?? existingTrack.collection,
      },
      reusedExisting: true,
    };
  }

  const download = await downloadYoutubeTrack(track);

  try {
    const audioBuffer = await Bun.file(download.filePath).arrayBuffer();
    const audioFileName = generateAudioFileName(`${track.title}.mp3`);
    const audioUrl = await uploadBytes(audioBuffer, roomId, audioFileName, "audio/mpeg");

    let artworkUrl: string | undefined;

    if (track.thumbnailUrl) {
      const thumbnail = await downloadYoutubeThumbnail(track.thumbnailUrl);
      if (thumbnail) {
        const artworkFileName = generateAudioFileName(`${track.title}-art${thumbnail.extension}`);
        artworkUrl = await uploadBytes(thumbnail.bytes, roomId, artworkFileName, thumbnail.contentType);
      }
    }

    return {
      source: {
        url: audioUrl,
        title: track.title,
        artworkUrl,
        originalUrl: track.sourceUrl,
        sourceKind: "youtube",
        externalId,
        metadata: {
          sourceUrl: track.sourceUrl,
          youtubeVideoId: track.id,
          durationSeconds: track.durationSeconds,
        },
        collection,
      },
      reusedExisting: false,
    };
  } finally {
    await download.cleanup();
  }
}
