export interface PlaybackContextLike {
  scope: "all-tracks" | "playlist";
  playlistId?: string | null;
  urls: string[];
}

export interface PlaybackOrderAudioSourceLike {
  source: {
    url: string;
  };
}

export interface PlaybackOrderStateLike {
  audioSources: PlaybackOrderAudioSourceLike[];
  playbackContext: PlaybackContextLike | null;
  selectedAudioUrl: string;
}

export const getQueuePlaybackOrder = (audioSources: PlaybackOrderAudioSourceLike[]) =>
  audioSources.map((audioSource) => audioSource.source.url);

export const resolvePlaybackOrder = (
  state: PlaybackOrderStateLike,
  options?: {
    autoplay?: boolean;
  }
) => {
  const queueOrder = getQueuePlaybackOrder(state.audioSources);
  if (options?.autoplay) {
    return queueOrder;
  }

  const context = state.playbackContext;
  if (!context || context.urls.length === 0) {
    return queueOrder;
  }

  const availableUrls = new Set(queueOrder);
  const contextOrder = context.urls.filter((url) => availableUrls.has(url));

  if (contextOrder.length === 0) {
    return queueOrder;
  }

  if (state.selectedAudioUrl && !contextOrder.includes(state.selectedAudioUrl)) {
    return queueOrder;
  }

  return contextOrder;
};
