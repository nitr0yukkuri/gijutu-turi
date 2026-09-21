import { z } from "zod";

export const sessionIdSchema = z.string().regex(/^session_[a-z0-9]{12}$/);

const vectorSchema = z.object({
  x: z.number().finite().min(-1).max(1),
  y: z.number().finite().min(-1).max(1),
  z: z.number().finite().min(-1).max(1),
});

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
    action: z.literal("rod_motion"),
    direction: vectorSchema,
    strength: z.number().finite().min(0).max(1).default(0),
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

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type InputPayload = z.infer<typeof inputPayloadSchema>;

export type FishState =
  | "cruise"
  | "approach"
  | "inspect"
  | "bite"
  | "fight"
  | "exhausted"
  | "caught"
  | "escaped";

export type FishGait =
  | "cruise"
  | "turn"
  | "burst"
  | "coast"
  | "hooked_burst"
  | "exhausted";

export interface BodyWaveSnapshot {
  phase: number;
  amplitude: number;
  frequency: number;
  wavelength: number;
}

export type FishingPhase =
  | "idle"
  | "casting"
  | "waiting"
  | "biting"
  | "fighting"
  | "caught"
  | "escaped";

export interface FishSnapshot {
  id: string;
  state: FishState;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  heading: { x: number; y: number; z: number };
  speed: number;
  gait: FishGait;
  bodyWave: BodyWaveSnapshot;
  stamina: number;
}

export interface GameSnapshot {
  sessionId: string;
  tick: number;
  phase: FishingPhase;
  fish: FishSnapshot;
  line: {
    tension: number;
    length: number;
  };
  lastProcessedInput: number;
}

export type DomainEvent =
  | { type: "CastStarted"; tick: number }
  | { type: "LureLanded"; tick: number }
  | { type: "FishApproached"; tick: number; fishId: string }
  | { type: "FishBite"; tick: number; fishId: string }
  | { type: "FishHooked"; tick: number; fishId: string }
  | { type: "FishCaught"; tick: number; fishId: string }
  | { type: "FishEscaped"; tick: number; fishId: string };

export type ServerMessage =
  | { type: "result"; result: "session_joined" | "input_rejected"; message?: string }
  | { type: "snapshot"; snapshot: GameSnapshot }
  | { type: "fish_event"; event: DomainEvent };
