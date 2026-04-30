import { RoomPage } from "@/app/room/RoomPage";

// Force dynamic rendering and disable caching
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;

  return <RoomPage roomId={roomId} />;
}
