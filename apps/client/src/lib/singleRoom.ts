import { validateFullRoomId } from "@/lib/room";

const DEFAULT_SINGLE_ROOM_ID = "123456";

const truthyEnvValues = new Set(["1", "true", "yes", "on"]);

const configuredSingleRoomId = process.env.NEXT_PUBLIC_SINGLE_ROOM_ID?.trim();
const configuredSingleRoomMode = process.env.NEXT_PUBLIC_SINGLE_ROOM_MODE?.trim().toLowerCase();

export const IS_SINGLE_ROOM_MODE = truthyEnvValues.has(configuredSingleRoomMode ?? "");
export const SINGLE_ROOM_ID = validateFullRoomId(configuredSingleRoomId ?? "")
  ? configuredSingleRoomId!
  : DEFAULT_SINGLE_ROOM_ID;

