"use client";

import { Timer } from "lucide-react";
import { Separator } from "../ui/separator";
import { MetronomeButton } from "./Metronome";
import { NudgeControl } from "./NudgeControl";

/**
 * Desktop-only home for the timing tools (nudge + metronome) that previously
 * lived in the bottom bar, now relocated to make room for the Now Playing info.
 */
export const DesktopTimingTools = () => {
  return (
    <div className="hidden lg:block">
      <Separator className="bg-neutral-800/50" />

      <div>
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
            <Timer className="h-3.5 w-3.5" />
            <span>Timing</span>
          </h2>
          <MetronomeButton />
        </div>

        <div className="px-4 pb-3 pt-2.5">
          <NudgeControl />
        </div>
      </div>
    </div>
  );
};
