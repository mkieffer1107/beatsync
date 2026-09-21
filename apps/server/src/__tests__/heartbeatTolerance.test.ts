import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import sinon from "sinon";
import { mockR2 } from "@/__tests__/mocks/r2";
import { createMockWs } from "@/__tests__/mocks/websocket";
import { RoomManager } from "@/managers/RoomManager";

mockR2();
describe("heartbeat tolerance", () => {
  let clock: sinon.SinonFakeTimers;
  let room: RoomManager;
  beforeEach(() => {
    clock = sinon.useFakeTimers();
    room = new RoomManager("heartbeat-test");
  });
  afterEach(() => {
    room.removeClient("speaker");
    clock.restore();
  });
  it("keeps the speaker connected through a short loading stall", () => {
    const ws = createMockWs({ clientId: "speaker" });
    const close = spyOn(ws, "close");
    room.addClient(ws);
    clock.tick(10000);
    expect(close).not.toHaveBeenCalled();
    room.processNTPRequestFrom({ clientId: "speaker" });
    clock.tick(10000);
    expect(close).not.toHaveBeenCalled();
  });
  it("still closes a client that stops sending heartbeats", () => {
    const ws = createMockWs({ clientId: "speaker" });
    const close = spyOn(ws, "close");
    room.addClient(ws);
    clock.tick(17500);
    expect(close).toHaveBeenCalledWith(1000, "Connection timeout - no heartbeat response");
  });

  it("keeps a background tab connected when protocol pongs arrive without NTP probes", () => {
    const ws = createMockWs({ clientId: "speaker" });
    const close = spyOn(ws, "close");
    const ping = spyOn(ws, "ping");
    room.addClient(ws);
    for (let interval = 0; interval < 12; interval++) {
      clock.tick(10000);
      room.recordPong(ws);
    }
    expect(ping).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(room.hasActiveConnections()).toBe(true);
    // Pongs must not masquerade as fresh timing measurements.
    expect(room.getClients()[0]?.lastNtpResponse).toBe(0);
  });

  it("does not let a replaced socket keep the new connection alive", () => {
    const oldWs = createMockWs({ clientId: "speaker" });
    room.addClient(oldWs);
    const newWs = createMockWs({ clientId: "speaker" });
    const close = spyOn(newWs, "close");
    room.addClient(newWs);
    clock.tick(10000);
    room.recordPong(oldWs);
    clock.tick(7500);
    expect(close).toHaveBeenCalledWith(1000, "Connection timeout - no heartbeat response");
  });
});
