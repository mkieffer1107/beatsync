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

export interface PlaybackClientLike {
  clientId: string;
  isAdmin: boolean;
  joinedAt: number;
}

export interface AutoplayAuthorityStateLike {
  connectedClients: PlaybackClientLike[];
  currentUser: PlaybackClientLike | null;
  playbackControlsPermissions: "ADMIN_ONLY" | "EVERYONE";
}

export const getQueuePlaybackOrder = (audioSources: PlaybackOrderAudioSourceLike[]) =>
  audioSources.map((audioSource) => audioSource.source.url);

const sortByStableRoomOrder = (left: PlaybackClientLike, right: PlaybackClientLike) =>
  left.joinedAt - right.joinedAt || left.clientId.localeCompare(right.clientId);

export const getAutoplayDriverClientId = (state: AutoplayAuthorityStateLike) => {
  const clientsById = new Map(state.connectedClients.map((client) => [client.clientId, client]));
  if (state.currentUser && !clientsById.has(state.currentUser.clientId)) {
    clientsById.set(state.currentUser.clientId, state.currentUser);
  }

  const connectedClients = Array.from(clientsById.values());
  const admins = connectedClients.filter((client) => client.isAdmin).sort(sortByStableRoomOrder);
  if (admins[0]) {
    return admins[0].clientId;
  }

  if (state.playbackControlsPermissions !== "EVERYONE") {
    return null;
  }

  const clients = connectedClients.sort(sortByStableRoomOrder);
  return clients[0]?.clientId ?? state.currentUser?.clientId ?? null;
};

export const canDriveAutoplay = (state: AutoplayAuthorityStateLike) => {
  const currentClientId = state.currentUser?.clientId;
  return Boolean(currentClientId && currentClientId === getAutoplayDriverClientId(state));
};

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

export const getNextPlaybackTrack = ({
  playbackOrder,
  selectedAudioUrl,
  isShuffled,
  allowWrap,
  playedUrls = [],
  random = Math.random,
}: {
  playbackOrder: string[];
  selectedAudioUrl: string;
  isShuffled: boolean;
  allowWrap: boolean;
  playedUrls?: string[];
  random?: () => number;
}) => {
  if (playbackOrder.length <= 1) {
    return null;
  }

  const currentIndex = playbackOrder.indexOf(selectedAudioUrl);
  if (currentIndex < 0) {
    return null;
  }

  if (isShuffled) {
    const candidateUrls = playbackOrder.filter((url) => url !== selectedAudioUrl);
    const playedUrlSet = new Set(playedUrls);
    const unplayedCandidateUrls = candidateUrls.filter((url) => !playedUrlSet.has(url));
    const shufflePool = unplayedCandidateUrls.length > 0 ? unplayedCandidateUrls : candidateUrls;
    const candidateIndex = Math.min(shufflePool.length - 1, Math.max(0, Math.floor(random() * shufflePool.length)));
    return shufflePool[candidateIndex] ?? null;
  }

  return allowWrap
    ? (playbackOrder[(currentIndex + 1) % playbackOrder.length] ?? null)
    : (playbackOrder[currentIndex + 1] ?? null);
};
