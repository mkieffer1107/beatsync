"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAudioSourceArtworkUrl,
  getAudioSourceCollectionLabel,
  getAudioSourceDisplayTitle,
} from "@/lib/audioSourceDisplay";
import { useResolvedAudioDuration } from "@/hooks/useResolvedAudioDuration";
import { PlaylistLibraryItem, PlaylistTrack } from "@/lib/playlistLibrary";
import { cn, formatTime } from "@/lib/utils";
import { type PlaybackContext, useCanMutate, useGlobalStore } from "@/store/global";
import { sendWSRequest } from "@/utils/ws";
import { ClientActionEnum } from "@beatsync/shared";
import {
  Disc3,
  ListMusic,
  Pause,
  PencilLine,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Rows3,
  Shuffle,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { PlaylistEditorDialog, type PlaylistEditorTrack } from "./PlaylistEditorDialog";

interface LibraryTrackItem {
  url: string;
  source: PlaylistTrack["source"];
  title: string;
  artworkUrl: string | null;
  queueIndex: number;
  playlistIds: string[];
  playlistNames: string[];
}

interface PendingQueuedPlayback {
  targetUrl: string;
}

const getPlaylistAccentLabel = (playlist: PlaylistLibraryItem) => {
  if (playlist.sourceKind === "youtube-playlist" || playlist.sourceKind === "youtube") {
    return "YouTube";
  }

  if (playlist.origin === "server") {
    return "Playlist";
  }

  return "Collection";
};

const getTrackMetaLabel = (track: LibraryTrackItem) => {
  const parts: string[] = [track.queueIndex >= 0 ? `Live queue ${track.queueIndex + 1}` : "Saved in playlist"];

  if (track.playlistNames.length === 1) {
    parts.push(track.playlistNames[0]);
  } else if (track.playlistNames.length > 1) {
    parts.push(`${track.playlistNames.length} playlists`);
  } else {
    const collectionLabel = getAudioSourceCollectionLabel(track.source);
    if (collectionLabel && collectionLabel !== track.title) {
      parts.push(collectionLabel);
    }
  }

  return parts.join(" • ");
};

const pickRandomTrackUrl = (urls: string[]) => urls[Math.floor(Math.random() * urls.length)] ?? urls[0] ?? null;

const getPlaybackButtonClassName = (isActive: boolean) =>
  cn(
    "border-white/10 transition-colors",
    isActive ? "bg-white text-neutral-950 hover:bg-white/90" : "bg-white/[0.03] text-white hover:bg-white/[0.08]"
  );

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

const PlaylistNavItem = ({
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
        "group w-full rounded-2xl border px-3.5 py-3 text-left transition-all duration-200",
        isActive
          ? "border-white/18 bg-white/[0.06] shadow-[0_24px_48px_-34px_rgba(255,255,255,0.16)]"
          : "border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="scale-[0.84] origin-top-left">
          <PlaylistArtwork playlist={playlist} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.18em] text-neutral-400"
            >
              {getPlaylistAccentLabel(playlist)}
            </Badge>
            {containsCurrentTrack ? (
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary-400">Current</span>
            ) : null}
          </div>

          <div className="mt-2 truncate text-sm font-medium text-white">{playlist.name}</div>
          <div className="mt-1 text-xs text-neutral-500">
            {playlist.trackCount} {playlist.trackCount === 1 ? "track" : "tracks"}
          </div>

          <div className="mt-2 truncate text-[11px] uppercase tracking-[0.16em] text-neutral-600">
            {playlist.origin === "server" ? "Server playlist" : "Built from imported tracks"}
          </div>
        </div>
      </div>
    </button>
  );
};

const PlaylistTrackArtwork = ({ src, alt }: { src: string | null; alt: string }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasError = failedSrc === src;

  if (!src || hasError) {
    return (
      <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-md border border-neutral-800/80 bg-neutral-900/70">
        <Disc3 className="size-4 text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="size-10 flex-shrink-0 overflow-hidden rounded-md border border-neutral-800/80 bg-neutral-900/70">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
    </div>
  );
};

const TrackListRow = ({
  artworkUrl,
  title,
  metaLabel,
  source,
  rowNumber,
  isActive,
  canMutate,
  isPlaying,
  onPlay,
  onDelete,
}: {
  artworkUrl: string | null;
  title: string;
  metaLabel: string;
  source: PlaylistTrack["source"];
  rowNumber: number;
  isActive: boolean;
  canMutate: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onDelete?: () => void;
}) => {
  const duration = useResolvedAudioDuration(source);
  const isPlayable = canMutate;

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-4 py-3.5 transition-colors",
        isPlayable ? "hover:bg-white/[0.03]" : null,
        isActive ? "bg-white/[0.05]" : null
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (isPlayable) {
            onPlay();
          }
        }}
        aria-disabled={!isPlayable}
        className={cn("flex min-w-0 flex-1 items-center gap-3 text-left", isPlayable ? "cursor-pointer" : "cursor-default")}
      >
        <div className="relative flex h-6 w-8 flex-shrink-0 items-center justify-center text-sm font-medium">
          {isPlayable ? (
            <>
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                {isActive && isPlaying ? (
                  <Pause className="size-3.5 fill-current text-white" />
                ) : (
                  <Play className="size-3.5 fill-current text-white" />
                )}
              </span>
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0",
                  isActive ? "text-primary-400" : "text-neutral-500"
                )}
              >
                {isActive && isPlaying ? <Radio className="size-4" /> : rowNumber}
              </span>
            </>
          ) : (
            <span className="text-neutral-500">{rowNumber}</span>
          )}
        </div>

        <PlaylistTrackArtwork src={artworkUrl} alt={title} />

        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-sm font-medium", isActive ? "text-primary-400" : "text-neutral-200")}>
            {title}
          </div>
          <div className="mt-0.5 truncate text-[11px] uppercase tracking-[0.14em] text-neutral-500">{metaLabel}</div>
        </div>

        <div
          className={cn("min-w-[3.25rem] text-right text-xs", duration > 0 ? "text-neutral-500" : "text-neutral-700")}
        >
          {duration > 0 ? formatTime(duration) : "--:--"}
        </div>
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="flex size-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-neutral-500 transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
          aria-label={`Delete ${title}`}
          title={`Delete ${title}`}
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
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
  const playbackContext = useGlobalStore((state) => state.playbackContext);
  const isShuffled = useGlobalStore((state) => state.isShuffled);
  const setPlaybackContext = useGlobalStore((state) => state.setPlaybackContext);
  const setShuffleEnabled = useGlobalStore((state) => state.setShuffleEnabled);
  const activeStreamJobs = useGlobalStore((state) => state.activeStreamJobs);
  const socket = useGlobalStore((state) => state.socket);
  const canMutate = useCanMutate();
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [libraryView, setLibraryView] = useState<"all" | "playlist">("all");
  const [confirmDeletePlaylistId, setConfirmDeletePlaylistId] = useState<string | null>(null);
  const [pendingQueuedPlayback, setPendingQueuedPlayback] = useState<PendingQueuedPlayback | null>(null);

  const visiblePlaylist = selectedPlaylist ?? playlists[0] ?? null;
  const activePlaylistId = selectedPlaylistId ?? visiblePlaylist?.id ?? null;
  const hasLibraryOnlyTracks = visiblePlaylist?.tracks.some((track) => track.queueIndex < 0) ?? false;
  const canEditVisiblePlaylist = canMutate && visiblePlaylist?.origin === "server";
  const canRefreshVisiblePlaylist =
    canMutate &&
    visiblePlaylist?.origin === "server" &&
    visiblePlaylist?.sourceKind === "youtube" &&
    Boolean(visiblePlaylist.originalUrl || visiblePlaylist.externalId);

  const libraryTracks = useMemo<LibraryTrackItem[]>(() => {
    const trackMap = new Map<string, LibraryTrackItem>();

    audioSources.forEach((sourceState, index) => {
      const source = sourceState.source;
      trackMap.set(source.url, {
        url: source.url,
        source,
        title: getAudioSourceDisplayTitle(source),
        artworkUrl: getAudioSourceArtworkUrl(source),
        queueIndex: index,
        playlistIds: [],
        playlistNames: [],
      });
    });

    playlists.forEach((playlist) => {
      playlist.tracks.forEach((track) => {
        const existing = trackMap.get(track.url);
        if (existing) {
          if (!existing.playlistIds.includes(playlist.id)) {
            existing.playlistIds.push(playlist.id);
            existing.playlistNames.push(playlist.name);
          }
          return;
        }

        trackMap.set(track.url, {
          url: track.url,
          source: track.source,
          title: track.title,
          artworkUrl: track.artworkUrl ?? getAudioSourceArtworkUrl(track.source),
          queueIndex: track.queueIndex,
          playlistIds: [playlist.id],
          playlistNames: [playlist.name],
        });
      });
    });

    return [...trackMap.values()];
  }, [audioSources, playlists]);

  const savedOnlyTrackCount = libraryTracks.filter((track) => track.queueIndex < 0).length;
  const libraryTrackUrls = useMemo(() => libraryTracks.map((track) => track.url), [libraryTracks]);
  const visiblePlaylistTrackUrls = useMemo(
    () => visiblePlaylist?.tracks.map((track) => track.url) ?? [],
    [visiblePlaylist]
  );
  const queuedTrackUrls = useMemo(() => audioSources.map((sourceState) => sourceState.source.url), [audioSources]);
  const queuedTrackUrlSet = useMemo(() => new Set(queuedTrackUrls), [queuedTrackUrls]);
  const isAllTracksContextActive = playbackContext?.scope === "all-tracks";
  const isVisiblePlaylistContextActive =
    playbackContext?.scope === "playlist" && playbackContext.playlistId === visiblePlaylist?.id;

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

  useEffect(() => {
    if (!pendingQueuedPlayback) {
      return;
    }

    if (!queuedTrackUrlSet.has(pendingQueuedPlayback.targetUrl)) {
      return;
    }

    const { targetUrl } = pendingQueuedPlayback;
    queueMicrotask(() => {
      setPendingQueuedPlayback(null);
      changeAudioSource(targetUrl);
      broadcastPlay(0);
    });
  }, [broadcastPlay, changeAudioSource, pendingQueuedPlayback, queuedTrackUrlSet]);

  const queueMissingTrackUrls = (urls: string[]) => {
    const missingUrls = [...new Set(urls)].filter((url) => !queuedTrackUrlSet.has(url));
    if (missingUrls.length === 0) {
      return missingUrls;
    }

    sendWSRequest({
      ws: socket!,
      request: {
        type: ClientActionEnum.enum.QUEUE_TRACKS,
        urls: missingUrls,
      },
    });

    return missingUrls;
  };

  const startContextPlayback = ({
    context,
    targetUrl,
    queueUrls,
    shuffle,
  }: {
    context: PlaybackContext;
    targetUrl: string;
    queueUrls: string[];
    shuffle: boolean;
  }) => {
    setPlaybackContext(context);
    setShuffleEnabled(shuffle);

    const missingUrls = queueMissingTrackUrls(queueUrls);
    if (missingUrls.length > 0) {
      if (!queuedTrackUrlSet.has(targetUrl)) {
        setPendingQueuedPlayback({
          targetUrl,
        });
        return;
      }
    }

    setPendingQueuedPlayback(null);
    changeAudioSource(targetUrl);
    broadcastPlay(0);
  };

  const handleScopedTrackSelect = ({
    trackUrl,
    context,
    queueUrls,
  }: {
    trackUrl: string;
    context: PlaybackContext;
    queueUrls: string[];
  }) => {
    if (!ensureMutationAccess()) {
      return;
    }

    setPlaybackContext(context);
    setShuffleEnabled(false);

    if (selectedAudioUrl === trackUrl) {
      queueMissingTrackUrls(queueUrls);
      setPendingQueuedPlayback(null);
      if (isPlaying) {
        broadcastPause();
      } else {
        broadcastPlay();
      }
      return;
    }

    startContextPlayback({
      context,
      targetUrl: trackUrl,
      queueUrls,
      shuffle: false,
    });
  };

  const handlePlayAllTracks = (shuffle: boolean) => {
    if (!ensureMutationAccess() || libraryTrackUrls.length === 0) {
      return;
    }

    const context: PlaybackContext = {
      scope: "all-tracks",
      urls: libraryTrackUrls,
    };

    startContextPlayback({
      context,
      targetUrl: shuffle ? pickRandomTrackUrl(libraryTrackUrls)! : libraryTrackUrls[0]!,
      queueUrls: libraryTrackUrls,
      shuffle,
    });
  };

  const handlePlayPlaylist = (shuffle: boolean) => {
    if (!ensureMutationAccess() || !visiblePlaylist || visiblePlaylistTrackUrls.length === 0) {
      return;
    }

    const context: PlaybackContext = {
      scope: "playlist",
      playlistId: visiblePlaylist.id,
      urls: visiblePlaylistTrackUrls,
    };

    startContextPlayback({
      context,
      targetUrl: shuffle ? pickRandomTrackUrl(visiblePlaylistTrackUrls)! : visiblePlaylistTrackUrls[0]!,
      queueUrls: visiblePlaylistTrackUrls,
      shuffle,
    });
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
    setLibraryView("playlist");
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

  const handleDeleteTrack = (track: LibraryTrackItem | PlaylistTrack) => {
    if (!ensureMutationAccess()) {
      return;
    }

    const affectedPlaylists = playlists.filter((playlist) => playlist.tracks.some((playlistTrack) => playlistTrack.url === track.url));

    affectedPlaylists.forEach((playlist) => {
      sendWSRequest({
        ws: socket!,
        request: {
          type: ClientActionEnum.enum.SET_PLAYLIST_TRACKS,
          playlistId: playlist.id,
          trackUrls: playlist.tracks.filter((playlistTrack) => playlistTrack.url !== track.url).map((playlistTrack) => playlistTrack.url),
        },
      });
    });

    if (track.queueIndex >= 0) {
      sendWSRequest({
        ws: socket!,
        request: {
          type: ClientActionEnum.enum.DELETE_AUDIO_SOURCES,
          urls: [track.url],
        },
      });
    }

    setConfirmDeletePlaylistId(null);
    toast.success(`Deleted "${"title" in track ? track.title : "track"}"`);
  };

  const handleRefreshPlaylist = () => {
    if (!visiblePlaylist || !ensureMutationAccess()) {
      return;
    }

    sendWSRequest({
      ws: socket!,
      request: {
        type: ClientActionEnum.enum.REFRESH_PLAYLIST,
        playlistId: visiblePlaylist.id,
      },
    });
  };

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-end gap-2">
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
            <Rows3 className="size-3.5" />
            {libraryTracks.length} {libraryTracks.length === 1 ? "track" : "tracks"}
          </Badge>
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

      <div className="overflow-hidden rounded-[1.75rem] border border-white/8 bg-gradient-to-b from-neutral-950 via-neutral-950 to-black/90 shadow-[0_28px_80px_-42px_rgba(0,0,0,0.92)]">
        <div className="border-b border-white/6 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex w-full rounded-2xl border border-white/8 bg-black/30 p-1 sm:w-auto">
              {[
                { value: "all" as const, label: "All Tracks", count: libraryTracks.length },
                { value: "playlist" as const, label: "Playlists", count: playlists.length },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLibraryView(option.value);
                    if (option.value === "playlist" && !activePlaylistId && playlists[0]) {
                      setSelectedPlaylistId(playlists[0].id);
                    }
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-200 sm:flex-none",
                    libraryView === option.value
                      ? "bg-white text-neutral-950 shadow-[0_16px_32px_-24px_rgba(255,255,255,0.6)]"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      libraryView === option.value ? "bg-black/10 text-neutral-800" : "bg-white/[0.05] text-neutral-500"
                    )}
                  >
                    {option.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="text-xs text-neutral-500">
              {libraryView === "all"
                ? "Default view for the full downloaded room library."
                : "Choose a playlist to inspect, edit, or push back into the queue."}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {libraryView === "all" ? (
            <motion.div
              key="all"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="border-b border-white/6 px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-300">
                        All Tracks
                      </Badge>
                      {savedOnlyTrackCount > 0 ? (
                        <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-400">
                          {savedOnlyTrackCount} playlist-only
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-3 text-xl font-semibold text-white">Room Library</div>
                    <div className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
                      {savedOnlyTrackCount > 0
                        ? "Every downloaded track in this room, including tracks that are only stored inside saved playlists."
                        : "Every downloaded track currently available in this room."}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {libraryTrackUrls.length > 0 && canMutate ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePlayAllTracks(false)}
                          className={getPlaybackButtonClassName(isAllTracksContextActive && !isShuffled)}
                        >
                          <Play className="size-4 fill-current" />
                          Play All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePlayAllTracks(true)}
                          className={getPlaybackButtonClassName(isAllTracksContextActive && isShuffled)}
                        >
                          <Shuffle className="size-4" />
                          Shuffle
                        </Button>
                      </>
                    ) : null}
                    <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-300">
                      {audioSources.length} in queue
                    </Badge>
                    {savedOnlyTrackCount > 0 ? (
                      <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-400">
                        {savedOnlyTrackCount} saved only
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              {libraryTracks.length > 0 ? (
                <div className="divide-y divide-white/6">
                  {libraryTracks.map((track, index) => (
                    <TrackListRow
                      key={`library:${track.url}`}
                      artworkUrl={track.artworkUrl}
                      title={track.title}
                      metaLabel={getTrackMetaLabel(track)}
                      source={track.source}
                      rowNumber={index + 1}
                      canMutate={canMutate}
                      isActive={selectedAudioUrl === track.url}
                      isPlaying={isPlaying}
                      onPlay={() => {
                        const trackIndex = libraryTrackUrls.indexOf(track.url);
                        if (trackIndex < 0) {
                          return;
                        }

                        handleScopedTrackSelect({
                          trackUrl: track.url,
                          context: {
                            scope: "all-tracks",
                            urls: libraryTrackUrls,
                          },
                          queueUrls: libraryTrackUrls.slice(trackIndex),
                        });
                      }}
                      onDelete={canMutate ? () => handleDeleteTrack(track) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8">
                  <div className="flex items-start gap-4 rounded-3xl border border-white/8 bg-white/[0.02] px-5 py-5">
                    <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                      <WandSparkles className="size-5 text-neutral-300" />
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">No tracks in the room library yet</div>
                      <div className="mt-1 text-sm leading-relaxed text-neutral-400">
                        {activeStreamJobs > 0
                          ? "The library will fill in as soon as the current import finishes."
                          : canMutate
                            ? "Upload or import music first, then use playlists to save a curated subset."
                            : "Tracks will appear here when an admin uploads or imports music."}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="playlist"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid xl:grid-cols-[19rem_minmax(0,1fr)]"
            >
              <div className="border-b border-white/6 xl:border-r xl:border-b-0">
                <div className="px-5 py-5">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Playlists</div>
                  <div className="mt-2 text-sm leading-relaxed text-neutral-400">
                    Saved views of the room library. Choose one to inspect its track order or queue it again.
                  </div>
                </div>

                {playlists.length > 0 ? (
                  <div className="space-y-2 p-3">
                    {playlists.map((playlist) => (
                      <motion.div key={playlist.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <PlaylistNavItem
                          playlist={playlist}
                          isActive={playlist.id === activePlaylistId}
                          currentTrackUrl={selectedAudioUrl}
                          onSelect={() => {
                            setSelectedPlaylistId(playlist.id);
                            setLibraryView("playlist");
                          }}
                        />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 pb-5">
                    <div className="rounded-3xl border border-white/8 bg-white/[0.02] px-4 py-5 text-sm text-neutral-400">
                      {activeStreamJobs > 0
                        ? "Playlist views will appear as soon as the current import finishes."
                        : canMutate
                          ? "Create a playlist when you want a saved subset of the room library."
                          : "Playlists will appear here when an admin creates one or imports a YouTube playlist."}
                    </div>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                {visiblePlaylist ? (
                  <>
                    <div className="border-b border-white/6 px-5 py-5">
                      <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                        <div className="flex items-start gap-4">
                          <PlaylistArtwork playlist={visiblePlaylist} />

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-300">
                                {getPlaylistAccentLabel(visiblePlaylist)}
                              </Badge>
                              <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-400">
                                {visiblePlaylist.trackCount} tracks
                              </Badge>
                              {hasLibraryOnlyTracks ? (
                                <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-400">
                                  Saved outside queue
                                </Badge>
                              ) : null}
                            </div>

                            <div className="mt-3 text-xl font-semibold text-white">{visiblePlaylist.name}</div>
                            <div className="mt-1 max-w-3xl text-sm leading-relaxed text-neutral-400">
                              {visiblePlaylist.description ??
                                "This playlist isolates a saved subset of the room library without replacing the live queue."}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {canRefreshVisiblePlaylist ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRefreshPlaylist}
                              className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
                            >
                              <RefreshCw className="size-4" />
                              Refresh From YouTube
                            </Button>
                          ) : null}
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
                          {canMutate ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirmDeletePlaylistId === visiblePlaylist.id) {
                                  handleDeletePlaylist();
                                  return;
                                }
                                setConfirmDeletePlaylistId(visiblePlaylist.id);
                              }}
                            className={cn(
                              "border-white/10 text-white hover:bg-white/[0.08]",
                              confirmDeletePlaylistId === visiblePlaylist.id ? "bg-red-500/10 hover:bg-red-500/15" : "bg-white/[0.03]"
                            )}
                          >
                              <Trash2 className="size-4" />
                              {confirmDeletePlaylistId === visiblePlaylist.id ? "Confirm Delete Playlist" : "Delete Playlist"}
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
                            onClick={() => handlePlayPlaylist(true)}
                            disabled={!canMutate || visiblePlaylistTrackUrls.length === 0}
                            className={getPlaybackButtonClassName(isVisiblePlaylistContextActive && isShuffled)}
                          >
                            <Shuffle className="size-4" />
                            Shuffle Playlist
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePlayPlaylist(false)}
                            disabled={!canMutate || visiblePlaylistTrackUrls.length === 0}
                            className={getPlaybackButtonClassName(isVisiblePlaylistContextActive && !isShuffled)}
                          >
                            <Play className="size-4 fill-current" />
                            Play Playlist
                          </Button>
                        </div>
                      </div>
                    </div>

                    {visiblePlaylist.tracks.length > 0 ? (
                      <div className="divide-y divide-white/6">
                        {visiblePlaylist.tracks.map((track) => (
                          <TrackListRow
                            key={`${visiblePlaylist.id}:${track.url}`}
                            artworkUrl={track.artworkUrl ?? getAudioSourceArtworkUrl(track.source)}
                            title={track.title}
                            metaLabel={track.queueIndex >= 0 ? `Queue slot ${track.queueIndex + 1}` : "Saved only in playlist"}
                            source={track.source}
                            rowNumber={track.position}
                            canMutate={canMutate}
                            isActive={selectedAudioUrl === track.url}
                            isPlaying={isPlaying}
                            onPlay={() => {
                              const trackIndex = visiblePlaylistTrackUrls.indexOf(track.url);
                              if (trackIndex < 0 || !visiblePlaylist) {
                                return;
                              }

                              handleScopedTrackSelect({
                                trackUrl: track.url,
                                context: {
                                  scope: "playlist",
                                  playlistId: visiblePlaylist.id,
                                  urls: visiblePlaylistTrackUrls,
                                },
                                queueUrls: visiblePlaylistTrackUrls.slice(trackIndex),
                              });
                            }}
                            onDelete={canMutate ? () => handleDeleteTrack(track) : undefined}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-5 py-8 text-sm leading-relaxed text-neutral-400">
                        This playlist is empty.{" "}
                        {canEditVisiblePlaylist
                          ? "Use Edit Playlist to add tracks."
                          : "Add tracks from the queue to start using it."}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-5 py-8 text-sm leading-relaxed text-neutral-400">
                    Choose a playlist to inspect its saved tracks.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
