import { IS_DEMO_MODE } from "@/demo";
import { deleteObject, extractKeyFromUrl } from "@/lib/r2";
import { sendBroadcast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleDeleteAudioSources: HandlerFunction<ExtractWSRequestFrom["DELETE_AUDIO_SOURCES"]> = async ({
  ws,
  message,
  server,
}) => {
  const { room } = requireCanMutate(ws);

  const currentSources = room.getAudioSources();
  const currentPlaylists = room.getPlaylists();
  const currentUrls = new Set(currentSources.map((source) => source.url));

  // Only process URLs that actually exist in the room
  const urlsToDelete = message.urls.filter((url) => currentUrls.has(url));

  if (urlsToDelete.length === 0) {
    return; // nothing to do, silent idempotency
  }

  // In demo mode, skip storage deletion — just remove from room state
  if (IS_DEMO_MODE) {
    const { updated, playlists, playlistsChanged } = room.removeAudioSources(urlsToDelete);
    sendBroadcast({
      server,
      roomId: ws.data.roomId,
      message: {
        type: "ROOM_EVENT",
        event: { type: "SET_AUDIO_SOURCES", sources: updated },
      },
    });
    if (playlistsChanged) {
      sendBroadcast({
        server,
        roomId: ws.data.roomId,
        message: {
          type: "ROOM_EVENT",
          event: { type: "SET_PLAYLISTS", playlists },
        },
      });
    }
    return;
  }

  const roomScopedPrefix = `room-${ws.data.roomId}/`;
  const successfullyDeletedUrls = new Set<string>();

  const storageDeletionPromises = urlsToDelete.map(async (url) => {
    const source = currentSources.find((candidate) => candidate.url === url);
    if (!source) {
      return;
    }

    if (room.hasPlaylistTrack(source.url)) {
      successfullyDeletedUrls.add(url);
      return;
    }

    const audioKey = extractKeyFromUrl(source.url);

    if (!audioKey?.startsWith(roomScopedPrefix)) {
      successfullyDeletedUrls.add(url);
      return;
    }

    try {
      await deleteObject(audioKey);
      console.log(`🗑️ Deleted storage object: ${audioKey}`);

      const artworkKey = source.artworkUrl ? extractKeyFromUrl(source.artworkUrl) : null;
      if (artworkKey && artworkKey.startsWith(roomScopedPrefix)) {
        const artworkStillReferencedBySource = currentSources.some(
          (candidate) => candidate.url !== source.url && candidate.artworkUrl === source.artworkUrl
        );
        const artworkStillReferencedByPlaylist = currentPlaylists.some(
          (playlist) => playlist.artworkUrl === source.artworkUrl
        );

        if (artworkStillReferencedBySource || artworkStillReferencedByPlaylist) {
          successfullyDeletedUrls.add(url);
          return;
        }

        try {
          await deleteObject(artworkKey);
          console.log(`🗑️ Deleted artwork object: ${artworkKey}`);
        } catch (artworkError) {
          console.error(`Failed to delete artwork object for URL ${source.artworkUrl}:`, artworkError);
        }
      }

      successfullyDeletedUrls.add(url);
    } catch (error) {
      console.error(`Failed to delete storage object for URL ${source.url}:`, error);
    }
  });

  // Wait for all storage deletion attempts to complete
  await Promise.all(storageDeletionPromises);

  // Only remove successfully deleted URLs from the room's queue
  const urlsToRemove = Array.from(successfullyDeletedUrls);

  if (urlsToRemove.length === 0) {
    console.log("No URLs were successfully deleted from storage, keeping all in queue");
    return;
  }

  // Remove only the successfully deleted sources from room state
  const { updated, playlists, playlistsChanged } = room.removeAudioSources(urlsToRemove);

  // Broadcast updated queue to all clients
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", sources: updated },
    },
  });

  if (playlistsChanged) {
    sendBroadcast({
      server,
      roomId: ws.data.roomId,
      message: {
        type: "ROOM_EVENT",
        event: { type: "SET_PLAYLISTS", playlists },
      },
    });
  }
};
