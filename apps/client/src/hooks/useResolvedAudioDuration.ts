"use client";

import { useEffect, useState } from "react";
import type { AudioSourceType } from "@beatsync/shared";

import { getCachedAudioDuration, getStoredAudioDuration, primeAudioDuration, resolveAudioDuration } from "@/lib/audioDuration";
import { useGlobalStore } from "@/store/global";

export const useResolvedAudioDuration = (source: AudioSourceType) => {
  const getAudioDuration = useGlobalStore((state) => state.getAudioDuration);
  const bufferedDuration = getAudioDuration({ url: source.url });
  const storedDuration = getStoredAudioDuration(source);
  const cachedDuration = getCachedAudioDuration(source.url);
  const [resolvedDuration, setResolvedDuration] = useState(() => storedDuration || cachedDuration || 0);

  useEffect(() => {
    if (bufferedDuration > 0) {
      primeAudioDuration(source.url, bufferedDuration);
      return;
    }

    if (storedDuration > 0 || cachedDuration > 0) {
      return;
    }

    let isCancelled = false;

    void resolveAudioDuration({ url: source.url, source }).then((nextDuration) => {
      if (!isCancelled && nextDuration > 0) {
        setResolvedDuration(nextDuration);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [bufferedDuration, cachedDuration, source, storedDuration]);

  return bufferedDuration || storedDuration || cachedDuration || resolvedDuration;
};
