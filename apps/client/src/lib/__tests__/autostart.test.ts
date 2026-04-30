import { describe, expect, it } from "bun:test";
import { isAutostartPathSegments, isAutostartUrl, stripAutostartFromRoomUrl } from "@/lib/autostart";

describe("autostart URL helpers", () => {
  it("detects supported query parameter values", () => {
    expect(isAutostartUrl(new URL("https://vibe.example/room/123456?autostart=1"))).toBe(true);
    expect(isAutostartUrl(new URL("https://vibe.example/room/123456?autostart=true"))).toBe(true);
    expect(isAutostartUrl(new URL("https://vibe.example/room/123456?autostart"))).toBe(true);
    expect(isAutostartUrl(new URL("https://vibe.example/room/123456?autostart=0"))).toBe(false);
  });

  it("detects supported path flags", () => {
    expect(isAutostartPathSegments(["room", "123456", "autostart"])).toBe(true);
    expect(isAutostartPathSegments(["room", "123456", "autostart", "1"])).toBe(true);
    expect(isAutostartPathSegments(["room", "123456", "autostart 1"])).toBe(true);
    expect(isAutostartPathSegments(["room", "123456", "autostart=1"])).toBe(true);
    expect(isAutostartPathSegments(["room", "123456", "autostart", "false"])).toBe(false);
    expect(isAutostartPathSegments(["room", "123456", "autostart=false"])).toBe(false);
    expect(isAutostartPathSegments(["room", "123456", "autostart", "1", "extra"])).toBe(false);
    expect(isAutostartPathSegments(["prefix", "autostart"], { requireFirstSegment: true })).toBe(false);
  });

  it("strips query and path autostart flags from share URLs", () => {
    expect(
      stripAutostartFromRoomUrl(new URL("https://vibe.example/room/123456?autostart=1&admin=secret")).toString()
    ).toBe("https://vibe.example/room/123456?admin=secret");
    expect(
      stripAutostartFromRoomUrl(new URL("https://vibe.example/room/123456/autostart/1?admin=secret")).toString()
    ).toBe("https://vibe.example/room/123456?admin=secret");
    expect(
      stripAutostartFromRoomUrl(new URL("https://vibe.example/room/123456/autostart%201?admin=secret")).toString()
    ).toBe("https://vibe.example/room/123456?admin=secret");
  });
});
