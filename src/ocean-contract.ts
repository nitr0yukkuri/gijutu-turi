import { z } from "zod";
import { isFishSpeciesId, type FishSpeciesId } from "./fish-species.js";
import { FISH_GAITS } from "./fish-contract.js";
import { HOOK_RESULTS } from "./hook-timing.js";
import type { FishMotionSnapshot } from "./fish.js";

export const CATCH_SAVE_STATUSES = ["none", "pending", "saved", "failed"] as const;
export type CatchSaveStatus = typeof CATCH_SAVE_STATUSES[number];
export const canContinueAfterCatchSave = (status: CatchSaveStatus): boolean => status === "saved";

export const OCEAN_PHASES = ["idle", "casting", "waiting", "biting", "fighting", "caught", "escaped", "retrieving"] as const;
export const OCEAN_MODES = ["rest", "surge", "warning", "split"] as const;
export const OCEAN_ESCAPE_REASONS = ["", "missed", "line", "slack", "distance"] as const;

export type OceanPhase = typeof OCEAN_PHASES[number];
export type OceanMode = typeof OCEAN_MODES[number];
export type OceanEscapeReason = typeof OCEAN_ESCAPE_REASONS[number];

const finite = z.number().finite();
const unitInterval = finite.min(0).max(1);
const vectorSchema = z.object({ x: finite, y: finite, z: finite }).strict();
const bodyWaveSchema = z.object({
  phase: finite,
  amplitude: finite.min(0),
  frequency: finite.min(0),
  wavelength: finite.positive(),
}).strict();
const swimSchema = z.object({
  velocity: vectorSchema,
  effort: finite,
  turn: finite,
}).strict();

export const fishMotionSnapshotSchema = z.object({
  position: vectorSchema,
  velocity: vectorSchema,
  heading: vectorSchema,
  speed: finite.min(0),
  gait: z.enum(FISH_GAITS),
  bodyWave: bodyWaveSchema,
  swim: swimSchema.optional(),
}).strict();

const oceanStateFieldsSchema = z.object({
  phase: z.enum(OCEAN_PHASES),
  strength: unitInterval,
  aim: finite.min(-1).max(1),
  revision: z.number().int().nonnegative(),
  castAt: finite,
  retrieveAt: finite,
  tension: unitInterval,
  distance: finite.min(0),
  reeling: z.boolean(),
  mode: z.enum(OCEAN_MODES),
  stamina: unitInterval.optional(),
  canReel: z.boolean().optional(),
  fightTime: finite.min(0).optional(),
  criticalWindow: z.boolean(),
  hookResult: z.enum(HOOK_RESULTS).nullable(),
  approach: unitInterval,
  catches: z.number().int().nonnegative(),
  reason: z.enum(OCEAN_ESCAPE_REASONS),
  resultAt: finite,
  fish: fishMotionSnapshotSchema.optional(),
  fishId: z.custom<FishSpeciesId>(isFishSpeciesId),
  fishX: finite.optional(),
  fishSpeed: finite.min(0).optional(),
  school: z.number().int().positive().optional(),
}).strict();

// A server message is stricter than the temporary UI state: every field used
// by the live renderer must be present in an authoritative room snapshot.
const authoritativeOceanStateSchema = oceanStateFieldsSchema.extend({
  stamina: unitInterval,
  canReel: z.boolean(),
  fightTime: finite.min(0),
  fish: fishMotionSnapshotSchema,
  fishX: finite,
  fishSpeed: finite.min(0),
  school: z.number().int().positive(),
});
export type AuthoritativeOceanState = z.infer<typeof authoritativeOceanStateSchema>;

// The API/WebSocket server can be deployed separately from the Vercel client.
// Accept and discard the two private fields sent by the previous server build
// so a frontend-first rollout does not reject every otherwise valid snapshot.
const compatibleOceanStateSchema = authoritativeOceanStateSchema.extend({
  initialDistance: finite.min(0).optional(),
  biteRemaining: finite.min(0).optional(),
}).transform(({ initialDistance: _initialDistance, biteRemaining: _biteRemaining, ...state }) => state);

/** Temporary UI state can exist before the first server fish snapshot. */
export type OceanClientState = Omit<AuthoritativeOceanState, "fish"> & {
  fish?: FishMotionSnapshot;
};

export const oceanMessageSchema = z.object({
  type: z.literal("ocean"),
  state: compatibleOceanStateSchema,
  rodStroke: z.number().int().nonnegative(),
  serverNow: finite,
  controllers: z.number().int().nonnegative(),
  displays: z.number().int().nonnegative(),
  // Optional while the separately deployed API is rolling forward.
  catchSaveStatus: z.enum(CATCH_SAVE_STATUSES).optional(),
}).strict();

export type OceanMessage = z.infer<typeof oceanMessageSchema>;

export const isOceanMessage = (value: unknown): value is OceanMessage =>
  oceanMessageSchema.safeParse(value).success;
