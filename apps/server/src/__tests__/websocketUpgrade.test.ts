import { afterEach, describe, expect, it, mock } from "bun:test";
import { handleWebSocketUpgrade } from "@/routes/websocket";
import type { BunServer, WSData } from "@/utils/websocket";

const originalAdminAll = process.env.ADMIN_ALL;
const originalBeatsyncAdminAll = process.env.BEATSYNC_ADMIN_ALL;

function restoreEnv(): void {
  if (originalAdminAll === undefined) {
    delete process.env.ADMIN_ALL;
  } else {
    process.env.ADMIN_ALL = originalAdminAll;
  }

  if (originalBeatsyncAdminAll === undefined) {
    delete process.env.BEATSYNC_ADMIN_ALL;
  } else {
    process.env.BEATSYNC_ADMIN_ALL = originalBeatsyncAdminAll;
  }
}

function createUpgradeServer(): { server: BunServer; getUpgradeData: () => WSData | undefined } {
  let upgradeData: WSData | undefined;

  const server = {
    upgrade: mock((_req: Request, options: { data: WSData }) => {
      upgradeData = options.data;
      return true;
    }),
  } as unknown as BunServer;

  return {
    server,
    getUpgradeData: () => upgradeData,
  };
}

function createWsRequest(): Request {
  return new Request("http://localhost:8080/ws?roomId=123456&username=alice&clientId=client-1");
}

describe("handleWebSocketUpgrade", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("does not mark normal LAN joins as admins at the upgrade boundary", () => {
    delete process.env.ADMIN_ALL;
    delete process.env.BEATSYNC_ADMIN_ALL;
    const { server, getUpgradeData } = createUpgradeServer();

    const response = handleWebSocketUpgrade(createWsRequest(), server);

    expect(response).toBeUndefined();
    expect(getUpgradeData()?.isAdmin).toBe(false);
  });

  it("marks every joining client as admin when ADMIN_ALL is enabled", () => {
    process.env.ADMIN_ALL = "1";
    const { server, getUpgradeData } = createUpgradeServer();

    const response = handleWebSocketUpgrade(createWsRequest(), server);

    expect(response).toBeUndefined();
    expect(getUpgradeData()?.isAdmin).toBe(true);
  });
});
