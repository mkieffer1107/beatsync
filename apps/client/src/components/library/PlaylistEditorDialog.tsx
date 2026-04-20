"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check, Disc3, ListMusic, Plus, Trash2, X } from "lucide-react";

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

const ArtworkThumb = ({
  title,
  artworkUrl,
  className,
}: {
  title: string;
  artworkUrl: string | null;
  className?: string;
}) => {
  if (artworkUrl) {
    return (
      <div
        className={cn(
          "relative size-11 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-[0_14px_24px_-16px_rgba(0,0,0,0.95)]",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artworkUrl} alt={title} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900 text-neutral-400 shadow-[0_14px_24px_-16px_rgba(0,0,0,0.95)]",
        className
      )}
    >
      <Disc3 className="size-4" />
    </div>
  );
};

const SummaryMetric = ({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) => (
  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">{label}</div>
    <div className={cn("mt-2 text-lg font-semibold tracking-tight text-white", valueClassName)}>{value}</div>
  </div>
);

const EditorPanel = ({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description: string;
  badge: string;
  children: ReactNode;
}) => (
  <section className="flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/8 bg-neutral-950/70 shadow-[0_26px_60px_-42px_rgba(0,0,0,0.95)]">
    <div className="border-b border-white/8 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs leading-5 text-neutral-500">{description}</div>
        </div>
        <Badge variant="outline" className="shrink-0 border-white/10 bg-white/[0.03] px-3 text-[11px] text-neutral-300">
          {badge}
        </Badge>
      </div>
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </section>
);

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-6 text-center sm:min-h-[16rem]">
    <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-neutral-400">
      <ListMusic className="size-5" />
    </div>
    <div className="mt-4 text-sm font-medium text-white">{title}</div>
    <div className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">{description}</div>
  </div>
);

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
  const latestInitialStateRef = useRef({ initialName, initialTrackUrls });

  useEffect(() => {
    latestInitialStateRef.current = { initialName, initialTrackUrls };
  }, [initialName, initialTrackUrls]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextInitialState = latestInitialStateRef.current;
    setName(nextInitialState.initialName);
    setSelectedTrackUrls(nextInitialState.initialTrackUrls);
    setIsConfirmingDelete(false);
  }, [open]);

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
  const sourceSummary = mode === "create" ? "Live queue" : "Queue + saved";

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsConfirmingDelete(false);
    }

    onOpenChange(nextOpen);
  };

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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(94vh,60rem)] w-[calc(100vw-2rem)] max-w-[96rem] flex-col gap-0 overflow-hidden rounded-[30px] border border-white/10 bg-neutral-950/95 p-0 text-white shadow-[0_40px_140px_-52px_rgba(0,0,0,0.98)] backdrop-blur-2xl sm:w-[calc(100vw-3rem)]"
      >
        <DialogHeader className="relative gap-0 border-b border-white/8 px-4 py-4 text-left sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_58%)]" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_18px_36px_-24px_rgba(255,255,255,0.2)]">
                  <ListMusic className="size-5 text-neutral-200" />
                </div>
                <Badge
                  variant="outline"
                  className="border-white/10 bg-white/[0.03] px-3 text-[10px] uppercase tracking-[0.18em] text-neutral-300"
                >
                  {mode === "create" ? "New Playlist" : "Editing Playlist"}
                </Badge>
              </div>

              <DialogTitle className="mt-4 text-[1.65rem] font-semibold tracking-tight text-white sm:text-[1.9rem]">
                {mode === "create" ? "Build a Playlist" : "Refine This Playlist"}
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                {mode === "create"
                  ? "Pick the tracks that belong together, then save a clean ordered collection for the room library."
                  : "Rename the playlist, tune which tracks stay in it, and lock the final saved order without leaving the library."}
              </DialogDescription>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <Badge variant="outline" className="border-white/10 bg-black/20 text-neutral-400">
                  Add or remove tracks from the library list
                </Badge>
                <Badge variant="outline" className="border-white/10 bg-black/20 text-neutral-400">
                  Reorder the playlist from the saved-order view
                </Badge>
              </div>
            </div>

            <DialogClose asChild>
              <button
                type="button"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-neutral-400 transition-colors hover:border-white/14 hover:bg-white/[0.06] hover:text-white"
                aria-label="Close playlist editor"
              >
                <X className="size-4" />
              </button>
            </DialogClose>
          </div>

          <div className="relative mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(24rem,1.45fr)_repeat(3,minmax(11rem,0.78fr))]">
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 shadow-[0_24px_60px_-42px_rgba(0,0,0,0.95)] md:col-span-2 2xl:col-span-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label
                  htmlFor="playlist-editor-name"
                  className="text-[11px] uppercase tracking-[0.24em] text-neutral-500"
                >
                  Playlist Name
                </label>
                <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-600">
                  {selectedTrackUrls.length} {selectedTrackUrls.length === 1 ? "track selected" : "tracks selected"}
                </div>
              </div>
              <Input
                id="playlist-editor-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Late Night Drive"
                className="mt-3 h-12 rounded-2xl border-white/10 bg-neutral-950/80 px-4 text-base text-white placeholder:text-neutral-500"
              />
              <div className="mt-3 text-xs leading-5 text-neutral-500">
                Keep the name short enough to scan beside the live queue and other saved playlists.
              </div>
            </div>

            <SummaryMetric label="Room Tracks" value={String(availableTracks.length)} />
            <SummaryMetric label="In Playlist" value={String(selectedTrackUrls.length)} />
            <SummaryMetric label="Source" value={sourceSummary} valueClassName="text-sm font-medium" />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
          <div className="hidden h-full gap-4 xl:grid xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            <EditorPanel
              title="Available Tracks"
              description={
                mode === "create"
                  ? "Everything currently in the room queue can be added here."
                  : "Queue tracks and tracks already stored in this playlist stay available here."
              }
              badge={`${availableTracks.length} total`}
            >
              <ScrollArea className="h-full">
                <div className="space-y-2.5 p-4">
                  {availableTracks.length === 0 ? (
                    <EmptyState
                      title="No tracks ready yet"
                      description="Add music to the room queue first, then come back here to build a playlist from it."
                    />
                  ) : (
                    availableTracks.map((track) => {
                      const isSelected = selectedTrackUrls.includes(track.url);

                      return (
                        <button
                          key={track.url}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => handleToggleTrack(track.url)}
                          className={cn(
                            "group relative flex w-full flex-col gap-3 rounded-[22px] border px-4 py-3.5 text-left transition-all duration-200 sm:flex-row sm:items-center",
                            isSelected
                              ? "border-white/16 bg-white/[0.07] shadow-[0_20px_48px_-30px_rgba(255,255,255,0.18)]"
                              : "border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.05]"
                          )}
                        >
                          <div
                            className={cn(
                              "absolute left-0 inset-y-3 w-px rounded-full transition-colors",
                              isSelected ? "bg-white/40" : "bg-transparent"
                            )}
                          />

                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <ArtworkThumb title={track.title} artworkUrl={track.artworkUrl} />

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">{track.title}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="truncate text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                                  {track.availabilityLabel}
                                </span>
                                {track.queueIndex >= 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-white/10 bg-black/20 px-2 text-[10px] uppercase tracking-[0.16em] text-neutral-400"
                                  >
                                    Queue {track.queueIndex + 1}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div
                            className={cn(
                              "flex items-center justify-between gap-3 sm:min-w-[5rem] sm:justify-end",
                              isSelected ? "text-white" : "text-neutral-400 group-hover:text-white"
                            )}
                          >
                            <span className="text-xs font-medium">{isSelected ? "Added" : "Add"}</span>
                            <span
                              className={cn(
                                "flex size-9 items-center justify-center rounded-full border transition-colors",
                                isSelected ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.04]"
                              )}
                            >
                              {isSelected ? <Check className="size-4" /> : <Plus className="size-4" />}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </EditorPanel>

            <EditorPanel
              title="Playlist Order"
              description="This column controls the exact order saved with the playlist."
              badge={`${selectedTrackUrls.length} selected`}
            >
              <ScrollArea className="h-full">
                <div className="space-y-2.5 p-4">
                  {selectedTracks.length === 0 ? (
                    <EmptyState
                      title="Nothing selected yet"
                      description="Choose one or more tracks from the left column, then fine-tune the stored order here."
                    />
                  ) : (
                    selectedTracks.map((track, index) => (
                      <div
                        key={track.url}
                        className="group flex flex-col gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3.5 transition-colors hover:border-white/12 hover:bg-white/[0.05] sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-neutral-950/80 text-xs font-semibold text-neutral-300">
                            {index + 1}
                          </div>

                          <ArtworkThumb title={track.title} artworkUrl={track.artworkUrl} />

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-white">{track.title}</div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                              {track.availabilityLabel}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-1 rounded-full border border-white/10 bg-black/20 p-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Move ${track.title} up`}
                            onClick={() => moveTrack(track.url, -1)}
                            disabled={index === 0}
                            className="size-8 rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Move ${track.title} down`}
                            onClick={() => moveTrack(track.url, 1)}
                            disabled={index === selectedTracks.length - 1}
                            className="size-8 rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${track.title} from playlist`}
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
            </EditorPanel>
          </div>

          <Tabs defaultValue="available" className="flex h-full min-h-0 flex-col xl:hidden">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl border border-white/8 bg-black/20 p-1">
              <TabsTrigger
                value="available"
                className="rounded-xl text-sm data-[state=active]:bg-white data-[state=active]:text-neutral-950"
              >
                Library Tracks
              </TabsTrigger>
              <TabsTrigger
                value="order"
                className="rounded-xl text-sm data-[state=active]:bg-white data-[state=active]:text-neutral-950"
              >
                Saved Order
              </TabsTrigger>
            </TabsList>

            <TabsContent value="available" className="mt-4 min-h-0 flex-1">
              <EditorPanel
                title="Available Tracks"
                description={
                  mode === "create"
                    ? "Everything currently in the room queue can be added here."
                    : "Queue tracks and tracks already stored in this playlist stay available here."
                }
                badge={`${availableTracks.length} total`}
              >
                <ScrollArea className="h-full">
                  <div className="space-y-2.5 p-4">
                    {availableTracks.length === 0 ? (
                      <EmptyState
                        title="No tracks ready yet"
                        description="Add music to the room queue first, then come back here to build a playlist from it."
                      />
                    ) : (
                      availableTracks.map((track) => {
                        const isSelected = selectedTrackUrls.includes(track.url);

                        return (
                          <button
                            key={track.url}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleToggleTrack(track.url)}
                            className={cn(
                              "group relative flex w-full flex-col gap-3 rounded-[22px] border px-4 py-3.5 text-left transition-all duration-200 sm:flex-row sm:items-center",
                              isSelected
                                ? "border-white/16 bg-white/[0.07] shadow-[0_20px_48px_-30px_rgba(255,255,255,0.18)]"
                                : "border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.05]"
                            )}
                          >
                            <div
                              className={cn(
                                "absolute left-0 inset-y-3 w-px rounded-full transition-colors",
                                isSelected ? "bg-white/40" : "bg-transparent"
                              )}
                            />

                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <ArtworkThumb title={track.title} artworkUrl={track.artworkUrl} />

                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-white">{track.title}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="truncate text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                                    {track.availabilityLabel}
                                  </span>
                                  {track.queueIndex >= 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="border-white/10 bg-black/20 px-2 text-[10px] uppercase tracking-[0.16em] text-neutral-400"
                                    >
                                      Queue {track.queueIndex + 1}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div
                              className={cn(
                                "flex items-center justify-between gap-3 sm:min-w-[5rem] sm:justify-end",
                                isSelected ? "text-white" : "text-neutral-400 group-hover:text-white"
                              )}
                            >
                              <span className="text-xs font-medium">{isSelected ? "Added" : "Add"}</span>
                              <span
                                className={cn(
                                  "flex size-9 items-center justify-center rounded-full border transition-colors",
                                  isSelected ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.04]"
                                )}
                              >
                                {isSelected ? <Check className="size-4" /> : <Plus className="size-4" />}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </EditorPanel>
            </TabsContent>

            <TabsContent value="order" className="mt-4 min-h-0 flex-1">
              <EditorPanel
                title="Playlist Order"
                description="This column controls the exact order saved with the playlist."
                badge={`${selectedTrackUrls.length} selected`}
              >
                <ScrollArea className="h-full">
                  <div className="space-y-2.5 p-4">
                    {selectedTracks.length === 0 ? (
                      <EmptyState
                        title="Nothing selected yet"
                        description="Choose one or more tracks from the library view, then fine-tune the stored order here."
                      />
                    ) : (
                      selectedTracks.map((track, index) => (
                        <div
                          key={track.url}
                          className="group flex flex-col gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3.5 transition-colors hover:border-white/12 hover:bg-white/[0.05] sm:flex-row sm:items-center"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-neutral-950/80 text-xs font-semibold text-neutral-300">
                              {index + 1}
                            </div>

                            <ArtworkThumb title={track.title} artworkUrl={track.artworkUrl} />

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">{track.title}</div>
                              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                                {track.availabilityLabel}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-1 rounded-full border border-white/10 bg-black/20 p-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Move ${track.title} up`}
                              onClick={() => moveTrack(track.url, -1)}
                              disabled={index === 0}
                              className="size-8 rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Move ${track.title} down`}
                              onClick={() => moveTrack(track.url, 1)}
                              disabled={index === selectedTracks.length - 1}
                              className="size-8 rounded-full text-neutral-400 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${track.title} from playlist`}
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
              </EditorPanel>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/8 bg-black/20 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 text-xs text-neutral-500 sm:flex-row sm:items-center sm:gap-3">
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
                    "h-10 rounded-full border px-4 text-sm transition-colors",
                    isConfirmingDelete
                      ? "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <Trash2 className="size-4" />
                  {isConfirmingDelete ? "Confirm Delete Playlist" : "Delete Playlist"}
                </Button>
                <div className="pl-1">
                  {isConfirmingDelete
                    ? "Click delete again to permanently remove this playlist."
                    : "Playlists stay in the library even if tracks leave the live queue."}
                </div>
              </>
            ) : (
              <div>Playlists stay in the library even if tracks leave the live queue.</div>
            )}
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-full border border-white/10 bg-white/[0.03] px-4 text-neutral-300 hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!trimmedName || !isDirty}
              className="h-10 rounded-full bg-white px-5 text-neutral-950 hover:bg-neutral-200 disabled:bg-white/10 disabled:text-neutral-500"
            >
              {mode === "create" ? "Create Playlist" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
