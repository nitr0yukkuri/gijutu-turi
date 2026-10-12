import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { castStrengthFromSwing, CastMotionGesture, isScreenReelBlockingMotion, ReelMotionGesture, reelAngularSignal } from "./cast-motion.js";
import { PhonePullMotion } from "./phone-pull-motion.js";
import { UpwardHookMotion } from "./upward-hook-motion.js";
import type { OceanCommand } from "../ocean-contract.js";
import type { OceanState } from "./types.js";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

type UsePhoneMotionOptions = {
  stateRef: MutableRefObject<OceanState>;
  onlineRef: MutableRefObject<boolean>;
  reelHeldRef: MutableRefObject<boolean>;
  motionReelRef: MutableRefObject<boolean>;
  cast: (strength?: number, direction?: number) => void;
  send: (command: OceanCommand) => boolean;
  startReel: () => void;
  stopReel: () => void;
  performPhonePull: () => void;
  showToast: (text: string) => void;
};

const MOTION_INSTRUCTIONS = "アタリでは下から上へ振って合わせます。戦闘中は画面を自分に向け、遠くから手前へ引くと短く巻きます。";

export function usePhoneMotion({ stateRef, onlineRef, reelHeldRef, motionReelRef, cast, send, startReel, stopReel, performPhonePull, showToast }: UsePhoneMotionOptions) {
  const [sensorStatus, setSensorStatus] = useState(MOTION_INSTRUCTIONS);
  const [sensorButtonLabel, setSensorButtonLabel] = useState("モーション操作を有効にする");
  const [sensorsOn, setSensorsOn] = useState(false);
  const sensorTimerRef = useRef<number | null>(null);
  const sensorSamplesRef = useRef(0);
  const lastGestureRef = useRef(0);
  const gravityRef = useRef({ x: 0, y: 0, z: 0 });
  const gravitySampleAtRef = useRef(0);
  const gravityInitializedRef = useRef(false);
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const phonePullMotionRef = useRef(new PhonePullMotion());
  const upwardHookMotionRef = useRef(new UpwardHookMotion());
  const castGestureRef = useRef(new CastMotionGesture());
  const reelMotionGestureRef = useRef(new ReelMotionGesture());

  const toggleSensor = useCallback(async () => {
    if (sensorsOn) { showToast("釣り竿センサーは有効です。狙って一度振ってください。"); return; }
    try {
      if (!window.isSecureContext || !window.DeviceMotionEvent) { setSensorStatus("センサーが使えない環境です。下のボタンで投げられます。"); return; }
      const motionApi = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof motionApi.requestPermission === "function" && await motionApi.requestPermission() !== "granted") { setSensorStatus("センサーは許可されていません。タッチ操作で遊べます。"); return; }
      sensorSamplesRef.current = 0;
      gravitySampleAtRef.current = 0;
      gravityInitializedRef.current = false;
      castGestureRef.current.reset();
      upwardHookMotionRef.current.reset();
      reelMotionGestureRef.current.reset();
      phonePullMotionRef.current.reset();
      if (sensorTimerRef.current !== null) window.clearTimeout(sensorTimerRef.current);
      const motion = (event: DeviceMotionEvent) => {
        if (document.hidden) {
          castGestureRef.current.reset();
          upwardHookMotionRef.current.reset();
          reelMotionGestureRef.current.reset();
          phonePullMotionRef.current.reset();
          if (motionReelRef.current) stopReel();
          return;
        }
        const linear = event.acceleration;
        const hasLinear = Boolean(linear && [linear.x, linear.y, linear.z].every(Number.isFinite));
        const raw = hasLinear ? linear : event.accelerationIncludingGravity;
        if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number" || typeof raw.z !== "number" || ![raw.x, raw.y, raw.z].every(Number.isFinite)) return;
        sensorSamplesRef.current += 1;
        if (sensorSamplesRef.current === 1) { setSensorStatus(MOTION_INSTRUCTIONS); setSensorButtonLabel("モーション操作は有効です"); }
        let { x, y, z } = raw;
        const now = performance.now();
        if (!hasLinear) {
          const gravity = gravityRef.current;
          if (!gravityInitializedRef.current) {
            gravity.x = x; gravity.y = y; gravity.z = z;
            gravityInitializedRef.current = true;
            x = 0; y = 0; z = 0;
          } else {
            const elapsed = gravitySampleAtRef.current === 0 ? 1 / 60 : clamp((now - gravitySampleAtRef.current) / 1000, .005, .1);
            const alpha = 1 - Math.exp(-elapsed / .1);
            gravity.x += (x - gravity.x) * alpha; gravity.y += (y - gravity.y) * alpha; gravity.z += (z - gravity.z) * alpha;
            x -= gravity.x; y -= gravity.y; z -= gravity.z;
          }
          gravitySampleAtRef.current = now;
        }
        const acceleration = Math.hypot(x, y, z);
        const rate = event.rotationRate;
        const hasRotationRate = Boolean(rate && [rate.alpha, rate.beta, rate.gamma].every(Number.isFinite));
        const castRotationRate = hasRotationRate
          ? { alpha: rate?.alpha ?? 0, beta: rate?.beta ?? 0, gamma: rate?.gamma ?? 0 }
          : undefined;
        const angularSpeed = castRotationRate
          ? Math.hypot(castRotationRate.alpha, castRotationRate.beta, castRotationRate.gamma)
          : 0;
        const phase = stateRef.current.phase;
        if (!(phase === "idle" || phase === "biting" || phase === "fighting") || !onlineRef.current || now - lastGestureRef.current < 700 && phase !== "fighting") {
          castGestureRef.current.reset();
          upwardHookMotionRef.current.reset();
          reelMotionGestureRef.current.reset();
          phonePullMotionRef.current.reset();
          if (motionReelRef.current) stopReel();
          return;
        }
        if (phase === "fighting") {
          castGestureRef.current.reset();
          upwardHookMotionRef.current.reset();
          const rotation = reelAngularSignal(rate?.alpha ?? null, rate?.beta ?? null, rate?.gamma ?? null);
          const canRecognizePhonePull = !reelHeldRef.current;
          if (!canRecognizePhonePull) phonePullMotionRef.current.reset();
          else {
            if (phonePullMotionRef.current.update({ x, y, z }, now)) {
              performPhonePull();
              lastGestureRef.current = now;
              reelMotionGestureRef.current.reset();
              return;
            }
            if (phonePullMotionRef.current.isPending(now)) {
              reelMotionGestureRef.current.reset();
              return;
            }
          }
          if (isScreenReelBlockingMotion(reelHeldRef.current, motionReelRef.current)) {
            reelMotionGestureRef.current.reset();
            return;
          }
          const reelGesture = reelMotionGestureRef.current.update(rotation, now);
          if (reelGesture === "start") {
            // Motion owns the lease only when it started it. This prevents a
            // sensor sample from stopping a reel held by the screen control.
            motionReelRef.current = true;
            startReel();
          } else if (motionReelRef.current && reelGesture === "stop") {
            stopReel();
          }
          return;
        }
        if (phase === "biting") {
          castGestureRef.current.reset();
          phonePullMotionRef.current.reset();
          reelMotionGestureRef.current.reset();
          if (upwardHookMotionRef.current.update({ x, y, z }, now)) {
            if (send({ action: "hook" })) lastGestureRef.current = now;
          }
          return;
        }
        upwardHookMotionRef.current.reset();
        phonePullMotionRef.current.reset();
        reelMotionGestureRef.current.reset();
        const gesture = castGestureRef.current.update(acceleration, angularSpeed, now, castRotationRate);
        if (gesture) {
          cast(castStrengthFromSwing(gesture.acceleration, gesture.angularSpeed, gesture.swingAngle), 0);
          lastGestureRef.current = now;
        }
      };
      motionListenerRef.current = motion;
      window.addEventListener("devicemotion", motion);
      setSensorsOn(true); setSensorButtonLabel("モーション操作を確認しています");
      sensorTimerRef.current = window.setTimeout(() => {
        sensorTimerRef.current = null;
        if (sensorSamplesRef.current === 0) {
          window.removeEventListener("devicemotion", motion);
          motionListenerRef.current = null;
          setSensorsOn(false);
          setSensorStatus("センサーの動きを取得できません。もう一度試すか、タッチで投げられます。");
          setSensorButtonLabel("センサーを再試行");
        }
        else setSensorButtonLabel("モーション操作は有効です");
      }, 2500);
    } catch { setSensorStatus("センサーを開始できません。タッチで投げられます。"); }
  }, [cast, motionReelRef, onlineRef, performPhonePull, reelHeldRef, send, sensorsOn, showToast, startReel, stateRef, stopReel]);

  useEffect(() => () => {
    if (motionListenerRef.current) window.removeEventListener("devicemotion", motionListenerRef.current);
    if (sensorTimerRef.current !== null) window.clearTimeout(sensorTimerRef.current);
  }, []);

  return { sensorStatus, sensorButtonLabel, sensorsOn, toggleSensor };
}
