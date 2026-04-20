"use client";

import { useMemo } from "react";

import { useIsMobile } from "@/hooks/useIsMobile";
import {
  getAudioSourceArtworkUrl,
  getAudioSourceCollectionLabel,
  getAudioSourceDisplayTitle,
} from "@/lib/audioSourceDisplay";
import { cn, formatTime } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { Disc3, Play, Radio } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface SearchResultsProps {
  query: string;
  className?: string;
  onTrackSelect?: () => void;
}

interface SearchMatch {
  url: string;
  title: string;
  collectionLabel: string | null;
  artworkUrl: string | null;
  queueIndex: number;
  isSelected: boolean;
  duration: number;
  score: number;
}

const normalizeSearchValue = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const FALLBACK_ARTWORK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='12' fill='%23171717'/%3E%3Ccircle cx='40' cy='40' r='18' fill='none' stroke='%23525252' stroke-width='4'/%3E%3Ccircle cx='40' cy='40' r='4' fill='%23525252'/%3E%3C/svg%3E";

const SearchResultArtwork = ({ src, alt }: { src: string | null; alt: string }) => {
  if (!src) {
    return (
      <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-md border border-neutral-800/80 bg-neutral-900/70">
        <Disc3 className="size-4 text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="size-10 flex-shrink-0 overflow-hidden rounded-md border border-neutral-800/80 bg-neutral-900/70">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = FALLBACK_ARTWORK;
        }}
      />
    </div>
  );
};

export function SearchResults({ query, className, onTrackSelect }: SearchResultsProps) {
  const isMobile = useIsMobile();
  const audioSources = useGlobalStore((state) => state.audioSources);
  const selectedAudioUrl = useGlobalStore((state) => state.selectedAudioUrl);
  const isPlaying = useGlobalStore((state) => state.isPlaying);
  const changeAudioSource = useGlobalStore((state) => state.changeAudioSource);
  const broadcastPlay = useGlobalStore((state) => state.broadcastPlay);
  const setPlaybackContext = useGlobalStore((state) => state.setPlaybackContext);
  const getAudioDuration = useGlobalStore((state) => state.getAudioDuration);

  const normalizedQuery = normalizeSearchValue(query);

  const matches = useMemo<SearchMatch[]>(() => {
    if (!normalizedQuery) {
      return [];
    }

    const tokens = normalizedQuery.split(" ").filter(Boolean);

    return audioSources
      .map((audioSourceState, queueIndex) => {
        const source = audioSourceState.source;
        const title = getAudioSourceDisplayTitle(source);
        const collectionLabel = getAudioSourceCollectionLabel(source);
        const normalizedTitle = normalizeSearchValue(title);
        const normalizedCollectionLabel = collectionLabel ? normalizeSearchValue(collectionLabel) : "";
        const searchValue = normalizeSearchValue(
          [title, collectionLabel, source.title, source.originalUrl, source.url].filter(Boolean).join(" ")
        );

        if (!tokens.every((token) => searchValue.includes(token))) {
          return null;
        }

        let score = 0;
        if (normalizedTitle === normalizedQuery) {
          score += 6;
        }
        if (normalizedTitle.startsWith(normalizedQuery)) {
          score += 4;
        } else if (normalizedTitle.includes(normalizedQuery)) {
          score += 2;
        }
        if (normalizedCollectionLabel && normalizedCollectionLabel.includes(normalizedQuery)) {
          score += 1;
        }

        return {
          url: source.url,
          title,
          collectionLabel,
          artworkUrl: getAudioSourceArtworkUrl(source),
          queueIndex,
          isSelected: source.url === selectedAudioUrl,
          duration: getAudioDuration({ url: source.url }),
          score,
        };
      })
      .filter((match): match is SearchMatch => Boolean(match))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (left.isSelected !== right.isSelected) {
          return Number(right.isSelected) - Number(left.isSelected);
        }

        if (left.queueIndex !== right.queueIndex) {
          return left.queueIndex - right.queueIndex;
        }

        return left.title.localeCompare(right.title);
      });
  }, [audioSources, getAudioDuration, normalizedQuery, selectedAudioUrl]);

  const handleSelectTrack = (url: string) => {
    const isCurrentTrack = selectedAudioUrl === url;

    if (!isCurrentTrack) {
      setPlaybackContext(null);
      changeAudioSource(url);
      broadcastPlay(0);
    } else if (!isPlaying) {
      broadcastPlay(0);
    }

    onTrackSelect?.();
  };

  if (!normalizedQuery) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-8"
      >
        <motion.h3
          className="text-base font-medium tracking-tight mb-1 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          Start typing to search your downloads
        </motion.h3>

        <motion.p
          className="text-neutral-400 text-center text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          Search the tracks already loaded into this room
        </motion.p>
      </motion.div>
    );
  }

  if (matches.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-8"
      >
        <motion.h3
          className="text-base font-medium tracking-tight mb-1 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          No downloaded tracks found
        </motion.h3>

        <motion.p
          className="text-neutral-400 text-center text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          Try a different title, filename, or playlist name
        </motion.p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn(isMobile && "max-h-[40vh]", className)}>
      <AnimatePresence>
        <div className="space-y-1">
          {matches.map((track, index) => {
            const metadataLabel = [track.collectionLabel, `Queue slot ${track.queueIndex + 1}`].filter(Boolean).join(" • ");

            return (
              <motion.button
                key={track.url}
                type="button"
                initial={{
                  opacity: 0,
                  filter: "blur(8px)",
                }}
                animate={{
                  opacity: 1,
                  filter: "blur(0px)",
                }}
                exit={{
                  opacity: 0,
                  filter: "blur(4px)",
                }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.04,
                  ease: "easeInOut",
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => handleSelectTrack(track.url)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all duration-200",
                  "hover:bg-neutral-800",
                  track.isSelected ? "bg-white/[0.04]" : null
                )}
              >
                <SearchResultArtwork src={track.artworkUrl} alt={track.title} />

                <div className="min-w-0 flex-1">
                  <h4 className={cn("truncate text-sm font-normal", track.isSelected ? "text-primary-400" : "text-white")}>
                    {track.title}
                  </h4>
                  <p className="truncate text-xs text-neutral-400">{metadataLabel}</p>
                </div>

                <div className="flex min-w-[4.5rem] items-center justify-end gap-2 text-xs text-neutral-500">
                  {track.isSelected ? (
                    isPlaying ? (
                      <Radio className="size-3.5 text-primary-400" />
                    ) : (
                      <Play className="size-3.5 text-primary-400" />
                    )
                  ) : null}
                  <span>{track.duration > 0 ? formatTime(track.duration) : `#${track.queueIndex + 1}`}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </AnimatePresence>
    </motion.div>
  );
}
