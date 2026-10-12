const STANDARD_APPROACH_MOTION = {
    approach: { gait: 'cruise', speed: 1.05, effort: .28 },
    stationKeep: { gait: 'coast', speed: .16, effort: .12 },
};
/**
 * K8S approaches with a heavier rear-body wave and keeps paddling near the
 * bait. Its root can remain at the authoritative bait position while the
 * synchronized body phase and paired fins continue to show station-keeping.
 */
const K8S_APPROACH_MOTION = {
    approach: { gait: 'heavy_cruise', speed: 1.05, effort: .42 },
    stationKeep: { gait: 'heavy_station', speed: .42, effort: .4 },
};
const APPROACH_MOTION_BY_SPECIES = {
    'k8s-001': K8S_APPROACH_MOTION,
};
/** Shared resolver keeps species-specific approach tuning out of the game loop. */
export const getFishApproachMotionProfile = (fishId) => APPROACH_MOTION_BY_SPECIES[fishId] ?? STANDARD_APPROACH_MOTION;
