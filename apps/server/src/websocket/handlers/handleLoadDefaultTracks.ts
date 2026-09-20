import { IS_DEMO_MODE } from "@/demo";
import { applySavedPlaylistToRoom } from "@/lib/savedPlaylistRoom";
import { getSavedDefaultPlaylistId, listSavedPlaylists } from "@/lib/savedPlaylists";
import { sendBroadcast, sendUnicast } from "@/utils/responses";
import { requireCanMutate } from "@/websocket/middlewares";
import type { HandlerFunction } from "@/websocket/types";
import type { ExtractWSRequestFrom } from "@beatsync/shared";

export const handleLoadDefaultTracks: HandlerFunction<ExtractWSRequestFrom["LOAD_DEFAULT_TRACKS"]> = async ({
  ws,
  server,
}) => {
  if (IS_DEMO_MODE) return;
  const { room } = requireCanMutate(ws);

  const roomDefault = room.getPlaylists().find((playlist) => playlist.isSaved && playlist.isDefault);
  const defaultPlaylistId = roomDefault?.id ?? (await getSavedDefaultPlaylistId());
  const defaultPlaylist =
    (defaultPlaylistId ? room.getPlaylist(defaultPlaylistId) : undefined) ??
    (await listSavedPlaylists()).find((playlist) => playlist.id === defaultPlaylistId);

  if (!defaultPlaylist) {
    sendUnicast({
      ws,
      message: {
        type: "IMPORT_STATUS",
        status: "error",
        message: "No default saved playlist is configured. Choose Make default in the playlist menu first.",
      },
    });
    return;
  }

  const sources = applySavedPlaylistToRoom({
    room,
    playlist: { ...defaultPlaylist, isDefault: true },
    previousPlaylist: room.getPlaylist(defaultPlaylist.id),
    queueIfNew: true,
  });

  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: {
      type: "ROOM_EVENT",
      event: {
        type: "SET_AUDIO_SOURCES",
        sources,
        currentAudioSource: room.getPlaybackState().audioSource || undefined,
      },
    },
  });
  sendBroadcast({
    server,
    roomId: ws.data.roomId,
    message: { type: "ROOM_EVENT", event: { type: "SET_PLAYLISTS", playlists: room.getPlaylists() } },
  });
  sendUnicast({
    ws,
    message: {
      type: "IMPORT_STATUS",
      status: "completed",
      message: `Loaded default playlist "${defaultPlaylist.name}" (${defaultPlaylist.tracks.length} tracks)`,
      collectionName: defaultPlaylist.name,
      playlistId: defaultPlaylist.id,
      importedCount: defaultPlaylist.tracks.length,
    },
  });
};
