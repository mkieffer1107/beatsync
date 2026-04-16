"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAudioSourceArtworkUrl } from "@/lib/audioSourceDisplay";
import { PlaylistLibraryItem, PlaylistTrack } from "@/lib/playlistLibrary";
import { cn } from "@/lib/utils";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import { Disc3, ListMusic, PencilLine, Play, Plus, Radio, Rows3, WandSparkles } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { PlaylistEditorDialog, type PlaylistEditorTrack } from "./PlaylistEditorDialog";

const getPlaylistAccentLabel = (playlist: PlaylistLibraryItem) => {
  if (playlist.sourceKind === "youtube-playlist" || playlist.sourceKind === "youtube") {
    return "YouTube";
  }

  if (playlist.origin === "server") {
    return "Playlist";
  }

  return "Collection";
};

const PlaylistArtwork = ({ playlist }: { playlist: PlaylistLibraryItem }) => {
  const artworkTiles = playlist.tracks
    .map((track) => track.artworkUrl ?? getAudioSourceArtworkUrl(track.source))
    .filter((artwork): artwork is string => Boolean(artwork))
    .slice(0, 4);

  if (artworkTiles.length > 0) {
    const gridClassName =
      artworkTiles.length === 1 ? "grid-cols-1" : artworkTiles.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2";

    return (
      <div
        className={cn(
          "relative size-[4.5rem] overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.9)]",
          "grid gap-[1px] bg-white/5",
          gridClassName
        )}
      >
        {artworkTiles.map((artwork, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${playlist.id}-${index}`}
            src={artwork}
            alt={playlist.name}
            className="h-full w-full object-cover"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex size-[4.5rem] items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-800 to-neutral-950 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.9)]">
      <Disc3 className="size-7 text-neutral-300" />
    </div>
  );
};

const PlaylistCard = ({
  playlist,
  isActive,
  onSelect,
  currentTrackUrl,
}: {
  playlist: PlaylistLibraryItem;
  isActive: boolean;
  onSelect: () => void;
  currentTrackUrl: string;
}) => {
  const containsCurrentTrack = playlist.tracks.some((track) => track.url === currentTrackUrl);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-3xl border text-left transition-all duration-200",
        "bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 hover:border-white/15 hover:bg-neutral-900/90",
        isActive
          ? "border-white/20 shadow-[0_24px_48px_-28px_rgba(255,255,255,0.14)]"
          : "border-white/8 shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]"
      )}
    >
      <div className="flex items-start gap-4 p-4">
        <PlaylistArtwork playlist={playlist} />

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.18em] text-neutral-400"
            >
              {getPlaylistAccentLabel(playlist)}
            </Badge>
            {containsCurrentTrack ? (
              <Badge className="bg-white text-black text-[10px] uppercase tracking-[0.16em]">Current Track</Badge>
            ) : null}
          </div>

          <div className="mt-3 text-sm font-semibold text-white">{playlist.name}</div>
          <div className="mt-1 text-xs leading-relaxed text-neutral-400">
            {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
          </div>

          <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            <Rows3 className="size-3.5" />
            <span>{playlist.origin === "server" ? "Server playlist" : "Built from imported tracks"}</span>
          </div>
        </div>
      </div>
    </button>
  );
};

const PlaylistTrackRow = ({
  track,
  isActive,
  canMutate,
  isPlaying,
  onPlay,
}: {
  track: PlaylistTrack;
  isActive: boolean;
  canMutate: boolean;
  isPlaying: boolean;
  onPlay: () => void;
}) => {
  const isPlayable = canMutate && track.queueIndex >= 0;

  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={!isPlayable}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
        "border-white/6 bg-white/[0.02]",
        canMutate ? "hover:border-white/14 hover:bg-white/[0.04]" : "cursor-default opacity-90",
        isActive ? "border-white/18 bg-white/[0.05]" : null
      )}
    >
      <div
        className={cn(
          "flex size-9 flex-shrink-0 items-center justify-center rounded-xl border text-xs font-medium",
          isActive ? "border-white/20 bg-white text-black" : "border-white/10 bg-neutral-900 text-neutral-400"
        )}
      >
        {isActive && isPlaying ? <Radio className="size-4" /> : track.position}
      </div>

      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium", isActive ? "text-white" : "text-neutral-200")}>
          {track.title}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
          {track.queueIndex >= 0 ? `Queue slot ${track.queueIndex + 1}` : "Library only"}
        </div>
      </div>

      {isPlayable ? (
        <div className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-neutral-300">
          <Play className="size-3.5 fill-current" />
        </div>
      ) : null}
    </button>
  );
};

export const PlaylistLibrary = ({ className }: { className?: string }) => {
  const playlists = useGlobalStore((state) => state.playlists);
  const playlistLibraryOrigin = useGlobalStore((state) => state.playlistLibraryOrigin);
  const selectedPlaylist = useGlobalStore((state) => state.getSelectedPlaylist());
  const selectedPlaylistId = useGlobalStore((state) => state.selectedPlaylistId);
  const setSelectedPlaylistId = useGlobalStore((state) => state.setSelectedPlaylistId);
  const audioSources = useGlobalStore((state) => state.audioSources);
  const selectedAudioUrl = useGlobalStore((state) => state.selectedAudioUrl);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const changeAudioSource = useGlobalStore((state) => state.changeAudioSource);
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const broadcastPause = useGlobalStore((state) => state.broadcastPause);
  const activeStreamJobs = useGlobalStore((state) => state.activeStreamJobs);
  const socket = useGlobalStore((state) => state.socket);
  const canMutate = useCanMutate();
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);

  const visiblePlaylist = selectedPlaylist ?? playlists[0] ?? null;
  const firstPlayableTrack = visiblePlaylist?.tracks.find((track) => track.queueIndex >= 0) ?? null;
  const hasLibraryOnlyTracks = visiblePlaylist?.tracks.some((track) => track.queueIndex < 0) ?? false;
  const canEditVisiblePlaylist = canMutate && visiblePlaylist?.origin === "server";

  const editorTracks = useMemo<PlaylistEditorTrack[]>(() => {
    const trackMap = new Map<string, PlaylistEditorTrack>();

    audioSources.forEach((sourceState, index) => {
      trackMap.set(sourceState.source.url, {
        url: sourceState.source.url,
        title: sourceState.source.title?.trim() || sourceState.source.url.split("/").pop() || "Untitled Track",
        artworkUrl: sourceState.source.artworkUrl ?? getAudioSourceArtworkUrl(sourceState.source),
        availabilityLabel: `Live queue ${index + 1}`,
        queueIndex: index,
      });
    });

    if (editorMode === "edit" && visiblePlaylist) {
      visiblePlaylist.tracks.forEach((track) => {
        if (trackMap.has(track.url)) {
          return;
        }

        trackMap.set(track.url, {
          url: track.url,
          title: track.title,
          artworkUrl: track.artworkUrl ?? getAudioSourceArtworkUrl(track.source),
          availabilityLabel: "Saved in this playlist",
          queueIndex: Number.MAX_SAFE_INTEGER,
        });
      });
    }

    return [...trackMap.values()].sort((left, right) => {
      if (left.queueIndex !== right.queueIndex) {
        return left.queueIndex - right.queueIndex;
      }

      return left.title.localeCompare(right.title);
    });
  }, [audioSources, editorMode, visiblePlaylist]);

  const ensureMutationAccess = () => {
    if (!canMutate) {
      toast.error("Only admins can manage playlists");
      return false;
    }

    if (!socket) {
      toast.error("WebSocket not connected");
      return false;
    }

    return true;
  };

  const handleTrackSelect = (track: PlaylistTrack) => {
    if (!canMutate || track.queueIndex < 0) {
      return;
    }

    if (selectedAudioUrl === track.url) {
      if (isPlaying) {
        broadcastPause();
      } else {
        broadcastPlay();
      }
      return;
    }

    changeAudioSource(track.url);
    broadcastPlay(0);
  };

  const handlePlayPlaylist = () => {
    if (!firstPlayableTrack || !canMutate) {
      return;
    }

    changeAudioSource(firstPlayableTrack.url);
    broadcastPlay(0);
  };

  const handleQueuePlaylist = () => {
    if (!canMutate || !visiblePlaylist || !socket) {
      return;
    }

    sendWSRequest({
      ws: socket,
      request: {
        type: ClientActionEnum.enum.QUEUE_PLAYLIST,
        playlistId: visiblePlaylist.id,
      },
    });
  };

  const handleCreatePlaylist = ({ name, trackUrls }: { name: string; trackUrls: string[] }) => {
    if (!ensureMutationAccess()) {
      return;
    }

    const playlistId = globalThis.crypto?.randomUUID?.() ?? `playlist-${Date.now()}`;

    sendWSRequest({
      ws: socket!,
      request: {
        type: ClientActionEnum.enum.CREATE_PLAYLIST,
        playlistId,
        name,
        trackUrls,
      },
    });

    setSelectedPlaylistId(playlistId);
    setEditorMode(null);
    toast.success(`Created "${name}"`);
  };

  const handleUpdatePlaylist = ({ name, trackUrls }: { name: string; trackUrls: string[] }) => {
    if (!visiblePlaylist || !ensureMutationAccess()) {
      return;
    }

    const trimmedName = name.trim();
    const currentTrackUrls = visiblePlaylist.tracks.map((track) => track.url);
    const nameChanged = trimmedName !== visiblePlaylist.name;
    const tracksChanged =
      currentTrackUrls.length !== trackUrls.length || currentTrackUrls.some((url, index) => url !== trackUrls[index]);

    if (!nameChanged && !tracksChanged) {
      setEditorMode(null);
      return;
    }

    if (nameChanged) {
      sendWSRequest({
        ws: socket!,
        request: {
          type: ClientActionEnum.enum.UPDATE_PLAYLIST,
          playlistId: visiblePlaylist.id,
          name: trimmedName,
        },
      });
    }

    if (tracksChanged) {
      sendWSRequest({
        ws: socket!,
        request: {
          type: ClientActionEnum.enum.SET_PLAYLIST_TRACKS,
          playlistId: visiblePlaylist.id,
          trackUrls,
        },
      });
    }

    setEditorMode(null);
    toast.success(`Updated "${trimmedName}"`);
  };

  const handleDeletePlaylist = () => {
    if (!visiblePlaylist || !ensureMutationAccess()) {
      return;
    }

    sendWSRequest({
      ws: socket!,
      request: {
        type: ClientActionEnum.enum.DELETE_PLAYLIST,
        playlistId: visiblePlaylist.id,
      },
    });

    setEditorMode(null);
    toast.success(`Deleted "${visiblePlaylist.name}"`);
  };

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Library</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Playlists</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canMutate ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditorMode("create")}
              className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
            >
              <Plus className="size-4" />
              New Playlist
            </Button>
          ) : null}
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-300">
            <ListMusic className="size-3.5" />
            {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}
          </Badge>
          {playlistLibraryOrigin ? (
            <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-400">
              {playlistLibraryOrigin === "server" ? "Server-backed" : "Auto-grouped"}
            </Badge>
          ) : null}
        </div>
      </div>

      {playlists.length === 0 ? (
        <Card className="border-white/8 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 py-0 shadow-[0_28px_80px_-42px_rgba(0,0,0,0.9)]">
          <CardContent className="px-5 py-5">
            <div className="flex items-start gap-4">
              <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <WandSparkles className="size-5 text-neutral-300" />
              </div>

              <div className="min-w-0">
                <div className="text-sm font-medium text-white">No playlists yet</div>
                <div className="mt-1 text-sm leading-relaxed text-neutral-400">
                  {activeStreamJobs > 0
                    ? "Playlist views will appear as soon as the current import finishes."
                    : canMutate
                      ? "Create a playlist from the current queue, or import a YouTube playlist to populate the library."
                      : "Playlists will appear here when an admin creates one or imports a YouTube playlist."}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {playlists.map((playlist) => (
              <motion.div key={playlist.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <PlaylistCard
                  playlist={playlist}
                  isActive={playlist.id === (selectedPlaylistId ?? visiblePlaylist?.id)}
                  currentTrackUrl={selectedAudioUrl}
                  onSelect={() => setSelectedPlaylistId(playlist.id)}
                />
              </motion.div>
            ))}
          </div>

          {visiblePlaylist ? (
            <Card className="overflow-hidden border-white/8 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 py-0 shadow-[0_28px_80px_-42px_rgba(0,0,0,0.9)]">
              <CardContent className="px-0 py-0">
                <div className="border-b border-white/6 px-5 py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <PlaylistArtwork playlist={visiblePlaylist} />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-400">
                            {getPlaylistAccentLabel(visiblePlaylist)}
                          </Badge>
                          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-400">
                            {visiblePlaylist.trackCount} tracks
                          </Badge>
                        </div>

                        <div className="mt-3 text-xl font-semibold text-white">{visiblePlaylist.name}</div>
                        <div className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
                          {visiblePlaylist.description ??
                            "This playlist is available as a first-class library object. The queue below remains the live playback order for the room."}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {canEditVisiblePlaylist ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditorMode("edit")}
                          className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
                        >
                          <PencilLine className="size-4" />
                          Edit Playlist
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleQueuePlaylist}
                        disabled={!canMutate || !visiblePlaylist || !hasLibraryOnlyTracks}
                        className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
                      >
                        <ListMusic className="size-4" />
                        {hasLibraryOnlyTracks ? "Add Playlist To Queue" : "Already In Queue"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePlayPlaylist}
                        disabled={!canMutate || !firstPlayableTrack}
                        className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
                      >
                        <Play className="size-4 fill-current" />
                        {firstPlayableTrack ? "Play First Queued Track" : "Inspect Playlist"}
                      </Button>
                    </div>
                  </div>
                </div>

                {visiblePlaylist.tracks.length > 0 ? (
                  <div className="space-y-2 px-4 py-4">
                    {visiblePlaylist.tracks.map((track) => (
                      <PlaylistTrackRow
                        key={`${visiblePlaylist.id}:${track.url}`}
                        track={track}
                        canMutate={canMutate}
                        isActive={selectedAudioUrl === track.url}
                        isPlaying={isPlaying}
                        onPlay={() => handleTrackSelect(track)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-sm text-neutral-400">
                    This playlist is empty.{" "}
                    {canEditVisiblePlaylist
                      ? "Use Edit Playlist to add tracks."
                      : "Add tracks from the queue to start using it."}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {editorMode ? (
        <PlaylistEditorDialog
          open
          mode={editorMode}
          availableTracks={editorTracks}
          initialName={editorMode === "edit" && visiblePlaylist ? visiblePlaylist.name : ""}
          initialTrackUrls={
            editorMode === "edit" && visiblePlaylist ? visiblePlaylist.tracks.map((track) => track.url) : []
          }
          onOpenChange={(open) => {
            if (!open) {
              setEditorMode(null);
            }
          }}
          onSave={editorMode === "edit" ? handleUpdatePlaylist : handleCreatePlaylist}
          onDelete={editorMode === "edit" && canEditVisiblePlaylist ? handleDeletePlaylist : undefined}
        />
      ) : null}
    </section>
  );
};
