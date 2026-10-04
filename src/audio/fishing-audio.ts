import type { FishSpeciesId } from "../fish-species.js";
import type { OceanPhase, OceanState } from "../client/types.js";

export type FishingAudioEvent = "cast" | "splash" | "bite" | "hook-critical" | "catch" | "escape" | "retrieve";

export type FishAudioTuning = {
  reelFrequency: number;
  dragFrequency: number;
  dragFilterFrequency: number;
  reelIntervalMs: number;
  reelGain: number;
  strainGain: number;
};

const MAX_ONE_SHOT_VOICES = 6;
const MAX_ONE_SHOT_GAIN = .11;
const ONE_SHOT_GAIN_BOOST = 1.5;
const OUTPUT_GAIN = .62;
const AMBIENT_GAIN = .022;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Keep every generated voice below a known envelope ceiling before mixing. */
export const clampAudioGain = (value: number, max = MAX_ONE_SHOT_GAIN): number =>
  clamp(Number.isFinite(value) ? value * ONE_SHOT_GAIN_BOOST : 0, 0, max);

/** Convert server tension into a restrained, nonlinear sound intensity. */
export const getTensionSoundLevel = (tension: number): number =>
  clamp((clamp(Number.isFinite(tension) ? tension : 0, 0, 1) - .3) / .62, 0, 1);

/** A tighter line produces a quicker but still soft drag-ratchet cadence. */
export const getDragPulseInterval = (strain: number): number =>
  Math.round(220 - clamp(Number.isFinite(strain) ? strain : 0, 0, 1) * 132);

export const getFishAudioTuning = (fishId: FishSpeciesId): FishAudioTuning => {
  if (fishId === "whale-001") {
    return { reelFrequency: 94, dragFrequency: 72, dragFilterFrequency: 430, reelIntervalMs: 178, reelGain: .014, strainGain: .042 };
  }
  if (fishId === "k8s-001") {
    return { reelFrequency: 82, dragFrequency: 61, dragFilterFrequency: 360, reelIntervalMs: 190, reelGain: .016, strainGain: .048 };
  }
  if (fishId === "css-001") {
    return { reelFrequency: 278, dragFrequency: 188, dragFilterFrequency: 980, reelIntervalMs: 142, reelGain: .009, strainGain: .022 };
  }
  if (fishId === "rust-001") {
    return { reelFrequency: 224, dragFrequency: 156, dragFilterFrequency: 760, reelIntervalMs: 116, reelGain: .011, strainGain: .037 };
  }
  if (fishId === "js-001") {
    return { reelFrequency: 260, dragFrequency: 174, dragFilterFrequency: 840, reelIntervalMs: 122, reelGain: .010, strainGain: .029 };
  }
  return { reelFrequency: 188, dragFrequency: 132, dragFilterFrequency: 690, reelIntervalMs: 128, reelGain: .012, strainGain: .032 };
};

type AudioContextConstructor = new () => AudioContext;

const getAudioContextConstructor = (): AudioContextConstructor | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
};

/**
 * Browser-only presentation service for fishing sounds.
 *
 * Game state remains authoritative on the server. This class only translates
 * state transitions into local audio, so audio latency never changes gameplay.
 */
export class FishingAudioController {
  private context: AudioContext | null = null;
  private inputGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientModulator: OscillatorNode | null = null;
  private ambientModulationGain: GainNode | null = null;
  private reelPulseTimer: number | null = null;
  private dragPulseTimer: number | null = null;
  private waterLapTimer: number | null = null;
  private reelPulseInterval = 0;
  private dragPulseInterval = 0;
  private reelTuning = getFishAudioTuning("fish-001");
  private reelAmount = 0;
  private dragTuning = this.reelTuning;
  private dragAmount = 0;
  private waterLapAmount = 1;
  private activeVoices = new Set<AudioScheduledSourceNode>();
  private lastEvents = new Map<FishingAudioEvent, number>();
  private lastLoopUpdate = 0;
  private enabled = false;

  isEnabled(): boolean { return this.enabled; }

  async toggle(): Promise<boolean> {
    this.ensureGraph();
    const context = this.context;
    const inputGain = this.inputGain;
    if (!context || !inputGain) throw new Error("audio_unavailable");
    await context.resume();
    this.enabled = !this.enabled;
    const time = context.currentTime;
    inputGain.gain.cancelScheduledValues(time);
    inputGain.gain.setTargetAtTime(this.enabled ? 1 : 0, time, .045);
    if (this.enabled) {
      this.scheduleWaterLap(1500 + Math.random() * 1800);
    } else {
      this.clearPulseTimers();
      window.setTimeout(() => {
        if (!this.enabled) void context.suspend();
      }, 240);
    }
    return this.enabled;
  }

  sync(previous: OceanState, next: OceanState): void {
    if (!this.enabled) return;
    this.waterLapAmount = next.phase === "fighting" ? (next.tension >= .58 ? .3 : .44) : next.phase === "biting" ? .72 : 1;
    if (previous.phase !== next.phase) {
      const eventByPhase: Partial<Record<OceanPhase, FishingAudioEvent>> = {
        casting: "cast",
        biting: "bite",
        caught: "catch",
        escaped: "escape",
        retrieving: "retrieve",
      };
      const event = eventByPhase[next.phase];
      if (event) this.play(event);
    }
    if (previous.phase === "biting" && next.phase === "fighting" && next.hookResult === "critical") {
      this.play("hook-critical");
    }
    this.syncLoops(next, (next.phase === "fighting" && next.reeling) || next.phase === "retrieving");
  }

  syncReeling(state: OceanState, active: boolean): void {
    if (!this.enabled) return;
    this.syncLoops(state, active && state.phase === "fighting");
  }

  play(event: FishingAudioEvent): void {
    if (!this.enabled) return;
    const context = this.context;
    const inputGain = this.inputGain;
    if (!context || !inputGain || this.activeVoices.size >= MAX_ONE_SHOT_VOICES) return;
    const now = context.currentTime + .004;
    const previous = this.lastEvents.get(event) ?? -Infinity;
    const cooldown = event === "splash" ? .14 : .08;
    if (context.currentTime - previous < cooldown) return;
    this.lastEvents.set(event, context.currentTime);

    if (event === "cast") {
      // A soft line/air swish; the separate landing callback supplies the splash.
      this.playNoise(now, .34, 1700, .031, 460, .018);
      this.playTone(now, 122, 88, .25, .012, "triangle", .025);
    } else if (event === "splash") {
      this.playNoise(now, .17, 520, .028, 760, .006);
      this.playNoise(now + .018, .105, 1560, .011, 920, .004);
      this.playTone(now, 118, 76, .12, .009, "sine", .004);
    } else if (event === "bite") {
      // Replace the alert-like rising beeps with a muted bobber/plop cue.
      this.playNoise(now, .082, 560, .027, 310, .004);
      this.playTone(now, 205, 148, .11, .013, "sine", .006);
    } else if (event === "hook-critical") {
      // A short, soft line-pluck marks a well-timed hook without stacking a loud splash.
      this.playTone(now, 520, 390, .12, .016, "triangle", .004);
      this.playNoise(now, .055, 1180, .009, 720, .003);
    } else if (event === "catch") {
      // A warm, simultaneous two-note resolution avoids the arcade scale cue.
      this.playTone(now, 330, 330, .27, .019, "sine", .035);
      this.playTone(now, 440, 440, .31, .014, "triangle", .045);
      this.playNoise(now, .13, 1080, .008, 720, .02);
    } else if (event === "escape") {
      this.playNoise(now, .27, 920, .026, 260, .007);
      this.playTone(now, 112, 70, .24, .016, "triangle", .012);
    } else {
      this.playNoise(now, .21, 430, .021, 1180, .012);
      this.playTone(now, 172, 132, .16, .009, "sine", .018);
    }
  }

  suspend(): void {
    if (this.waterLapTimer !== null) window.clearTimeout(this.waterLapTimer);
    this.waterLapTimer = null;
    void this.context?.suspend();
  }

  async resume(): Promise<void> {
    if (this.enabled && this.context?.state === "suspended") await this.context.resume();
    if (this.enabled && this.context?.state === "running" && this.waterLapTimer === null) {
      this.scheduleWaterLap(1500 + Math.random() * 1800);
    }
  }

  dispose(): void {
    this.enabled = false;
    this.clearPulseTimers();
    this.ambientSource?.stop();
    this.ambientSource?.disconnect();
    this.ambientSource = null;
    this.ambientModulator?.stop();
    this.ambientModulator?.disconnect();
    this.ambientModulator = null;
    this.ambientModulationGain?.disconnect();
    this.ambientModulationGain = null;
    for (const voice of this.activeVoices) {
      try { voice.stop(); } catch { /* already stopped */ }
    }
    this.activeVoices.clear();
    this.context?.close();
    this.context = null;
    this.inputGain = null;
    this.noiseBuffer = null;
  }

  private ensureGraph(): void {
    if (this.context) return;
    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) throw new Error("audio_unavailable");
    const context = new AudioContextCtor();
    const inputGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const outputGain = context.createGain();
    inputGain.gain.value = 0;
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = .008;
    compressor.release.value = .22;
    outputGain.gain.value = OUTPUT_GAIN;
    inputGain.connect(compressor);
    compressor.connect(outputGain);
    outputGain.connect(context.destination);
    this.context = context;
    this.inputGain = inputGain;
    this.noiseBuffer = this.createNoiseBuffer(context, 4);

    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 85;
    const ambientFilter = context.createBiquadFilter();
    ambientFilter.type = "lowpass";
    ambientFilter.frequency.value = 480;
    ambientFilter.Q.value = .45;
    const ambientGain = context.createGain();
    ambientGain.gain.value = AMBIENT_GAIN;
    const ambientSource = context.createBufferSource();
    ambientSource.buffer = this.noiseBuffer;
    ambientSource.loop = true;
    ambientSource.connect(highpass);
    highpass.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientGain.connect(inputGain);
    ambientSource.start();
    this.ambientSource = ambientSource;

    // A very slow, shallow swell keeps the sea bed from sounding like a static hiss.
    const ambientModulator = context.createOscillator();
    const ambientModulationGain = context.createGain();
    ambientModulator.type = "sine";
    ambientModulator.frequency.value = .075;
    ambientModulationGain.gain.value = AMBIENT_GAIN * .17;
    ambientModulator.connect(ambientModulationGain);
    ambientModulationGain.connect(ambientGain.gain);
    ambientModulator.start();
    this.ambientModulator = ambientModulator;
    this.ambientModulationGain = ambientModulationGain;
  }

  private syncLoops(state: OceanState, reeling: boolean): void {
    const context = this.context;
    if (!context || !this.inputGain) return;
    const tuning = getFishAudioTuning(state.fishId);
    const strain = state.phase === "fighting" ? getTensionSoundLevel(state.tension) : 0;
    const reelAmount = state.phase === "retrieving" ? .62 : state.canReel === false ? .38 : 1;
    this.reelTuning = tuning;
    this.reelAmount = reelAmount;
    this.dragTuning = tuning;
    this.dragAmount = strain;
    const now = context.currentTime;
    if (now - this.lastLoopUpdate < .045) return;
    this.lastLoopUpdate = now;

    this.syncReelPulses(reeling, tuning);
    this.syncDragPulses(strain > .04, strain);
  }

  private syncReelPulses(active: boolean, tuning: FishAudioTuning): void {
    const interval = tuning.reelIntervalMs;
    if (!active) {
      if (this.reelPulseTimer !== null) window.clearInterval(this.reelPulseTimer);
      this.reelPulseTimer = null;
      this.reelPulseInterval = 0;
      return;
    }
    if (this.reelPulseTimer !== null && this.reelPulseInterval === interval) return;
    if (this.reelPulseTimer !== null) window.clearInterval(this.reelPulseTimer);
    this.reelPulseInterval = interval;
    this.playReelPulse();
    this.reelPulseTimer = window.setInterval(() => this.playReelPulse(), interval);
  }

  private syncDragPulses(active: boolean, amount: number): void {
    const interval = Math.max(80, Math.round(getDragPulseInterval(amount) / 20) * 20);
    if (!active) {
      if (this.dragPulseTimer !== null) window.clearInterval(this.dragPulseTimer);
      this.dragPulseTimer = null;
      this.dragPulseInterval = 0;
      return;
    }
    if (this.dragPulseTimer !== null && this.dragPulseInterval === interval) return;
    if (this.dragPulseTimer !== null) window.clearInterval(this.dragPulseTimer);
    this.dragPulseInterval = interval;
    this.playDragPulse();
    this.dragPulseTimer = window.setInterval(() => this.playDragPulse(), interval);
  }

  /** Add an irregular, soft surface lap over the continuous low water bed. */
  private scheduleWaterLap(delayMs: number): void {
    if (!this.enabled || this.waterLapTimer !== null) return;
    this.waterLapTimer = window.setTimeout(() => {
      this.waterLapTimer = null;
      if (!this.enabled) return;
      this.playWaterLap();
      this.scheduleWaterLap(4600 + Math.random() * 3900);
    }, delayMs);
  }

  private playWaterLap(): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const now = context.currentTime + .012;
    const amount = this.waterLapAmount;
    const duration = 1.7 + Math.random() * .8;
    const peak = (.008 + Math.random() * .002) * amount;
    const startFrequency = 320 + Math.random() * 220;
    const endFrequency = 720 + Math.random() * 430;
    this.playNoise(now, duration, startFrequency, peak, endFrequency, .24 + Math.random() * .12);

    // A much quieter high ripple gives some laps a little surface fizz.
    if (Math.random() < .55) {
      const rippleStart = now + .32 + Math.random() * .24;
      const rippleDuration = .72 + Math.random() * .36;
      this.playNoise(
        rippleStart,
        rippleDuration,
        1050 + Math.random() * 360,
        peak * (.24 + Math.random() * .12),
        1780 + Math.random() * 620,
        .12,
      );
    }
  }

  private playReelPulse(): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const now = context.currentTime + .004;
    const tuning = this.reelTuning;
    const gain = clampAudioGain(tuning.reelGain * this.reelAmount);
    this.playNoise(now, .036, 1250 + tuning.reelFrequency, gain, 900, .0025);
    this.playTone(now, tuning.reelFrequency, tuning.reelFrequency * .88, .032, gain * .48, "triangle", .0025);
  }

  private playDragPulse(): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const now = context.currentTime + .004;
    const tuning = this.dragTuning;
    const amount = this.dragAmount;
    const gain = clampAudioGain(tuning.strainGain * amount);
    const filterFrequency = tuning.dragFilterFrequency * (.82 + amount * .55);
    this.playNoise(now, .052, filterFrequency, gain, filterFrequency * .68, .003);
    this.playTone(now, tuning.dragFrequency, tuning.dragFrequency * (.92 - amount * .16), .047, gain * .46, "triangle", .003);
  }

  private clearPulseTimers(): void {
    if (this.reelPulseTimer !== null) window.clearInterval(this.reelPulseTimer);
    if (this.dragPulseTimer !== null) window.clearInterval(this.dragPulseTimer);
    if (this.waterLapTimer !== null) window.clearTimeout(this.waterLapTimer);
    this.reelPulseTimer = null;
    this.dragPulseTimer = null;
    this.waterLapTimer = null;
    this.reelPulseInterval = 0;
    this.dragPulseInterval = 0;
  }

  private playTone(
    start: number,
    fromFrequency: number,
    toFrequency: number,
    duration: number,
    peak: number,
    type: OscillatorType = "sine",
    attack = .012,
  ): void {
    const context = this.context;
    const inputGain = this.inputGain;
    if (!context || !inputGain || this.activeVoices.size >= MAX_ONE_SHOT_VOICES) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, fromFrequency), start);
    if (fromFrequency !== toFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), start + duration);
    const safePeak = clampAudioGain(peak);
    const safeAttack = Math.min(attack, duration * .45);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.linearRampToValueAtTime(safePeak, start + safeAttack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(inputGain);
    this.trackVoice(oscillator, [gain], start + duration + .025);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }

  private playNoise(
    start: number,
    duration: number,
    filterFrequency: number,
    peak: number,
    endFilterFrequency = filterFrequency,
    attack = .012,
  ): void {
    const context = this.context;
    const inputGain = this.inputGain;
    if (!context || !inputGain || !this.noiseBuffer || this.activeVoices.size >= MAX_ONE_SHOT_VOICES) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(Math.max(40, filterFrequency), start);
    if (filterFrequency !== endFilterFrequency) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFilterFrequency), start + duration);
    }
    filter.Q.value = .72;
    const safePeak = clampAudioGain(peak);
    const safeAttack = Math.min(attack, duration * .45);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.linearRampToValueAtTime(safePeak, start + safeAttack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(inputGain);
    this.trackVoice(source, [filter, gain], start + duration + .025);
    // One-shots should not inherit the ambience buffer's loop-edge fade.
    const safeOffset = Math.min(.08, this.noiseBuffer.duration / 8);
    const maxOffset = Math.max(safeOffset, this.noiseBuffer.duration - safeOffset - duration - .03);
    const offset = safeOffset + Math.random() * Math.max(0, maxOffset - safeOffset);
    source.start(start, offset);
    source.stop(start + duration + .03);
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[], cleanupAt: number): void {
    this.activeVoices.add(source);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.activeVoices.delete(source);
      for (const node of nodes) node.disconnect();
      source.disconnect();
    };
    source.addEventListener("ended", cleanup, { once: true });
    const context = this.context;
    if (context) window.setTimeout(cleanup, Math.max(50, (cleanupAt - context.currentTime) * 1000 + 80));
  }

  private createNoiseBuffer(context: AudioContext, duration: number): AudioBuffer {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    const fadeSamples = Math.max(1, Math.floor(context.sampleRate * .06));
    for (let index = 0; index < data.length; index += 1) {
      const edge = Math.min(1, index / fadeSamples, (data.length - index - 1) / fadeSamples);
      data[index] = (Math.random() * 2 - 1) * Math.max(0, edge);
    }
    return buffer;
  }
}
