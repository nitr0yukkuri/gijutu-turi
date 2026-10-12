import { z } from "zod";
export const sessionIdSchema = z.string().regex(/^session_[a-z0-9]{12}$/);
const inputPayloadSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("cast"),
        strength: z.number().finite().min(0).max(1).default(1),
    }),
    z.object({
        action: z.literal("reel"),
        strength: z.number().finite().min(0).max(1).default(1),
    }),
    z.object({
        action: z.literal("hook"),
    }),
    z.object({
        action: z.literal("reset"),
    }),
]);
export const clientMessageSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("input"),
        sequence: z.number().int().nonnegative(),
        input: inputPayloadSchema,
    }),
]);
export const FISH_GAITS = [
    "cruise",
    "css_cruise",
    "turn",
    "burst",
    "coast",
    "hooked_burst",
    "heavy_start",
    "heavy_surge",
    "heavy_lunge",
    "heavy_glide",
    "exhausted",
];
