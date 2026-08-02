import type { GetDefaultAudioType } from "@beatsync/shared";
import { getPublicUrlForKey, listObjectsWithPrefix } from "@/lib/r2";
import { hasConfiguredMusicLibrary, listConfiguredMusicLibrary } from "@/lib/musicLibrary";

export async function getDefaultAudioSources(origin: string): Promise<GetDefaultAudioType> {
  // An explicitly configured directory is a read-only source library. Queue
  // removal never removes these files, and an empty directory intentionally
  // produces an empty default list instead of falling through to upload storage.
  if (hasConfiguredMusicLibrary()) {
    return await listConfiguredMusicLibrary();
  }

  const objects = await listObjectsWithPrefix("default/");
  if (!objects || objects.length === 0) return [];

  return objects
    .filter((object) => Boolean(object.Key))
    .map((object) => ({
      sourceKind: "upload" as const,
      title: object.Key?.split("/")
        .pop()
        ?.replace(/\.[^/.]+$/, ""),
      url: getPublicUrlForKey(object.Key!, origin),
    }));
}
