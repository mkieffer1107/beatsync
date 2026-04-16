export const YOUTUBE_IMPORT_ACTION = "IMPORT_YOUTUBE";

export type YoutubeImportMode = "playlist" | "video";

export type YoutubeImportRequest = {
  type: typeof YOUTUBE_IMPORT_ACTION;
  url: string;
  mode: YoutubeImportMode;
};

const YOUTUBE_HOST_SUFFIX = ".youtube.com";

const hasSupportedYoutubeHost = (hostname: string) => {
  const normalizedHost = hostname.toLowerCase();
  return (
    normalizedHost === "youtu.be" || normalizedHost === "youtube.com" || normalizedHost.endsWith(YOUTUBE_HOST_SUFFIX)
  );
};

export const normalizeYoutubeUrl = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const normalizedValue = /^[a-z]+:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;

  try {
    const parsedUrl = new URL(normalizedValue);
    if (!hasSupportedYoutubeHost(parsedUrl.hostname)) {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
};

export const getYoutubeImportMode = (url: string): YoutubeImportMode => {
  try {
    const parsedUrl = new URL(url);
    const playlistId = parsedUrl.searchParams.get("list");
    if (playlistId?.trim()) {
      return "playlist";
    }
  } catch {
    return "video";
  }

  return "video";
};

export const sendYoutubeImportRequest = ({
  ws,
  url,
  mode,
}: {
  ws: WebSocket;
  url: string;
  mode: YoutubeImportMode;
}) => {
  const request: YoutubeImportRequest = {
    type: YOUTUBE_IMPORT_ACTION,
    url,
    mode,
  };

  ws.send(JSON.stringify(request));
};
