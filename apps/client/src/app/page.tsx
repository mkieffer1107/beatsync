"use client";
import { Join } from "@/components/Join";
import { NewSyncer } from "@/components/NewSyncer";
import { DEMO_ROOM_ID, IS_DEMO_MODE } from "@/lib/demo";
import { IS_SINGLE_ROOM_MODE, SINGLE_ROOM_ID } from "@/lib/singleRoom";
import { useChatStore } from "@/store/chat";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const resetGlobalStore = useGlobalStore((state) => state.resetStore);
  const resetRoomStore = useRoomStore((state) => state.reset);
  const resetChatStore = useChatStore((state) => state.reset);

  useEffect(() => {
    if (IS_DEMO_MODE) return;
    console.log("resetting stores");
    // Reset all stores when the main page is loaded
    resetGlobalStore();
    resetRoomStore();
    resetChatStore();
  }, [resetGlobalStore, resetRoomStore, resetChatStore]);

  if (IS_DEMO_MODE) {
    return <NewSyncer roomId={DEMO_ROOM_ID} />;
  }

  if (IS_SINGLE_ROOM_MODE) {
    redirect(`/room/${SINGLE_ROOM_ID}`);
  }

  return <Join />;
}
