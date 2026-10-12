const TAU = Math.PI * 2;
const GAIT_PROFILES = {
    cruise: { acceleration: 1.8, drag: 0.7, amplitude: 0.08, frequency: 1.6, wavelength: 0.8 },
    // CSS fish is small and calm, but never visually inert. Its lower effort
    // is expressed through a gentler wave rather than the near-static coast gait.
    css_cruise: { acceleration: 1.55, drag: 0.68, amplitude: 0.12, frequency: 1.65, wavelength: 0.82 },
    turn: { acceleration: 2.8, drag: 0.9, amplitude: 0.16, frequency: 2.6, wavelength: 0.72 },
    burst: { acceleration: 5.4, drag: 0.35, amplitude: 0.22, frequency: 4.6, wavelength: 0.64 },
    // Go keeps a visible, uneven tail beat while the angler gains line. It is
    // forceful enough to read at fight distance without becoming another surge.
    go_reel_resist: { acceleration: 4.6, drag: 0.38, amplitude: 0.24, frequency: 3.7, wavelength: 0.58 },
    // Swordfish use a sharp, tail-driven run: keep this gait species-specific so
    // their acceleration wave can be forceful without speeding up other fish.
    billfish_burst: { acceleration: 8.2, drag: 0.22, amplitude: 0.31, frequency: 5.8, wavelength: 0.52 },
    coast: { acceleration: 0.7, drag: 0.28, amplitude: 0.045, frequency: 0.8, wavelength: 0.9 },
    hooked_burst: { acceleration: 7.2, drag: 0.3, amplitude: 0.3, frequency: 5.8, wavelength: 0.58 },
    // Large animals need a distinct, authoritative gait: a short heavy start
    // followed by a slow body wave. A separate heavy surge lets a large animal
    // become violent without borrowing Go's light, school-like burst.
    heavy_start: { acceleration: 3.6, drag: 0.42, amplitude: 0.16, frequency: 2.4, wavelength: 0.68 },
    heavy_surge: { acceleration: 5.1, drag: 0.3, amplitude: 0.25, frequency: 4.1, wavelength: 0.62 },
    heavy_lunge: { acceleration: 5.4, drag: 0.28, amplitude: 0.32, frequency: 2.8, wavelength: 0.58 },
    heavy_glide: { acceleration: 0.9, drag: 0.42, amplitude: 0.1, frequency: 0.78, wavelength: 0.94 },
    // Low-speed heavy swimming keeps a visible wave in the flexible rear body
    // without borrowing the fast fight surge or bending the armored head.
    heavy_cruise: { acceleration: 1.4, drag: 0.55, amplitude: 0.14, frequency: 1.2, wavelength: 0.84 },
    heavy_station: { acceleration: 0.8, drag: 0.58, amplitude: 0.18, frequency: 1.1, wavelength: 0.9 },
    exhausted: { acceleration: 1, drag: 1.25, amplitude: 0.025, frequency: 0.6, wavelength: 1 },
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export const magnitude = (value) => Math.hypot(value.x, value.y, value.z);
export const normalise = (value) => {
    const length = magnitude(value);
    if (length === 0)
        return { x: 0, y: 0, z: 0 };
    return { x: value.x / length, y: value.y / length, z: value.z / length };
};
export const add = (left, right) => ({
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
});
export const subtract = (left, right) => ({
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
});
export const scale = (value, factor) => ({
    x: value.x * factor,
    y: value.y * factor,
    z: value.z * factor,
});
const clampMagnitude = (value, maxLength) => {
    const length = magnitude(value);
    if (length <= maxLength || length === 0)
        return value;
    return scale(value, maxLength / length);
};
const lerp = (from, to, amount) => ({
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount,
});
export class FishLocomotion {
    position;
    velocity;
    heading;
    gait = "cruise";
    wavePhase = 0;
    waveAmplitude = GAIT_PROFILES.cruise.amplitude;
    waveFrequency = GAIT_PROFILES.cruise.frequency;
    waveWavelength = GAIT_PROFILES.cruise.wavelength;
    stamina = 100;
    cStartRemaining = 0;
    swim;
    constructor(position, velocity) {
        this.position = { ...position };
        this.velocity = { ...velocity };
        this.heading = normalise(velocity);
    }
    update(deltaSeconds, intent, externalForce = { x: 0, y: 0, z: 0 }) {
        const delta = clamp(deltaSeconds, 0, 0.1);
        const activeGait = this.cStartRemaining > 0 ? "hooked_burst" : intent.gait;
        const profile = GAIT_PROFILES[activeGait];
        const direction = normalise(intent.direction);
        const targetSpeed = this.cStartRemaining > 0 ? Math.max(intent.speed, 2.8) : intent.speed;
        const desiredVelocity = scale(direction, targetSpeed);
        const velocityDelta = clampMagnitude(subtract(desiredVelocity, this.velocity), profile.acceleration * delta);
        const steeringAcceleration = scale(velocityDelta, 1 / Math.max(delta, 0.001));
        const totalAcceleration = add(steeringAcceleration, externalForce);
        this.velocity = add(this.velocity, scale(totalAcceleration, delta));
        this.velocity = scale(this.velocity, Math.exp(-profile.drag * delta));
        this.position = add(this.position, scale(this.velocity, delta));
        const speed = magnitude(this.velocity);
        if (speed > 0.01) {
            this.heading = normalise(lerp(this.heading, normalise(this.velocity), clamp(delta * 7, 0, 1)));
        }
        // Smooth every gait transition, not only the CSS cruise entry. Otherwise
        // a CSS fish eases for one frame when it starts resisting, then snaps to
        // the new wave profile on the next update.
        const waveBlend = 1 - Math.exp(-delta * 5.5);
        this.waveAmplitude += (profile.amplitude - this.waveAmplitude) * waveBlend;
        this.waveFrequency += (profile.frequency - this.waveFrequency) * waveBlend;
        this.waveWavelength += (profile.wavelength - this.waveWavelength) * waveBlend;
        this.gait = activeGait;
        this.wavePhase = (this.wavePhase + this.waveFrequency * TAU * delta) % TAU;
        this.cStartRemaining = Math.max(0, this.cStartRemaining - delta);
    }
    triggerCStart(escapeDirection) {
        const direction = normalise(escapeDirection);
        this.cStartRemaining = 0.22;
        this.gait = "hooked_burst";
        this.heading = direction;
        this.velocity = add(this.velocity, scale(direction, 1.6));
    }
    /**
     * Keep the procedural body wave while letting an authoritative game loop
     * own the fish's root motion. This prevents a renderer from inventing a
     * second position or heading for the same fish.
     */
    setRootMotion(position, velocity, swim) {
        this.position = { ...position };
        this.velocity = { ...velocity };
        this.swim = swim ? { ...swim, velocity: { ...swim.velocity } } : undefined;
        const facingVelocity = swim?.velocity ?? velocity;
        if (magnitude(facingVelocity) > 0.01)
            this.heading = normalise(facingVelocity);
    }
    setGait(gait) {
        this.gait = gait;
    }
    setStamina(stamina) {
        this.stamina = clamp(stamina, 0, 100);
    }
    getStamina() {
        return this.stamina;
    }
    reset(position, velocity) {
        this.position = { ...position };
        this.velocity = { ...velocity };
        this.heading = normalise(velocity);
        this.gait = "cruise";
        this.wavePhase = 0;
        this.waveAmplitude = GAIT_PROFILES.cruise.amplitude;
        this.waveFrequency = GAIT_PROFILES.cruise.frequency;
        this.waveWavelength = GAIT_PROFILES.cruise.wavelength;
        this.stamina = 100;
        this.cStartRemaining = 0;
        this.swim = undefined;
    }
    snapshot() {
        const speed = magnitude(this.velocity);
        const speedFactor = clamp((this.swim ? magnitude(this.swim.velocity) : speed) / 2.8, 0.35, 1.35);
        return {
            position: { ...this.position },
            velocity: { ...this.velocity },
            heading: { ...this.heading },
            speed,
            gait: this.gait,
            ...(this.swim ? { swim: { ...this.swim, velocity: { ...this.swim.velocity } } } : {}),
            bodyWave: {
                phase: this.wavePhase,
                amplitude: this.waveAmplitude * speedFactor,
                frequency: this.waveFrequency,
                wavelength: this.waveWavelength,
            },
        };
    }
}
