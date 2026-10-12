export const normaliseRodDirection = (direction) => Number.isFinite(direction) ? Math.max(-1, Math.min(1, direction)) : 0;
/** The player should point the rod against the fish's lateral movement. */
export const rodDirectionTargetForLateral = (lateralVelocity, lateralLimit) => normaliseRodDirection(-lateralVelocity / Math.max(.1, Math.abs(lateralLimit)));
/** 0 is aligned, 1 is maximally opposite. */
export const rodDirectionError = (direction, target) => Math.max(0, Math.min(1, Math.abs(normaliseRodDirection(direction) - normaliseRodDirection(target)) / 2));
