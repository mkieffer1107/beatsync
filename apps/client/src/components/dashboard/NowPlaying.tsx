"use client";

import { getAudioSourceArtworkUrl, getAudioSourceDisplayTitle } from "@/lib/audioSourceDisplay";
import { useGlobalStore } from "@/store/global";
import { Music } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { ScrollingText } from "../ui/ScrollingText";

const NowPlayingArtwork = ({ src, alt }: { src: string | null; alt: string }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && failedSrc !== src;

  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-md border border-neutral-700/50 bg-neutral-800/60">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-neutral-500">
          <Music className="h-4 w-4" />
        </div>
      )}
    </div>
  );
};

export const NowPlaying = () => {
  // Subscribe to selectedAudioUrl so we re-render when the active track changes.
  const selectedAudioUrl = useGlobalStore((state) => state.selectedAudioUrl);
  const getSelectedTrack = useGlobalStore((state) => state.getSelectedTrack);

  const track = getSelectedTrack();
  if (!track || !selectedAudioUrl) return null;

  const title = getAudioSourceDisplayTitle(track.source);
  const artworkUrl = getAudioSourceArtworkUrl(track.source);

  return (
    <motion.div
      className="flex w-56 items-center gap-3"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <NowPlayingArtwork src={artworkUrl} alt={title} />
      <div className="min-w-0 flex-1">
        <ScrollingText text={title} className="text-sm font-medium text-white" />
      </div>
    </motion.div>
  );
};
