import { motion } from "motion/react";
import { Player } from "../room/Player";
import { GlobalVolumeControl } from "./GlobalVolumeControl";
import { NowPlaying } from "./NowPlaying";

export const Bottom = () => {
  return (
    <motion.div className="relative z-10 shrink-0 border-t border-neutral-800/50 bg-neutral-900/10 p-4 pb-safe-plus-4 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] backdrop-blur-lg">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between">
        <div className="absolute left-6 hidden lg:block">
          <NowPlaying />
        </div>
        <div className="mx-auto max-w-3xl flex-1">
          <Player />
        </div>
        <div className="absolute right-6 hidden lg:block">
          <GlobalVolumeControl />
        </div>
      </div>
    </motion.div>
  );
};
