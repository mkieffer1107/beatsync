import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Queue } from "../Queue";
import { PlaylistLibrary } from "../library/PlaylistLibrary";
import { InlineSearch } from "./InlineSearch";

export const Main = () => {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  return (
    <motion.div
      className={cn(
        "w-full lg:flex-1 overflow-y-auto bg-gradient-to-b from-neutral-900/90 to-neutral-950 backdrop-blur-xl bg-neutral-950 h-full",
        "scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20"
      )}
    >
      <motion.div className="p-6 pt-4">
        {/* <h1 className="text-xl font-semibold mb-8">BeatSync</h1> */}
        <div className="mb-6">
          <InlineSearch />
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Live Queue</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLibraryOpen((currentState) => !currentState)}
            className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
          >
            {isLibraryOpen ? "Hide Library" : "Show Library"}
            <ChevronDown className={cn("size-4 transition-transform duration-200", isLibraryOpen ? "rotate-180" : null)} />
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {isLibraryOpen ? (
            <motion.div
              key="library-panel"
              initial={{ height: 0, opacity: 0, y: -18 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -18 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="mb-6 overflow-hidden"
            >
              <PlaylistLibrary />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <Queue className="mb-8" />
      </motion.div>
    </motion.div>
  );
};
