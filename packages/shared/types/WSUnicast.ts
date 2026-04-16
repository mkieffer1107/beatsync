// 1:1 Private WS Responses
import { z } from "zod";
import { ScheduledActionSchema } from "./WSBroadcast";
import { SearchResponseSchema } from "./provider";

const NTPResponseMessageSchema = z.object({
  type: z.literal("NTP_RESPONSE"),
  t0: z.number(), // Client send timestamp (echoed back)
  t1: z.number(), // Server receive timestamp
  t2: z.number(), // Server send timestamp
  clientRTT: z.number().optional(), // Client's current RTT estimate in ms
  probeGroupId: z.number(), // Coded probes (Huygens): echoed from request
  probeGroupIndex: z.union([z.literal(0), z.literal(1)]), // Coded probes: echoed from request
});
export type NTPResponseMessageType = z.infer<typeof NTPResponseMessageSchema>;

export const MusicSearchResponseSchema = z.object({
  type: z.literal("SEARCH_RESPONSE"),
  response: SearchResponseSchema,
});
export type MusicSearchResponseType = z.infer<typeof MusicSearchResponseSchema>;

export const ImportStatusSchema = z.object({
  type: z.literal("IMPORT_STATUS"),
  status: z.enum(["started", "completed", "error"]),
  message: z.string(),
  importedCount: z.number().nonnegative().optional(),
  failedCount: z.number().nonnegative().optional(),
  collectionName: z.string().optional(),
});
export type ImportStatusType = z.infer<typeof ImportStatusSchema>;

export const WSUnicastSchema = z.discriminatedUnion("type", [
  NTPResponseMessageSchema,
  ScheduledActionSchema,
  MusicSearchResponseSchema,
  ImportStatusSchema,
]);
export type WSUnicastType = z.infer<typeof WSUnicastSchema>;
