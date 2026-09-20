import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AudioSourceSchema } from "@beatsync/shared";
import { useGlobalStore } from "@/store/global";

const initialState = useGlobalStore.getState();
const playAudio = mock(async () => {});
const source = (url: string, status: "loaded" | "loading") => ({
  source: AudioSourceSchema.parse({ url }),
  ...(status === "loaded"
    ? { status: "loaded" as const, buffer: { duration: 180 } as AudioBuffer }
    : { status: "loading" as const }),
});
const play = (audioSource: string) =>
  useGlobalStore.getState().schedulePlay({
    audioSource,
    trackTimeSeconds: 0,
    targetServerTime: 0, // Deliberately long past: must not trigger sync catch-up.
    startWhenReady: true,
  });

describe("independent playback", () => {
  beforeEach(() => {
    playAudio.mockClear();
    useGlobalStore.setState({
      ...initialState,
      isInitingSystem: false,
      playAudio,
      audioSources: [source("https://example.com/a.mp3", "loaded")],
    });
  });

  afterEach(() => {
    useGlobalStore.setState(initialState);
  });

  it("starts a cached song immediately at the requested position without sync catch-up", () => {
    play("https://example.com/a.mp3");
    expect(playAudio).toHaveBeenCalledWith({ offset: 0, when: 0, audioIndex: 0 });
  });

  it("waits only for its own buffer and preserves the intro when retrying", async () => {
    useGlobalStore.setState({ audioSources: [source("https://example.com/a.mp3", "loading")] });
    play("https://example.com/a.mp3");
    expect(playAudio).not.toHaveBeenCalled();
    useGlobalStore.setState({ audioSources: [source("https://example.com/a.mp3", "loaded")] });
    await Bun.sleep(550);
    expect(playAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).toHaveBeenCalledWith({ offset: 0, when: 0, audioIndex: 0 });
  });

  it("does not replay an older pending song after selecting a cached song", async () => {
    useGlobalStore.setState({
      audioSources: [source("https://example.com/a.mp3", "loading"), source("https://example.com/b.mp3", "loaded")],
    });
    play("https://example.com/a.mp3");
    play("https://example.com/b.mp3");
    useGlobalStore.setState({
      audioSources: [source("https://example.com/a.mp3", "loaded"), source("https://example.com/b.mp3", "loaded")],
    });
    await Bun.sleep(550);
    expect(playAudio).toHaveBeenCalledTimes(1);
    expect(playAudio).toHaveBeenCalledWith({ offset: 0, when: 0, audioIndex: 1 });
  });
});
