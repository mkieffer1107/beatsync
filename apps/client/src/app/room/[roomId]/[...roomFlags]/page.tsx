import { isAutostartPathSegments } from "@/lib/autostart";
import { notFound, redirect } from "next/navigation";

// Force dynamic rendering and disable caching
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

const buildAutostartRoomPath = (roomId: string, searchParams: SearchParams = {}) => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
    } else {
      params.set(key, value);
    }
  }

  params.set("autostart", "1");

  const query = params.toString();
  return `/room/${encodeURIComponent(roomId)}${query ? `?${query}` : ""}`;
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string; roomFlags: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const { roomId, roomFlags } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isAutostartPathSegments(roomFlags, { requireFirstSegment: true })) {
    notFound();
  }

  redirect(buildAutostartRoomPath(roomId, resolvedSearchParams));
}
