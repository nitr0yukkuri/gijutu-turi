import type { FishSpeciesId } from "../fish-species.js";
import type { FishSurfaceImpactCue } from "../fish-surface-impact.js";
import type { OceanClientState as OceanState, OceanMode, OceanPhase } from "../ocean-contract.js";
import { CAST_MAX_STRENGTH, CAST_MIN_STRENGTH } from "../cast-distance.js";

export type { FishSurfaceImpactCue } from "../fish-surface-impact.js";

export type FishingAudioEvent =
  | "cast" | "splash" | "bite" | "hook-set" | "hook-critical" | "rod-pump" | "line-slack"
  | "fight-rest" | "fight-surge" | "fight-warning" | "fight-split"
  | "fish-surface-first" | "fish-surface-breach" | "fish-surface-reentry"
  | "catch" | "escape" | "escape-missed" | "escape-line" | "escape-slack" | "escape-distance" | "retrieve";

type FishSplashTuning = {
  bodyFrequency: number;
  bodyPeak: number;
  bodyDuration: number;
  sprayFrequency: number;
  sprayPeak: number;
  sprayDuration: number;
};

export type FishAudioTuning = {
  reelFrequency: number;
  dragFrequency: number;
  dragFilterFrequency: number;
  reelIntervalMs: number;
  reelGain: number;
  strainGain: number;
};

const MAX_ONE_SHOT_VOICES = 6;
const MAX_ONE_SHOT_GAIN = .22;
const ONE_SHOT_GAIN_BOOST = 3.2;
const OUTPUT_GAIN = .82;
const AMBIENT_GAIN = .022;
const BATTLE_MUSIC_GAIN = .012;
const BATTLE_MUSIC_CHORDS: readonly (readonly [number, number, number])[] = [
  [146.83, 174.61, 220],
  [116.54, 146.83, 174.61],
  [174.61, 220, 261.63],
  [130.81, 164.81, 196],
];

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

const getFishSplashTuning = (fishId: FishSpeciesId): FishSplashTuning => {
  if (fishId === "whale-001") {
    return { bodyFrequency: 84, bodyPeak: .031, bodyDuration: .42, sprayFrequency: 920, sprayPeak: .024, sprayDuration: .27 };
  }
  if (fishId === "k8s-001") {
    return { bodyFrequency: 68, bodyPeak: .038, bodyDuration: .48, sprayFrequency: 820, sprayPeak: .03, sprayDuration: .3 };
  }
  if (fishId === "rust-001") {
    return { bodyFrequency: 112, bodyPeak: .025, bodyDuration: .3, sprayFrequency: 1480, sprayPeak: .029, sprayDuration: .22 };
  }
  if (fishId === "css-001") {
    return { bodyFrequency: 184, bodyPeak: .011, bodyDuration: .18, sprayFrequency: 1420, sprayPeak: .015, sprayDuration: .14 };
  }
  if (fishId === "js-001") {
    return { bodyFrequency: 128, bodyPeak: .012, bodyDuration: .2, sprayFrequency: 1260, sprayPeak: .016, sprayDuration: .16 };
  }
  return { bodyFrequency: 156, bodyPeak: .015, bodyDuration: .22, sprayFrequency: 1180, sprayPeak: .017, sprayDuration: .16 };
};

export type FishSurfaceSoundKind = "first" | "breach" | "reentry";
export type FishSurfaceSoundProfile = FishSplashTuning & {
  bodyAttack: number;
  sprayDelay: number;
  introToneFrequency?: number;
  introToneDuration?: number;
  introTonePeak?: number;
};

/** Pure, bounded sound envelope for one fish crossing the water surface. */
export function fishSurfaceSoundProfile(
  fishId: FishSpeciesId,
  kind: FishSurfaceSoundKind,
  impactPower: number,
): FishSurfaceSoundProfile {
  const tuning = getFishSplashTuning(fishId);
  const impact = clamp((clamp(Number.isFinite(impactPower) ? impactPower : 1.5, 1.5, 2.7) - 1.5) / 1.2, 0, 1);
  const first = kind === "first";
  const reentry = kind === "reentry";
  const level = (first ? 1 : reentry ? .82 : .64) * (.9 + impact * .15);
  const bodyDuration = tuning.bodyDuration * (first ? 1.16 : reentry ? .86 : .62);
  const profile: FishSurfaceSoundProfile = {
    bodyFrequency: tuning.bodyFrequency,
    bodyPeak: tuning.bodyPeak * level,
    bodyDuration,
    bodyAttack: first ? .035 : .012,
    sprayFrequency: tuning.sprayFrequency,
    sprayPeak: tuning.sprayPeak * level,
    sprayDuration: tuning.sprayDuration * (first ? 1.08 : .82),
    sprayDelay: first ? .065 : .035,
  };
  if (first && (fishId === "whale-001" || fishId === "rust-001" || fishId === "k8s-001")) {
    profile.introToneFrequency = tuning.bodyFrequency;
    profile.introToneDuration = bodyDuration * .78;
    profile.introTonePeak = tuning.bodyPeak * level * .28;
  }
  return profile;
}

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
  private battleMusicGain: GainNode | null = null;
  private battleMusicFilters: BiquadFilterNode[] = [];
  private battleMusicVoices: OscillatorNode[] = [];
  private battleMusicVoiceGains: GainNode[] = [];
  private battleMusicStopTimer: number | null = null;
  private battleMusicProgressionTimer: number | null = null;
  private battleMusicProgressionIndex = 0;
  private battleMusicActive = false;
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
    if (!this.enabled) this.syncBattleMusic(false);
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

  sync(previous: OceanState, next: OceanState, allowBattleMusic = true): void {
    if (!this.enabled) {
      this.syncBattleMusic(false);
      return;
    }
    this.syncBattleMusic(allowBattleMusic && next.phase === "fighting");
    this.waterLapAmount = next.phase === "fighting" ? (next.tension >= .58 ? .3 : .44) : next.phase === "biting" ? .72 : 1;
    if (previous.phase !== next.phase) {
      const eventByPhase: Partial<Record<OceanPhase, FishingAudioEvent>> = {
        biting: "bite",
        caught: "catch",
        retrieving: "retrieve",
      };
      const event = eventByPhase[next.phase];
      if (event) this.play(event);
      if (next.phase === "casting") this.play("cast", next.strength);
      if (next.phase === "escaped") {
        const eventByReason: Partial<Record<OceanState["reason"], FishingAudioEvent>> = {
          missed: "escape-missed",
          line: "escape-line",
          slack: "escape-slack",
          distance: "escape-distance",
        };
        this.play(eventByReason[next.reason] ?? "escape");
      }
    }
    if (previous.phase === "biting" && next.phase === "fighting") {
      this.play(next.hookResult === "critical" ? "hook-critical" : "hook-set");
    }
    if (previous.phase === "fighting" && next.phase === "fighting") {
      const modeChanged = previous.mode !== next.mode;
      if (modeChanged) {
        const eventByMode: Partial<Record<OceanMode, FishingAudioEvent>> = {
          rest: "fight-rest",
          surge: "fight-surge",
          warning: "fight-warning",
          split: "fight-split",
        };
        const event = eventByMode[next.mode];
        if (event) this.play(event);
      }
      if (!modeChanged && previous.tension >= .42 && next.tension <= .32) this.play("line-slack");
    }
    this.syncLoops(next, (next.phase === "fighting" && next.reeling) || next.phase === "retrieving");
  }

  syncReeling(state: OceanState, active: boolean): void {
    if (!this.enabled) return;
    this.syncLoops(state, active && state.phase === "fighting");
  }

  play(event: FishingAudioEvent, amount = 1, fishId?: FishSpeciesId): void {
    if (!this.enabled) return;
    const context = this.context;
    const inputGain = this.inputGain;
    if (!context || !inputGain || this.activeVoices.size >= MAX_ONE_SHOT_VOICES) return;
    const now = context.currentTime + .004;
    const previous = this.lastEvents.get(event) ?? -Infinity;
    const cooldown = event === "splash" ? .14
      : event === "line-slack" ? 1.2
        : event.startsWith("fight-") ? .28
          : event.startsWith("fish-surface-") ? .2
            : .08;
    if (context.currentTime - previous < cooldown) return;
    this.lastEvents.set(event, context.currentTime);

    if (event === "cast") {
      // Cast force shapes the line swish; the separate landing callback supplies the splash.
      const strength = clamp(
        (clamp(Number.isFinite(amount) ? amount : CAST_MIN_STRENGTH, CAST_MIN_STRENGTH, CAST_MAX_STRENGTH) - CAST_MIN_STRENGTH)
          / (CAST_MAX_STRENGTH - CAST_MIN_STRENGTH),
        0,
        1,
      );
      const duration = .22 + strength * .18;
      this.playNoise(now, duration, 1250 + strength * 800, .022 + strength * .01, 420 + strength * 180, .012 + strength * .01);
      this.playTone(now, 104 + strength * 42, 76 + strength * 20, .17 + strength * .12, .009 + strength * .006, "triangle", .02);
    } else if (event === "splash") {
      this.playNoise(now, .17, 520, .028, 760, .006);
      this.playNoise(now + .018, .105, 1560, .011, 920, .004);
      this.playTone(now, 118, 76, .12, .009, "sine", .004);
    } else if (event === "bite") {
      // Replace the alert-like rising beeps with a muted bobber/plop cue.
      this.playNoise(now, .082, 560, .027, 310, .004);
      this.playTone(now, 205, 148, .11, .013, "sine", .006);
    } else if (event === "hook-critical") {
      // A crisp double pluck gives the critical timing a distinct, still-soft confirmation.
      this.playTone(now, 620, 430, .105, .022, "triangle", .003);
      this.playTone(now + .026, 880, 650, .105, .013, "sine", .004);
      this.playNoise(now, .05, 1320, .012, 760, .002);
    } else if (event === "hook-set") {
      // A restrained lower pluck distinguishes a normal hook from the brighter critical cue.
      this.playTone(now, 278, 205, .13, .011, "sine", .006);
      this.playNoise(now, .06, 820, .009, 460, .004);
    } else if (event === "rod-pump") {
      this.playNoise(now, .095, 540, .009, 980, .012);
      this.playTone(now, 164, 126, .12, .008, "triangle", .01);
    } else if (event === "line-slack") {
      // A small descending line flick marks the return from a tight load.
      this.playNoise(now, .14, 1120, .01, 380, .008);
      this.playTone(now, 244, 116, .17, .009, "sine", .012);
    } else if (event === "fight-warning") {
      this.playNoise(now, .24, 390, .011, 210, .025);
      this.playTone(now, 116, 82, .22, .008, "triangle", .025);
    } else if (event === "fight-surge") {
      this.playNoise(now, .2, 510, .012, 1420, .018);
      this.playTone(now, 156, 232, .16, .008, "sine", .018);
    } else if (event === "fight-split") {
      this.playNoise(now, .12, 780, .01, 1380, .008);
      this.playNoise(now + .09, .13, 520, .008, 980, .008);
    } else if (event === "fight-rest") {
      this.playNoise(now, .16, 680, .006, 360, .025);
    } else if (event.startsWith("fish-surface-")) {
      const kind: FishSurfaceSoundKind = event === "fish-surface-first"
        ? "first"
        : event === "fish-surface-reentry" ? "reentry" : "breach";
      const profile = fishSurfaceSoundProfile(fishId ?? "fish-001", kind, amount);
      this.playNoise(
        now,
        profile.bodyDuration,
        profile.bodyFrequency,
        profile.bodyPeak,
        profile.bodyFrequency * 1.42,
        profile.bodyAttack,
      );
      this.playNoise(
        now + profile.sprayDelay,
        profile.sprayDuration,
        profile.sprayFrequency,
        profile.sprayPeak,
        profile.sprayFrequency * .72,
        .008,
      );
      if (profile.introToneFrequency !== undefined && profile.introToneDuration !== undefined && profile.introTonePeak !== undefined) {
        this.playTone(now, profile.introToneFrequency, profile.introToneFrequency * .78, profile.introToneDuration, profile.introTonePeak, "triangle", .025);
      }
    } else if (event === "escape-missed") {
      this.playNoise(now, .13, 620, .014, 280, .008);
      this.playTone(now, 188, 132, .16, .01, "sine", .012);
    } else if (event === "escape-line") {
      this.playNoise(now, .09, 2050, .026, 720, .002);
      this.playTone(now, 740, 190, .2, .02, "triangle", .002);
    } else if (event === "escape-slack") {
      this.playNoise(now, .18, 980, .013, 360, .012);
      this.playTone(now, 212, 104, .2, .011, "sine", .015);
    } else if (event === "escape-distance") {
      this.playNoise(now, .42, 940, .021, 260, .045);
      this.playTone(now, 318, 118, .36, .01, "sine", .04);
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

  playFishSurfaceImpact(cue: FishSurfaceImpactCue): void {
    const event: FishingAudioEvent = cue.transition === "reentry"
      ? "fish-surface-reentry"
      : cue.firstBreach ? "fish-surface-first" : "fish-surface-breach";
    this.play(event, cue.impactPower, cue.fishId);
  }

  private ensureBattleMusicGraph(): void {
    const context = this.context;
    const inputGain = this.inputGain;
    const firstChord = BATTLE_MUSIC_CHORDS[0];
    if (!context || !inputGain || !firstChord || this.battleMusicGain) return;

    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 85;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 520;
    const musicGain = context.createGain();
    musicGain.gain.value = 0;
    highpass.connect(lowpass);
    lowpass.connect(musicGain);
    musicGain.connect(inputGain);
    this.battleMusicFilters = [highpass, lowpass];
    this.battleMusicGain = musicGain;

    this.battleMusicVoices = firstChord.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = index === 2 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 1 ? 2 : index === 2 ? -2 : 0;
      voiceGain.gain.value = index === 2 ? .11 : .2;
      oscillator.connect(voiceGain);
      voiceGain.connect(highpass);
      oscillator.start();
      this.battleMusicVoiceGains.push(voiceGain);
      return oscillator;
    });
  }

  private syncBattleMusic(inFight: boolean): void {
    const active = this.enabled && inFight;
    if (!active && !this.battleMusicGain) return;
    if (active) this.ensureBattleMusicGraph();
    const context = this.context;
    const musicGain = this.battleMusicGain;
    if (!context || !musicGain || this.battleMusicActive === active) return;

    if (this.battleMusicStopTimer !== null) window.clearTimeout(this.battleMusicStopTimer);
    this.battleMusicStopTimer = null;
    this.battleMusicActive = active;
    const now = context.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(active ? BATTLE_MUSIC_GAIN : 0, now, active ? .45 : .65);

    if (active) {
      if (this.battleMusicProgressionTimer === null) {
        this.battleMusicProgressionTimer = window.setInterval(() => {
          if (!this.battleMusicActive || context.state !== "running") return;
          this.battleMusicProgressionIndex = (this.battleMusicProgressionIndex + 1) % BATTLE_MUSIC_CHORDS.length;
          const chord = BATTLE_MUSIC_CHORDS[this.battleMusicProgressionIndex];
          if (!chord) return;
          const time = context.currentTime;
          chord.forEach((frequency, index) => {
            const voice = this.battleMusicVoices[index];
            if (voice) voice.frequency.setTargetAtTime(frequency, time, 1.4);
          });
        }, 6500);
      }
      return;
    }

    this.battleMusicStopTimer = window.setTimeout(() => {
      this.battleMusicStopTimer = null;
      if (this.battleMusicActive || this.battleMusicProgressionTimer === null) return;
      window.clearInterval(this.battleMusicProgressionTimer);
      this.battleMusicProgressionTimer = null;
      this.battleMusicProgressionIndex = 0;
      const time = context.currentTime;
      BATTLE_MUSIC_CHORDS[0]?.forEach((frequency, index) => {
        const voice = this.battleMusicVoices[index];
        if (voice) voice.frequency.setTargetAtTime(frequency, time, .2);
      });
    }, 2200);
  }

  private disposeBattleMusic(): void {
    if (this.battleMusicStopTimer !== null) window.clearTimeout(this.battleMusicStopTimer);
    if (this.battleMusicProgressionTimer !== null) window.clearInterval(this.battleMusicProgressionTimer);
    this.battleMusicStopTimer = null;
    this.battleMusicProgressionTimer = null;
    this.battleMusicActive = false;
    this.battleMusicVoices.forEach(voice => {
      try { voice.stop(); } catch { /* The audio context may already be closing. */ }
      voice.disconnect();
    });
    this.battleMusicVoiceGains.forEach(gain => gain.disconnect());
    this.battleMusicFilters.forEach(filter => filter.disconnect());
    this.battleMusicGain?.disconnect();
    this.battleMusicVoices = [];
    this.battleMusicVoiceGains = [];
    this.battleMusicFilters = [];
    this.battleMusicGain = null;
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
    this.disposeBattleMusic();
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
    if (!context || context.state !== "running" || this.activeVoices.size >= MAX_ONE_SHOT_VOICES - 2) return;
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
    // playNoise/playTone apply the shared gain boost and safety clamp once.
    const gain = tuning.reelGain * this.reelAmount;
    this.playNoise(now, .036, 1250 + tuning.reelFrequency, gain, 900, .0025);
    this.playTone(now, tuning.reelFrequency, tuning.reelFrequency * .88, .032, gain * .48, "triangle", .0025);
  }

  private playDragPulse(): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const now = context.currentTime + .004;
    const tuning = this.dragTuning;
    const amount = this.dragAmount;
    // Keep this raw for the same single clamp in each voice's playback method.
    const gain = tuning.strainGain * amount;
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
