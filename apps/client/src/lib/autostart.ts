const TRUTHY_AUTOSTART_VALUES = new Set(["1", "true", "yes", "on"]);

const normalizeFlagValue = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const decodePathSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const parseAutostartSegment = (segment: string) => {
  const normalizedSegment = decodePathSegment(segment).trim().toLowerCase();
  if (normalizedSegment === "autostart") {
    return { isMatch: true, inlineValue: undefined };
  }

  const inlineMatch = normalizedSegment.match(/^autostart[\s=:]+(.+)$/);
  return {
    isMatch: Boolean(inlineMatch),
    inlineValue: inlineMatch?.[1]?.trim(),
  };
};

export const isTruthyAutostartValue = (value: string | null | undefined) =>
  TRUTHY_AUTOSTART_VALUES.has(normalizeFlagValue(value));

export const isAutostartPathSegments = (
  segments: string[] | undefined,
  options: { requireFirstSegment?: boolean } = {}
) => {
  if (!segments?.length) return false;

  const parsedSegments = segments.map(parseAutostartSegment);
  const normalizedSegments = segments.map((segment) => decodePathSegment(segment).trim().toLowerCase());
  const autostartIndex = parsedSegments.findIndex((segment) => segment.isMatch);
  if (autostartIndex < 0) return false;
  if (options.requireFirstSegment && autostartIndex !== 0) return false;

  const inlineValue = parsedSegments[autostartIndex]?.inlineValue;
  if (inlineValue !== undefined) {
    const extraSegments = normalizedSegments.slice(autostartIndex + 1).filter(Boolean);
    if (extraSegments.length > 0) return false;
    return inlineValue === "" || TRUTHY_AUTOSTART_VALUES.has(inlineValue);
  }

  const flagValue = normalizedSegments[autostartIndex + 1];
  const extraSegments = normalizedSegments.slice(autostartIndex + 2).filter(Boolean);
  if (extraSegments.length > 0) return false;

  return flagValue === undefined || flagValue === "" || TRUTHY_AUTOSTART_VALUES.has(flagValue);
};

export const isAutostartUrl = (url: Pick<Location, "pathname" | "search"> | URL) => {
  const searchParams = new URLSearchParams(url.search);
  if (searchParams.has("autostart")) {
    const value = searchParams.get("autostart");
    if (value === "" || isTruthyAutostartValue(value)) {
      return true;
    }
  }

  return isAutostartPathSegments(url.pathname.split("/").filter(Boolean));
};

export const stripAutostartFromRoomUrl = (url: URL) => {
  const strippedUrl = new URL(url.toString());
  strippedUrl.searchParams.delete("autostart");

  const segments = strippedUrl.pathname.split("/");
  const parsedSegments = segments.map(parseAutostartSegment);
  const autostartIndex = parsedSegments.findIndex((segment) => segment.isMatch);
  if (autostartIndex >= 0) {
    const inlineValue = parsedSegments[autostartIndex]?.inlineValue;
    const nextSegment = inlineValue === undefined ? segments[autostartIndex + 1] : undefined;
    const nextValue = nextSegment === undefined ? inlineValue : decodePathSegment(nextSegment).trim().toLowerCase();
    const shouldStripPathFlag = nextValue === undefined || nextValue === "" || TRUTHY_AUTOSTART_VALUES.has(nextValue);
    if (shouldStripPathFlag) {
      const removeCount = nextValue === undefined || inlineValue !== undefined ? 1 : 2;
      segments.splice(autostartIndex, removeCount);
      strippedUrl.pathname = segments.join("/") || "/";
    }
  }

  return strippedUrl;
};
