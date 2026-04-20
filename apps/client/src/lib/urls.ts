/**
 * Resolves API and WS base URLs.
 *
 * If NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL are set, uses those (explicit mode).
 * Otherwise, derives from window.location (same-origin mode, for Caddy reverse proxy).
 */

let cached: { apiUrl: string; wsUrl: string } | null = null;
const LOCAL_DEV_SERVER_PORT = "8080";

const isLoopbackHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";

function resolve(): { apiUrl: string; wsUrl: string } {
  if (cached) return cached;

  const envApi = process.env.NEXT_PUBLIC_API_URL;
  const envWs = process.env.NEXT_PUBLIC_WS_URL;

  if (envApi && envWs) {
    cached = { apiUrl: envApi, wsUrl: envWs };
  } else if (typeof window !== "undefined") {
    const { protocol, host, hostname, port } = window.location;
    const isSecure = protocol === "https:";

    if (process.env.NODE_ENV === "development" && port === "3000" && isLoopbackHostname(hostname)) {
      const originHost = `${hostname}:${LOCAL_DEV_SERVER_PORT}`;
      cached = {
        apiUrl: `http://${originHost}`,
        wsUrl: `ws://${originHost}/ws`,
      };
      return cached;
    }

    cached = {
      apiUrl: `${protocol}//${host}`,
      wsUrl: `${isSecure ? "wss" : "ws"}://${host}/ws`,
    };
  } else {
    // SSR fallback — don't cache empty strings so client can resolve properly after hydration
    return { apiUrl: "", wsUrl: "" };
  }

  return cached;
}

export function getApiUrl(): string {
  return resolve().apiUrl;
}

export function getWsUrl(): string {
  return resolve().wsUrl;
}

export function resetResolvedUrlsForTests(): void {
  cached = null;
}
