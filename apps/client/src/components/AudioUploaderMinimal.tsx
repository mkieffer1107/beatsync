"use client";

import { uploadAudioFile } from "@/lib/api";
import { cn, trimFileName } from "@/lib/utils";
import { getYoutubeImportMode, normalizeYoutubeUrl, sendYoutubeImportRequest } from "@/lib/youtubeImport";
import { useCanMutate, useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, CloudUpload, Link2, ListVideo, Loader2, Plus } from "lucide-react";
import { type ChangeEvent, type DragEvent, type FormEvent, useState } from "react";
import { toast } from "sonner";

export const AudioUploaderMinimal = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isYoutubeOpen, setIsYoutubeOpen] = useState(false);
  const [isYoutubeSubmitting, setIsYoutubeSubmitting] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const canMutate = useCanMutate();
  const socket = useGlobalStore((state) => state.socket);
  const activeStreamJobs = useGlobalStore((state) => state.activeStreamJobs);
  const roomId = useRoomStore((state) => state.roomId);

  const isDisabled = !canMutate;
  const normalizedYoutubeUrl = normalizeYoutubeUrl(youtubeUrl);
  const youtubeImportMode = normalizedYoutubeUrl ? getYoutubeImportMode(normalizedYoutubeUrl) : "video";

  const handleFileUpload = async (file: File) => {
    if (isDisabled) return;

    // Store file name for display
    setFileName(file.name);

    try {
      setIsUploading(true);

      // Upload the file to the server as binary
      await uploadAudioFile({
        file,
        roomId,
      });

      setTimeout(() => setFileName(null), 3000);
    } catch (err) {
      console.error("Error during upload:", err);
      toast.error("Failed to upload audio file");
      setFileName(null);
    } finally {
      setIsUploading(false);
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isDisabled) return;
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    handleFileUpload(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const onDropEvent = (event: DragEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    // make sure we only allow audio files
    if (!file.type.startsWith("audio/")) {
      toast.error("Please select an audio file");
      return;
    }

    handleFileUpload(file);
  };

  const toggleYoutubeImport = () => {
    if (isDisabled) return;
    setIsYoutubeOpen((currentState) => !currentState);
  };

  const handleYoutubeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isDisabled) return;

    if (!socket) {
      toast.error("WebSocket not connected");
      return;
    }

    if (!normalizedYoutubeUrl) {
      toast.error("Enter a valid YouTube video or playlist URL");
      return;
    }

    try {
      setIsYoutubeSubmitting(true);
      sendYoutubeImportRequest({
        ws: socket,
        url: normalizedYoutubeUrl,
        mode: youtubeImportMode,
      });
      setYoutubeUrl("");
      toast.success(youtubeImportMode === "playlist" ? "Playlist import queued" : "Video import queued");
    } catch (error) {
      console.error("Failed to queue YouTube import:", error);
      toast.error("Failed to queue YouTube import");
    } finally {
      setIsYoutubeSubmitting(false);
    }
  };

  const getYoutubeDescription = () => {
    if (isDisabled) {
      return "Must be an admin to import";
    }
    if (activeStreamJobs > 0) {
      return `${activeStreamJobs} import${activeStreamJobs === 1 ? "" : "s"} running in background`;
    }
    return "Single video or playlist URL";
  };

  return (
    <div
      className={cn(
        "border border-neutral-700/50 rounded-md mx-2 transition-all overflow-hidden",
        isDisabled ? "bg-neutral-800/20 opacity-50" : "bg-neutral-800/30 hover:bg-neutral-800/50",
        isDragging && !isDisabled ? "outline outline-primary-400 outline-dashed" : "outline-none"
      )}
      id="drop_zone"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragEnd={onDragLeave}
      onDrop={onDropEvent}
      title={isDisabled ? "Admin-only mode - only admins can upload" : undefined}
    >
      <label htmlFor="audio-upload" className={cn("block w-full", isDisabled ? "" : "cursor-pointer")}>
        <div className="p-3 flex items-center gap-3">
          <div
            className={cn(
              "p-1.5 rounded-md flex-shrink-0",
              isDisabled ? "bg-neutral-600 text-neutral-400" : "bg-primary-700 text-white"
            )}
          >
            {isUploading ? <CloudUpload className="h-4 w-4 animate-pulse" /> : <Plus className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">
              {isUploading ? "Uploading..." : fileName ? trimFileName(fileName) : "Upload audio"}
            </div>
            {!isUploading && !fileName && (
              <div className={cn("text-xs truncate", isDisabled ? "text-neutral-500" : "text-neutral-400")}>
                {isDisabled ? "Must be an admin to upload" : "Add music to queue"}
              </div>
            )}
          </div>
        </div>
      </label>

      <div className="border-t border-neutral-700/40">
        <button
          type="button"
          onClick={toggleYoutubeImport}
          disabled={isDisabled}
          className={cn(
            "w-full p-3 flex items-center gap-3 text-left transition-colors",
            isDisabled ? "cursor-not-allowed" : "hover:bg-neutral-800/30"
          )}
          title={isDisabled ? "Admin-only mode - only admins can import from YouTube" : undefined}
        >
          <div
            className={cn(
              "p-1.5 rounded-md flex-shrink-0",
              isDisabled ? "bg-neutral-600 text-neutral-400" : "bg-neutral-700 text-neutral-100"
            )}
          >
            {isYoutubeSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : youtubeImportMode === "playlist" && youtubeUrl ? (
              <ListVideo className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">
              {youtubeUrl && normalizedYoutubeUrl
                ? youtubeImportMode === "playlist"
                  ? "Import YouTube playlist"
                  : "Import YouTube video"
                : "Import from YouTube"}
            </div>
            <div className={cn("text-xs truncate", isDisabled ? "text-neutral-500" : "text-neutral-400")}>
              {getYoutubeDescription()}
            </div>
          </div>

          <ChevronDown
            className={cn(
              "h-4 w-4 flex-shrink-0 transition-transform duration-200",
              isDisabled ? "text-neutral-600" : "text-neutral-400",
              isYoutubeOpen && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isYoutubeOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <form onSubmit={handleYoutubeSubmit} className="px-3 pb-3">
                <div className="rounded-md border border-neutral-700/50 bg-neutral-900/60">
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                    placeholder="Paste a YouTube video or playlist URL"
                    disabled={isYoutubeSubmitting || isDisabled}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className={cn(
                      "w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none",
                      isDisabled && "cursor-not-allowed text-neutral-500"
                    )}
                  />
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!youtubeUrl.trim() || !normalizedYoutubeUrl || isYoutubeSubmitting || isDisabled}
                    className={cn(
                      "inline-flex items-center justify-center rounded-md px-3 py-2 text-xs font-medium transition-colors",
                      "bg-white text-neutral-950 hover:bg-neutral-200",
                      "disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    )}
                  >
                    {isYoutubeSubmitting
                      ? "Queueing..."
                      : youtubeImportMode === "playlist"
                        ? "Import playlist"
                        : "Import video"}
                  </button>

                  {youtubeImportMode === "playlist" ? (
                    <div className="text-[11px] text-neutral-500 truncate">
                      Playlists queue every video as tracks.
                    </div>
                  ) : null}
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <input
        id="audio-upload"
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/ogg,audio/webm,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
        onChange={onInputChange}
        disabled={isUploading || isDisabled}
        className="hidden"
      />
    </div>
  );
};
