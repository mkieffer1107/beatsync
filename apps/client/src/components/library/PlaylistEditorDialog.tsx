"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check, Disc3, ListMusic, Plus, Trash2 } from "lucide-react";

export interface PlaylistEditorTrack {
  url: string;
  title: string;
  artworkUrl: string | null;
  availabilityLabel: string;
  queueIndex: number;
}

interface PlaylistEditorDialogProps {
  open: boolean;
  mode: "create" | "edit";
  availableTracks: PlaylistEditorTrack[];
  initialName: string;
  initialTrackUrls: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { name: string; trackUrls: string[] }) => void;
  onDelete?: () => void;
}

const ArtworkThumb = ({ title, artworkUrl }: { title: string; artworkUrl: string | null }) => {
  if (artworkUrl) {
    return (
      <div className="relative size-10 overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artworkUrl} alt={title} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-neutral-900 text-neutral-400">
      <Disc3 className="size-4" />
    </div>
  );
};

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const PlaylistEditorDialog = ({
  open,
  mode,
  availableTracks,
  initialName,
  initialTrackUrls,
  onOpenChange,
  onSave,
  onDelete,
}: PlaylistEditorDialogProps) => {
  const [name, setName] = useState(initialName);
  const [selectedTrackUrls, setSelectedTrackUrls] = useState<string[]>(initialTrackUrls);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const trackByUrl = useMemo(() => new Map(availableTracks.map((track) => [track.url, track])), [availableTracks]);
  const selectedTracks = useMemo(
    () =>
      selectedTrackUrls
        .map((url) => trackByUrl.get(url))
        .filter((track): track is PlaylistEditorTrack => Boolean(track)),
    [selectedTrackUrls, trackByUrl]
  );
  const trimmedName = name.trim();
  const isDirty = trimmedName !== initialName.trim() || !arraysEqual(selectedTrackUrls, initialTrackUrls);

  const handleToggleTrack = (url: string) => {
    setSelectedTrackUrls((currentTrackUrls) =>
      currentTrackUrls.includes(url)
        ? currentTrackUrls.filter((currentUrl) => currentUrl !== url)
        : [...currentTrackUrls, url]
    );
  };

  const moveTrack = (url: string, direction: -1 | 1) => {
    setSelectedTrackUrls((currentTrackUrls) => {
      const index = currentTrackUrls.indexOf(url);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= currentTrackUrls.length) {
        return currentTrackUrls;
      }

      const nextTrackUrls = [...currentTrackUrls];
      [nextTrackUrls[index], nextTrackUrls[nextIndex]] = [nextTrackUrls[nextIndex], nextTrackUrls[index]];
      return nextTrackUrls;
    });
  };

  const handleSubmit = () => {
    if (!trimmedName) {
      return;
    }

    onSave({
      name: trimmedName,
      trackUrls: selectedTrackUrls,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-2xl border border-neutral-800/70 bg-neutral-900/90 p-0 shadow-[0_32px_120px_-48px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2 text-base font-medium text-white">
            <ListMusic className="size-4 text-neutral-300" />
            {mode === "create" ? "Create Playlist" : "Edit Playlist"}
          </DialogTitle>
          <DialogDescription className="text-left text-sm text-neutral-400">
            {mode === "create"
              ? "Build a first-class playlist from the current room queue."
              : "Rename the playlist, adjust its track list, and control the stored order."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6">
          <div className="grid gap-5">
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Playlist Name</div>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Late Night Drive"
                className="h-11 border-neutral-700/60 bg-neutral-950/70 text-white placeholder:text-neutral-500"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
              <div className="overflow-hidden rounded-2xl border border-white/8 bg-neutral-950/60">
                <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-white">Available Tracks</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {mode === "create"
                        ? "Choose tracks from the live queue."
                        : "Queue tracks and tracks already saved in this playlist appear here."}
                    </div>
                  </div>
                  <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-300">
                    {availableTracks.length} total
                  </Badge>
                </div>

                <ScrollArea className="h-[23rem]">
                  <div className="space-y-2 p-3">
                    {availableTracks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-neutral-400">
                        Add music to the room queue first, then create a playlist from it.
                      </div>
                    ) : (
                      availableTracks.map((track) => {
                        const isSelected = selectedTrackUrls.includes(track.url);

                        return (
                          <button
                            key={track.url}
                            type="button"
                            onClick={() => handleToggleTrack(track.url)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                              isSelected
                                ? "border-white/18 bg-white/[0.06]"
                                : "border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]"
                            )}
                          >
                            <ArtworkThumb title={track.title} artworkUrl={track.artworkUrl} />

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">{track.title}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                                {track.availabilityLabel}
                              </div>
                            </div>

                            <div
                              className={cn(
                                "flex size-8 items-center justify-center rounded-full border text-neutral-300 transition-colors",
                                isSelected ? "border-white/20 bg-white text-black" : "border-white/10 bg-white/[0.03]"
                              )}
                            >
                              {isSelected ? <Check className="size-4" /> : <Plus className="size-4" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/8 bg-neutral-950/60">
                <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-white">Playlist Order</div>
                    <div className="mt-1 text-xs text-neutral-500">The saved track order will follow this list.</div>
                  </div>
                  <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-neutral-300">
                    {selectedTrackUrls.length} selected
                  </Badge>
                </div>

                <ScrollArea className="h-[23rem]">
                  <div className="space-y-2 p-3">
                    {selectedTracks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-neutral-400">
                        Choose one or more tracks from the left column to build the playlist.
                      </div>
                    ) : (
                      selectedTracks.map((track, index) => (
                        <div
                          key={track.url}
                          className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3"
                        >
                          <div className="flex size-8 items-center justify-center rounded-xl border border-white/10 bg-neutral-900 text-xs font-medium text-neutral-400">
                            {index + 1}
                          </div>

                          <ArtworkThumb title={track.title} artworkUrl={track.artworkUrl} />

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-white">{track.title}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                              {track.availabilityLabel}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveTrack(track.url, -1)}
                              disabled={index === 0}
                              className="size-8 rounded-full text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveTrack(track.url, 1)}
                              disabled={index === selectedTracks.length - 1}
                              className="size-8 rounded-full text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleTrack(track.url)}
                              className="size-8 rounded-full text-neutral-400 hover:bg-red-500/10 hover:text-red-300"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-white/6 bg-neutral-950/70 px-6 py-4 sm:justify-between">
          <div className="flex items-center gap-3">
            {mode === "edit" && onDelete ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (isConfirmingDelete) {
                      onDelete();
                      return;
                    }
                    setIsConfirmingDelete(true);
                  }}
                  className={cn(
                    "justify-start px-0 text-sm",
                    isConfirmingDelete
                      ? "text-red-300 hover:bg-transparent hover:text-red-200"
                      : "text-neutral-400 hover:text-red-300"
                  )}
                >
                  <Trash2 className="size-4" />
                  {isConfirmingDelete ? "Confirm Delete Playlist" : "Delete Playlist"}
                </Button>
                {isConfirmingDelete ? (
                  <div className="text-xs text-neutral-500">Click delete again to confirm.</div>
                ) : null}
              </>
            ) : (
              <div className="text-xs text-neutral-500">
                Playlists stay in the library even if tracks leave the live queue.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-neutral-300 hover:bg-white/[0.05] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!trimmedName || !isDirty}
              className="bg-white text-neutral-950 hover:bg-neutral-200"
            >
              {mode === "create" ? "Create Playlist" : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
