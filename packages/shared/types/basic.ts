import { z } from "zod";
import { CHAT_CONSTANTS } from "../constants";

export const GRID = {
  SIZE: 100,
  ORIGIN_X: 50,
  ORIGIN_Y: 50,
  CLIENT_RADIUS: 25,
} as const;

export const PositionSchema = z.object({
  x: z.number().min(0).max(GRID.SIZE),
  y: z.number().min(0).max(GRID.SIZE),
});
export type PositionType = z.infer<typeof PositionSchema>;

export const AudioSourceCollectionSchema = z.object({
  type: z.enum(["youtube-playlist"]),
  id: z.string().optional(),
  externalId: z.string().optional(),
  name: z.string(),
  position: z.number().int().positive().optional(),
});
export type AudioSourceCollectionType = z.infer<typeof AudioSourceCollectionSchema>;

export const AudioSourceMetadataSchema = z.object({
  sourceUrl: z.string().url().optional(),
  providerTrackId: z.string().optional(),
  youtubeVideoId: z.string().optional(),
  durationSeconds: z.number().positive().optional(),
});
export type AudioSourceMetadataType = z.infer<typeof AudioSourceMetadataSchema>;

export const AudioSourceSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  artworkUrl: z.string().url().optional(),
  originalUrl: z.string().url().optional(),
  sourceKind: z.enum(["upload", "provider", "youtube"]).optional(),
  externalId: z.string().optional(),
  metadata: AudioSourceMetadataSchema.optional(),
  collection: AudioSourceCollectionSchema.optional(),
});
export type AudioSourceType = z.infer<typeof AudioSourceSchema>;

export const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  trackUrls: z.array(z.string()).default([]),
  tracks: z.array(AudioSourceSchema).default([]),
  artworkUrl: z.string().url().optional(),
  sourceKind: z.enum(["manual", "youtube"]).default("manual"),
  externalId: z.string().optional(),
  originalUrl: z.string().url().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type PlaylistType = z.infer<typeof PlaylistSchema>;

export const ChatMessageSchema = z.object({
  id: z.number(),
  clientId: z.string(),
  username: z.string(),
  text: z.string().max(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH),
  timestamp: z.number(),
  countryCode: z.string().optional(),
  isCreator: z.boolean().default(false),
});
export type ChatMessageType = z.infer<typeof ChatMessageSchema>;
