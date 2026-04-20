import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getApiUrl, getWsUrl, resetResolvedUrlsForTests } from "@/lib/urls";

const originalWindow = globalThis.window;
const originalNodeEnv = process.env.NODE_ENV;
const originalApiEnv = process.env.NEXT_PUBLIC_API_URL;
const originalWsEnv = process.env.NEXT_PUBLIC_WS_URL;

const setWindowLocation = (url: string) => {
  const location = new URL(url);
  Object.defineProperty(globalThis, "window", {
    value: { location },
    configurable: true,
  });
};

const setEnv = (key: string, value: string) => {
  Object.assign(process.env, { [key]: value });
};

const unsetEnv = (key: string) => {
  delete (process.env as Record<string, string | undefined>)[key];
};

describe("URL resolution", () => {
  beforeEach(() => {
    resetResolvedUrlsForTests();
    unsetEnv("NEXT_PUBLIC_API_URL");
    unsetEnv("NEXT_PUBLIC_WS_URL");
  });

  afterEach(() => {
    resetResolvedUrlsForTests();

    if (typeof originalApiEnv === "string") {
      process.env.NEXT_PUBLIC_API_URL = originalApiEnv;
    } else {
      unsetEnv("NEXT_PUBLIC_API_URL");
    }

    if (typeof originalWsEnv === "string") {
      process.env.NEXT_PUBLIC_WS_URL = originalWsEnv;
    } else {
      unsetEnv("NEXT_PUBLIC_WS_URL");
    }

    if (typeof originalNodeEnv === "string") {
      setEnv("NODE_ENV", originalNodeEnv);
    } else {
      unsetEnv("NODE_ENV");
    }

    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
  });

  it("prefers explicit API and WS env vars", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_WS_URL = "wss://api.example.com/ws";
    setWindowLocation("http://localhost:3000");

    expect(getApiUrl()).toBe("https://api.example.com");
    expect(getWsUrl()).toBe("wss://api.example.com/ws");
  });

  it("uses the Bun server port during localhost development", () => {
    setEnv("NODE_ENV", "development");
    setWindowLocation("http://localhost:3000");

    expect(getApiUrl()).toBe("http://localhost:8080");
    expect(getWsUrl()).toBe("ws://localhost:8080/ws");
  });

  it("keeps same-origin resolution for proxied hosts", () => {
    setEnv("NODE_ENV", "development");
    setWindowLocation("https://local.beatsync.gg");

    expect(getApiUrl()).toBe("https://local.beatsync.gg");
    expect(getWsUrl()).toBe("wss://local.beatsync.gg/ws");
  });
});
