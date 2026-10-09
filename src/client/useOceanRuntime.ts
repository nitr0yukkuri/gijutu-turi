import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { isOceanMessage } from "../ocean-contract.js";
import { FishingAudioController } from "../audio/fishing-audio.js";
import type { FishSurfaceImpactCue } from "../fish-surface-impact.js";
import { CastMotionGesture, ReelMotionGesture, castStrengthFromMotion, isScreenReelBlockingMotion, reelAngularSignal } from "./cast-motion.js";
import { createControllerLink, isLoopbackHost } from "./controller-url.js";
import { RodStrokeMotion } from "./rod-stroke-motion.js";
import { fetchCollection, type CollectionLoadResult } from "./collection-response.js";
import { LatestRequestGuard } from "./latest-request.js";
import { CAST_MAX_STRENGTH, CAST_MIN_STRENGTH } from "../cast-distance.js";
import { OCEAN_RENDER_DELAY_MS } from "../ocean-timing.js";
import { OceanPresentationTimeline } from "../ocean-presentation-timeline.js";
import { FISH_SPECIES, type FishSpeciesId } from "../fish-species.js";
import { isFirstCatch } from "./catch-discovery.js";
import { FISH_ESCAPE_HINTS } from "./escape-hints.js";
import type { CatchSaveStatus, Collection, CollectionEntry, Feedback, OceanMessage, OceanSceneController, OceanState, Reticle } from "./types.js";

const configuredBackendUrl = (import.meta.env.VITE_BACKEND_URL ?? "").trim().replace(/\/+$/, "");
const staticRouteMode = import.meta.env.VITE_STATIC_ROUTE_MODE === "query";
const backendUrl = (path: string): string => configuredBackendUrl ? `${configuredBackendUrl}${path}` : path;
const roomFishStorageKey = "gijutu.ocean-room-fish";
const COLLECTION_LOAD_ERROR_MESSAGE = "図鑑を読み込めません。DBとの接続を確認してください。";
const staticFishQueryById: Partial<Record<FishSpeciesId, string>> = {
  "fish-001": "gofish",
  "whale-001": "docker",
  "css-001": "cssfish",
  "k8s-001": "k8sfish",
  "rust-001": "rustfish",
  "js-001": "jseel",
};

class OceanRoomRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("ocean_room_rate_limited");
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const fallbackCatalog: CollectionEntry[] = FISH_SPECIES.map(species => ({
  ...species,
  status: "unknown" as const,
  catches: 0,
  firstCaughtAt: null,
  lastCaughtAt: null,
}));

const createPlayerId = (): string => {
  try {
    const key = "gijutu.player-id";
    let value = localStorage.getItem(key);
    if (!value) {
      const uuid = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replaceAll("-", "")
        : `${Date.now()}${Math.random().toString(36).slice(2)}`;
      value = `player_${uuid}`;
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return `player_${Date.now()}${Math.random().toString(36).slice(2)}`;
  }
};

const initialCollection = (caught: boolean): Collection => ({
  entries: fallbackCatalog.map(entry => entry.id === "fish-001" && caught ? { ...entry, status: "caught", catches: 1 } : { ...entry }),
  registered: caught ? 1 : 0,
  activeTotal: fallbackCatalog.length,
  catalogTotal: fallbackCatalog.length,
});

const initialState = (): OceanState => ({
  phase: "idle", revision: 0, strength: .65, aim: 0, castAt: 0, retrieveAt: 0,
  tension: 0, distance: 0, reeling: false, mode: "rest", catches: 0, reason: "", resultAt: 0, approach: 0,
  stamina: 1, canReel: false, fightTime: 0, fishX: 0, fishSpeed: 0, school: 1,
  criticalWindow: false, hookResult: null, fishId: "fish-001",
});

type UseOceanRuntimeOptions = {
  isPhone: boolean;
  controllerId: string | null;
  initialFishId?: FishSpeciesId;
  routePath: string;
  oceanMountRef: RefObject<HTMLDivElement | null>;
  collectionOpen: boolean;
};

export function useOceanRuntime({ isPhone, controllerId, initialFishId, routePath, oceanMountRef, collectionOpen }: UseOceanRuntimeOptions) {
  // Include the selection policy in the cache key so a room created before
  // fish-specific routes became fixed cannot be reused after the fix.
  const roomFishKey = initialFishId ? `fixed:${initialFishId}` : "rotate";
  const [state, setState] = useState<OceanState>(initialState);
  const [presentationState, setPresentationState] = useState<OceanState>(initialState);
  const presentationTimelineRef = useRef(new OceanPresentationTimeline(OCEAN_RENDER_DELAY_MS));
  const stateRef = useRef(state);
  const [online, setOnline] = useState(false);
  const onlineRef = useRef(false);
  const [displayConnected, setDisplayConnected] = useState(true);
  const displayConnectedRef = useRef(true);
  const [renderFailed, setRenderFailed] = useState(false);
  const [reelHeld, setReelHeld] = useState(false);
  const reelHeldRef = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>({ text: "", detail: "", faded: false });
  const [hookFeedback, setHookFeedback] = useState(false);
  const [rodStrokeRevision, setRodStrokeRevision] = useState(0);
  const [toast, setToast] = useState("");
  const [chargeProgress, setChargeProgress] = useState(0);
  const [reticle, setReticle] = useState<Reticle>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);
  const [collection, setCollection] = useState<Collection>(() => initialCollection(false));
  const collectionRef = useRef(collection);
  const collectionRequestGuardRef = useRef(new LatestRequestGuard());
  const [newEncounter, setNewEncounter] = useState(false);
  const [catchSaveStatus, setCatchSaveStatus] = useState<CatchSaveStatus>("none");
  const catchSaveStatusRef = useRef<CatchSaveStatus>("none");
  const [selectedCollectionId, setSelectedCollectionId] = useState("fish-001");
  const [controllerUrl, setControllerUrl] = useState("");
  const [controllerHost, setControllerHost] = useState("");
  const [controllerUrlError, setControllerUrlError] = useState("");
  const [sensorStatus, setSensorStatus] = useState("投げるときは狙って一度振り、魚が掛かったらスマホを回します。");
  const [sensorButtonLabel, setSensorButtonLabel] = useState("モーション操作を有効にする");
  const [sensorsOn, setSensorsOn] = useState(false);

  const sceneRef = useRef<OceanSceneController | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const closingRef = useRef(false);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const hiddenCloseTimerRef = useRef<number | null>(null);
  const pausedForVisibilityRef = useRef(false);
  const chargeAtRef = useRef<number | null>(null);
  const chargeFrameRef = useRef<number | null>(null);
  const reelTimerRef = useRef<number | null>(null);
  const aimRef = useRef(0);
  const lastVibrationRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const hookFeedbackTimerRef = useRef<number | null>(null);
  const playerIdRef = useRef(createPlayerId());
  const fishingAudioRef = useRef<FishingAudioController | null>(null);
  const sensorTimerRef = useRef<number | null>(null);
  const sensorSamplesRef = useRef(0);
  const lastGestureRef = useRef(0);
  const gravityRef = useRef({ x: 0, y: 0, z: 0 });
  const gravitySampleAtRef = useRef(0);
  const warmupRef = useRef(0);
  const motionReelRef = useRef(false);
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const rodStrokeMotionRef = useRef(new RodStrokeMotion());
  const castGestureRef = useRef(new CastMotionGesture());
  const reelMotionGestureRef = useRef(new ReelMotionGesture());
  const receivedRodStrokeRef = useRef<number | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { displayConnectedRef.current = displayConnected; }, [displayConnected]);
  useEffect(() => { reelHeldRef.current = reelHeld; }, [reelHeld]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 3500);
  }, []);

  const showFeedback = useCallback((text: string, detail = "", fade = 0) => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ text, detail, faded: false });
    if (fade) feedbackTimerRef.current = window.setTimeout(() => setFeedback(previous => ({ ...previous, faded: true })), fade);
  }, []);

  const showHookFeedback = useCallback((visible: boolean) => {
    if (hookFeedbackTimerRef.current !== null) window.clearTimeout(hookFeedbackTimerRef.current);
    hookFeedbackTimerRef.current = null;
    setHookFeedback(visible);
    if (visible) hookFeedbackTimerRef.current = window.setTimeout(() => {
      hookFeedbackTimerRef.current = null;
      setHookFeedback(false);
    }, 850);
  }, []);

  const vibrate = useCallback((pattern: number | number[]) => {
    if (isPhone && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  }, [isPhone]);

  const getFishingAudio = useCallback(() => {
    if (!fishingAudioRef.current) fishingAudioRef.current = new FishingAudioController();
    return fishingAudioRef.current;
  }, []);

  const stopReel = useCallback(() => {
    if (reelHeldRef.current && socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ action: "reel", held: false }));
    setReelHeld(false);
    if (reelTimerRef.current !== null) window.clearInterval(reelTimerRef.current);
    reelTimerRef.current = null;
    motionReelRef.current = false;
    fishingAudioRef.current?.syncReeling(stateRef.current, false);
  }, [getFishingAudio]);

  const cancelCharge = useCallback(() => {
    chargeAtRef.current = null;
    if (chargeFrameRef.current !== null) cancelAnimationFrame(chargeFrameRef.current);
    chargeFrameRef.current = null;
    setChargeProgress(0);
    setReticle(null);
    sceneRef.current?.setCharge(0);
  }, []);

  const setConnected = useCallback((value: boolean) => {
    setOnline(value);
    if (!value) {
      stopReel();
      cancelCharge();
    }
  }, [cancelCharge, stopReel]);

  const toggleSound = useCallback(async () => {
    const next = await getFishingAudio().toggle();
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    if (next) getFishingAudio().sync(stateRef.current, stateRef.current, !isPhone);
  }, [getFishingAudio, isPhone]);

  const loadCollection = useCallback(async (): Promise<{ result: CollectionLoadResult; revision: number }> => {
    const revision = collectionRequestGuardRef.current.begin();
    const result = await fetchCollection(`${backendUrl("/api/collection")}?playerId=${encodeURIComponent(playerIdRef.current)}`);
    if (result.ok && collectionRequestGuardRef.current.isCurrent(revision)) {
      collectionRef.current = result.value;
      setCollection(result.value);
    }
    return { result, revision };
  }, []);

  const send = useCallback((action: object): boolean => {
    if (!onlineRef.current || socketRef.current?.readyState !== WebSocket.OPEN) {
      showToast("海との接続を確認してください。");
      return false;
    }
    socketRef.current.send(JSON.stringify(action));
    return true;
  }, [showToast]);

  const cast = useCallback((strength = .65, direction = aimRef.current) => {
    const current = stateRef.current;
    if (current.phase !== "idle" || renderFailed || (isPhone && !displayConnectedRef.current)) return;
    send({ action: "cast", strength: clamp(strength, CAST_MIN_STRENGTH, CAST_MAX_STRENGTH), aim: clamp(direction, -1, 1) });
  }, [isPhone, renderFailed, send]);

  const startCharge = useCallback(() => {
    if (!onlineRef.current || stateRef.current.phase !== "idle" || chargeAtRef.current !== null) return;
    chargeAtRef.current = performance.now();
    const update = () => {
      if (chargeAtRef.current === null) return;
      const power = clamp((performance.now() - chargeAtRef.current) / 1100, CAST_MIN_STRENGTH, CAST_MAX_STRENGTH);
      setChargeProgress(power);
      sceneRef.current?.setCharge(power, aimRef.current);
      const point = sceneRef.current?.aimScreen(aimRef.current, power);
      if (point) setReticle(point);
      chargeFrameRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const releaseCharge = useCallback(() => {
    if (chargeAtRef.current === null) return;
    const power = clamp((performance.now() - chargeAtRef.current) / 1100, CAST_MIN_STRENGTH, CAST_MAX_STRENGTH);
    cancelCharge();
    cast(power);
  }, [cancelCharge, cast]);

  const startReel = useCallback(() => {
    if (reelHeldRef.current || stateRef.current.phase !== "fighting" || !onlineRef.current || (isPhone && !displayConnectedRef.current)) return;
    setReelHeld(true);
    reelHeldRef.current = true;
    fishingAudioRef.current?.syncReeling(stateRef.current, true);
    send({ action: "reel", held: true });
    reelTimerRef.current = window.setInterval(() => {
      if (onlineRef.current && stateRef.current.phase === "fighting") send({ action: "reel", held: true });
      else stopReel();
    }, 120);
  }, [getFishingAudio, isPhone, send, stopReel]);

  const performRodStroke = useCallback(() => {
    if (stateRef.current.phase !== "fighting" || !onlineRef.current || (isPhone && !displayConnectedRef.current)) return;
    if (send({ action: "rod-pump" }) && isPhone) vibrate(18);
  }, [isPhone, send, vibrate]);

  const activate = useCallback(() => {
    const phase = stateRef.current.phase;
    if (phase === "biting") send({ action: "hook" });
    else if (phase === "waiting") send({ action: "retrieve" });
    else if (phase === "caught" || phase === "escaped") send({ action: "reset" });
    else if (phase === "fighting") { if (reelHeldRef.current) stopReel(); else startReel(); }
    else cast();
  }, [cast, send, startReel, stopReel]);

  const retryCatchSave = useCallback(() => {
    if (stateRef.current.phase === "caught" && catchSaveStatusRef.current === "failed") {
      send({ action: "retry-catch-save" });
    }
  }, [send]);

  const applyState = useCallback((message: OceanMessage) => {
    const previous = stateRef.current;
    const next = message.state;
    const previousCatchSaveStatus = catchSaveStatusRef.current;
    const nextCatchSaveStatus = message.catchSaveStatus ?? (next.phase === "caught" ? "saved" : "none");
    presentationTimelineRef.current.push(next, message.serverNow);
    catchSaveStatusRef.current = nextCatchSaveStatus;
    setCatchSaveStatus(nextCatchSaveStatus);
    stateRef.current = next;
    setState(next);
    setDisplayConnected(message.displays > 0);
    displayConnectedRef.current = message.displays > 0;
    fishingAudioRef.current?.sync(previous, next, !isPhone);
    sceneRef.current?.setState(next, message.serverNow);
    if (Number.isSafeInteger(message.rodStroke) && (message.rodStroke ?? 0) >= 0) {
      const previousRodStroke = receivedRodStrokeRef.current;
      if (previousRodStroke !== null && (message.rodStroke ?? 0) > previousRodStroke) {
        const newStrokes = Math.min(4, (message.rodStroke ?? 0) - previousRodStroke);
        for (let index = 0; index < newStrokes; index++) {
          sceneRef.current?.rodStroke?.();
          fishingAudioRef.current?.play("rod-pump");
        }
        setRodStrokeRevision(revision => revision + newStrokes);
      }
      receivedRodStrokeRef.current = message.rodStroke ?? 0;
    }
    setConnected(true);
    if (next.phase !== "fighting") stopReel();
    if (previous.phase !== next.phase) {
      cancelCharge();
      if (next.phase === "idle") showFeedback("");
      if (next.phase === "casting") showFeedback("");
      if (next.phase === "waiting") showFeedback("アタリを、待つ。", "ウキが沈んだら合わせる", 2200);
      if (next.phase === "biting") vibrate([90, 60, 90]);
      if (next.phase === "fighting") {
        showFeedback("");
        const criticalHook = previous.phase === "biting" && next.hookResult === "critical";
        showHookFeedback(criticalHook);
        vibrate(criticalHook ? [35, 25, 55] : 80);
        lastVibrationRef.current = Date.now();
      }
      if (next.phase === "caught") {
        setNewEncounter(false);
        setSelectedCollectionId(next.fishId);
        showFeedback(""); vibrate([90, 90, 180]);
      }
      if (next.phase === "escaped") {
        const [title, hint] = FISH_ESCAPE_HINTS[next.reason] ?? ["魚が逃げました。", "糸の張りを見ながら巻き、強く引かれたらいったん緩めてください。"];
        showFeedback(title, hint); vibrate([160, 80, 60]);
      }
    }
    if (next.phase === "caught" && nextCatchSaveStatus === "saved" && previousCatchSaveStatus !== "saved" && !isPhone) {
      // Persistence belongs to the room. The display reloads only after the
      // server confirms the write, and never submits a duplicate catch.
      const previousCatches = collectionRef.current.entries.find(entry => entry.id === next.fishId)?.catches ?? 0;
      void loadCollection().then(({ result, revision }) => {
        if (!collectionRequestGuardRef.current.isCurrent(revision)) return;
        if (!result.ok) { showToast(COLLECTION_LOAD_ERROR_MESSAGE); return; }
        const loaded = result.value;
        const caughtEntry = loaded.entries.find(entry => entry.id === next.fishId);
        const currentCatches = caughtEntry?.catches ?? previousCatches;
        const firstCatch = isFirstCatch(previousCatches, currentCatches);
        setNewEncounter(firstCatch);
        showToast(firstCatch ? "新しい魚が図鑑に登録されました。" : "魚を釣り上げました。");
      });
    }
    const now = Date.now();
    if (next.phase === "fighting" && previous.phase !== "fighting" && next.fishId === "k8s-001" && next.mode === "warning") {
      // The leviathan's first warning is its encounter reveal, not a routine
      // mode change; give the connected phone one restrained arrival pulse.
      vibrate([42, 58, 96]);
      lastVibrationRef.current = now;
    } else if (next.phase === "fighting" && previous.phase === "fighting" && previous.mode !== next.mode) {
      if (next.mode === "surge") vibrate([38, 34, 62]);
      else if (next.mode === "warning") vibrate([24, 42, 24]);
      else if (next.mode === "split") vibrate([55, 35, 55, 35, 85]);
      lastVibrationRef.current = now;
    }
    if (next.phase === "fighting" && next.tension >= .58) {
      const danger = clamp((next.tension - .58) / .42, 0, 1);
      const interval = 1250 - danger * 720;
      if (now - lastVibrationRef.current >= interval) {
        const pulse = Math.round(18 + danger * 38);
        vibrate(next.tension >= .94 ? [pulse, 32, pulse, 32, pulse] : pulse);
        lastVibrationRef.current = now;
      }
    }
  }, [cancelCharge, getFishingAudio, isPhone, loadCollection, setConnected, showFeedback, showHookFeedback, showToast, stopReel, vibrate]);

  const presentationActive = ["casting", "waiting", "biting", "fighting"].includes(state.phase);
  useEffect(() => {
    if (!presentationActive) return;
    const update = () => {
      const sampled = presentationTimelineRef.current.sample();
      if (sampled) setPresentationState(sampled);
    };
    update();
    const timer = window.setInterval(update, 1000 / 30);
    return () => window.clearInterval(timer);
  }, [presentationActive]);

  const getRoom = useCallback(async (): Promise<{ id: string; host?: string }> => {
    if (isPhone) return { id: controllerId ?? "" };
    const stored = sessionStorage.getItem("gijutu.ocean-room");
    const storedHost = sessionStorage.getItem("gijutu.ocean-host-v2") ?? undefined;
    const storedFish = sessionStorage.getItem(roomFishStorageKey);
    if (stored && storedHost && !isLoopbackHost(storedHost) && storedFish === roomFishKey) return { id: stored, host: storedHost };
    if (stored) sessionStorage.removeItem("gijutu.ocean-room");
    if (storedHost) sessionStorage.removeItem("gijutu.ocean-host-v2");
    if (storedFish) sessionStorage.removeItem(roomFishStorageKey);
    const response = await fetch(backendUrl("/api/ocean-sessions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: playerIdRef.current, ...(initialFishId ? { fishId: initialFishId } : {}) }),
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      throw new OceanRoomRateLimitError(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60);
    }
    if (!response.ok) throw new Error("room");
    const result = await response.json() as { id: string; host?: string };
    sessionStorage.setItem("gijutu.ocean-room", result.id);
    sessionStorage.setItem(roomFishStorageKey, roomFishKey);
    if (result.host) sessionStorage.setItem("gijutu.ocean-host-v2", result.host);
    return result;
  }, [controllerId, initialFishId, isPhone, roomFishKey]);

  const connect = useCallback(async () => {
    const scheduleRetry = (message: string, retryAfterMs?: number) => {
      if (closingRef.current || pausedForVisibilityRef.current || retryTimerRef.current !== null) return;
      const attempt = retriesRef.current++;
      const backoff = Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000) + Math.floor(Math.random() * 500);
      const delay = retryAfterMs === undefined ? backoff : Math.max(1000, retryAfterMs);
      if (attempt === 0 || retryAfterMs !== undefined) showToast(message);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void connect();
      }, delay);
    };
    try {
      const room = await getRoom();
      if (closingRef.current || pausedForVisibilityRef.current) return;
      const nextRoomId = room.id;
      if (!/^sea_[a-f0-9]{32}$/.test(nextRoomId)) throw new Error("link");
      if (!isPhone) {
        const phoneLink = createControllerLink(
          window.location.origin,
          routePath,
          nextRoomId,
          configuredBackendUrl ? undefined : room.host,
          staticRouteMode ? { routeMode: "query", fishQuery: initialFishId ? staticFishQueryById[initialFishId] : undefined } : undefined,
        );
        if (phoneLink) {
          setControllerHost(phoneLink.host);
          setControllerUrl(phoneLink.href);
          setControllerUrlError("");
        } else {
          setControllerHost("");
          setControllerUrl("");
          setControllerUrlError("PCのLANアドレスを取得できません。PCとスマホを同じWi-Fiへ接続し、開発サーバーとファイアウォールを確認してください。");
        }
      }
      const url = configuredBackendUrl
        ? new URL(`${configuredBackendUrl}/ocean-ws`)
        : new URL("./ocean-ws", window.location.href);
      url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("room", nextRoomId);
      url.searchParams.set("role", isPhone ? "controller" : "display");
      const socket = new WebSocket(url);
      socketRef.current = socket;
      let opened = false;
      socket.addEventListener("open", () => { opened = true; retriesRef.current = 0; });
      socket.addEventListener("message", event => {
        if (socketRef.current !== socket) return;
        try {
          const message: unknown = JSON.parse(event.data);
          if (isOceanMessage(message)) applyState(message);
        } catch { showToast("海の状態を読み込めませんでした。"); }
      });
      socket.addEventListener("close", () => {
        // A visibility resume may open a replacement before the old close
        // event arrives. Stale sockets must not flip the new connection offline
        // or schedule another reconnect loop.
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnected(false);
        if (pausedForVisibilityRef.current) return;
        if (closingRef.current) return;
        if (!opened && !isPhone && retriesRef.current >= 2) {
          // If a room vanished during a backend restart, retry the same room
          // briefly, then create a fresh room instead of reconnecting forever.
          sessionStorage.removeItem("gijutu.ocean-room");
          sessionStorage.removeItem("gijutu.ocean-host-v2");
          sessionStorage.removeItem(roomFishStorageKey);
        }
        scheduleRetry(isPhone ? "接続を再試行しています。接続できない場合は海の画面から新しいURLを開いてください。" : "接続が切れました。再接続しています。");
      });
      socket.addEventListener("error", () => {
        if (socketRef.current === socket) setConnected(false);
      });
    } catch (error) {
      setConnected(false);
      if (error instanceof OceanRoomRateLimitError) {
        const wait = Math.max(1, Math.ceil(error.retryAfterSeconds));
        scheduleRetry(`接続が集中しています。${wait}秒後に自動で再試行します。`, wait * 1000);
        return;
      }
      scheduleRetry("海に接続できません。再接続しています。");
    }
  }, [applyState, getRoom, isPhone, routePath, setConnected, showToast]);

  useEffect(() => {
    if (isPhone || !oceanMountRef.current) return;
    let disposed = false;
    let scene: OceanSceneController | null = null;
    void import("../rendering/ocean-scene.js").then(({ createOcean }) => {
      if (disposed || !oceanMountRef.current) return;
      try {
        scene = createOcean(oceanMountRef.current, {
          presentationTimeline: presentationTimelineRef.current,
          onLand: () => {
            fishingAudioRef.current?.play("splash");
          },
          onSurfaceImpact: (impact: FishSurfaceImpactCue) => {
            fishingAudioRef.current?.playFishSurfaceImpact(impact);
          },
          onRenderError: () => { if (!disposed) setRenderFailed(true); },
        }) as OceanSceneController;
        sceneRef.current = scene;
        // An unpinned room chooses its first species on the server. Do not
        // request the placeholder Go model before that authoritative snapshot
        // arrives, or a random Docker room downloads both species chunks.
        if (initialFishId) scene.setState({ ...stateRef.current, fishId: initialFishId });
      } catch (error) {
        console.error("Ocean rendering unavailable", error);
        setRenderFailed(true);
      }
    }).catch(error => {
      if (disposed) return;
      console.error("Ocean rendering unavailable", error);
      setRenderFailed(true);
    });
    return () => {
      disposed = true;
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [getFishingAudio, initialFishId, isPhone, oceanMountRef]);

  useEffect(() => { sceneRef.current?.setOverlayOpen?.(collectionOpen); }, [collectionOpen]);

  useEffect(() => {
    setConnected(false);
    closingRef.current = false;
    void connect();
    return () => {
      closingRef.current = true;
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      stopReel(); cancelCharge(); socketRef.current?.close(); socketRef.current = null;
    };
  }, [cancelCharge, connect, setConnected, stopReel]);

  useEffect(() => {
    void loadCollection().then(({ result, revision }) => {
      if (collectionRequestGuardRef.current.isCurrent(revision) && !result.ok) showToast(COLLECTION_LOAD_ERROR_MESSAGE);
    });
  }, [loadCollection, showToast]);

  useEffect(() => {
    const pointerMove = (event: globalThis.PointerEvent) => {
      if ((event.target as Element | null)?.closest("button,dialog")) return;
      aimRef.current = clamp((event.clientX / window.innerWidth - .5) * 1.7, -1, 1);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]") || document.activeElement?.matches("a,input,textarea")) return;
      if (event.code === "KeyR" && stateRef.current.phase === "fighting") { event.preventDefault(); startReel(); return; }
      if (event.code !== "Space" || isPhone) return;
      if (document.activeElement?.matches("button") && !document.activeElement?.matches("#cast-button,#fight-button")) return;
      event.preventDefault(); if (event.repeat) return;
      if (stateRef.current.phase === "fighting") startReel(); else if (stateRef.current.phase === "idle") startCharge(); else activate();
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === "Space") { releaseCharge(); stopReel(); } if (event.code === "KeyR") stopReel(); };
    const blur = () => { cancelCharge(); stopReel(); };
    document.addEventListener("pointermove", pointerMove);
    document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp); window.addEventListener("blur", blur);
    return () => { document.removeEventListener("pointermove", pointerMove); document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); window.removeEventListener("blur", blur); };
  }, [activate, cancelCharge, isPhone, releaseCharge, startCharge, startReel, stopReel]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        cancelCharge();
        stopReel();
        fishingAudioRef.current?.suspend();
        if (hiddenCloseTimerRef.current !== null) window.clearTimeout(hiddenCloseTimerRef.current);
        hiddenCloseTimerRef.current = window.setTimeout(() => {
          hiddenCloseTimerRef.current = null;
          if (!document.hidden || closingRef.current) return;
          pausedForVisibilityRef.current = true;
          if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
          socketRef.current?.close();
          setConnected(false);
        }, 60_000);
      } else {
        if (hiddenCloseTimerRef.current !== null) window.clearTimeout(hiddenCloseTimerRef.current);
        hiddenCloseTimerRef.current = null;
        if (pausedForVisibilityRef.current && !closingRef.current) {
          pausedForVisibilityRef.current = false;
          retriesRef.current = 0;
          void connect();
        } else if (soundEnabledRef.current) void fishingAudioRef.current?.resume();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      if (hiddenCloseTimerRef.current !== null) window.clearTimeout(hiddenCloseTimerRef.current);
    };
  }, [cancelCharge, connect, setConnected, stopReel]);

  useEffect(() => {
    const pagehide = () => { closingRef.current = true; stopReel(); cancelCharge(); socketRef.current?.close(); sceneRef.current?.dispose(); };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pagehide", pagehide); window.addEventListener("pageshow", pageshow);
    if ("serviceWorker" in navigator) {
      const viteMeta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
      if (viteMeta.env?.DEV) {
        void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())));
      } else {
        void navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Offline cache unavailable", error));
      }
    }
    return () => { window.removeEventListener("pagehide", pagehide); window.removeEventListener("pageshow", pageshow); };
  }, [cancelCharge, stopReel]);

  useEffect(() => {
    const preview = { get state() { return { ...stateRef.current }; }, get diagnostics() { return { online: onlineRef.current, isPhone, scene: sceneRef.current?.diagnostics }; } };
    (window as Window & { oceanPreview?: unknown }).oceanPreview = preview;
    return () => { delete (window as Window & { oceanPreview?: unknown }).oceanPreview; };
  }, [isPhone]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (stateRef.current.phase === "fighting") startReel();
    else if (stateRef.current.phase === "idle") startCharge();
    else activate();
  }, [activate, startCharge, startReel]);
  const handlePointerUp = useCallback(() => { releaseCharge(); stopReel(); }, [releaseCharge, stopReel]);
  const handlePointerCancel = useCallback(() => { cancelCharge(); stopReel(); }, [cancelCharge, stopReel]);

  const toggleSensor = useCallback(async () => {
    if (sensorsOn) { showToast("釣り竿センサーは有効です。狙って一度振ってください。"); return; }
    try {
      if (!window.isSecureContext || !window.DeviceMotionEvent) { setSensorStatus("センサーが使えない環境です。下のボタンで投げられます。"); return; }
      const motionApi = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof motionApi.requestPermission === "function" && await motionApi.requestPermission() !== "granted") { setSensorStatus("センサーは許可されていません。タッチ操作で遊べます。"); return; }
      sensorSamplesRef.current = 0;
      warmupRef.current = 0;
      gravitySampleAtRef.current = 0;
      castGestureRef.current.reset();
      reelMotionGestureRef.current.reset();
      rodStrokeMotionRef.current.reset();
      if (sensorTimerRef.current !== null) window.clearTimeout(sensorTimerRef.current);
      const motion = (event: DeviceMotionEvent) => {
        if (document.hidden) {
          castGestureRef.current.reset();
          reelMotionGestureRef.current.reset();
          rodStrokeMotionRef.current.reset();
          if (motionReelRef.current) stopReel();
          return;
        }
        const linear = event.acceleration;
        const hasLinear = Boolean(linear && [linear.x, linear.y, linear.z].every(Number.isFinite));
        const raw = hasLinear ? linear : event.accelerationIncludingGravity;
        if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number" || typeof raw.z !== "number" || ![raw.x, raw.y, raw.z].every(Number.isFinite)) return;
        sensorSamplesRef.current += 1;
        if (sensorSamplesRef.current === 1) { setSensorStatus("投げるときは狙って一度振り、魚が掛かったらスマホを回します。"); setSensorButtonLabel("モーション操作は有効です"); }
        let { x, y, z } = raw;
        const now = performance.now();
        if (!hasLinear) {
          const gravity = gravityRef.current;
          const elapsed = gravitySampleAtRef.current === 0 ? 1 / 60 : clamp((now - gravitySampleAtRef.current) / 1000, .005, .1);
          const alpha = 1 - Math.exp(-elapsed / .1);
          gravity.x += (x - gravity.x) * alpha; gravity.y += (y - gravity.y) * alpha; gravity.z += (z - gravity.z) * alpha;
          x -= gravity.x; y -= gravity.y; z -= gravity.z;
          gravitySampleAtRef.current = now;
        }
        if (warmupRef.current++ < 15) return;
        const acceleration = Math.hypot(x, y, z);
        const rate = event.rotationRate;
        const angularSpeed = rate && [rate.alpha, rate.beta, rate.gamma].every(Number.isFinite)
          ? Math.hypot(rate.alpha ?? 0, rate.beta ?? 0, rate.gamma ?? 0)
          : 0;
        const phase = stateRef.current.phase;
        if (!(phase === "idle" || phase === "biting" || phase === "fighting") || !onlineRef.current || now - lastGestureRef.current < 700 && phase !== "fighting") {
          castGestureRef.current.reset();
          reelMotionGestureRef.current.reset();
          rodStrokeMotionRef.current.reset();
          if (motionReelRef.current) stopReel();
          return;
        }
        if (phase === "fighting") {
          castGestureRef.current.reset();
          const rotation = reelAngularSignal(rate?.alpha ?? null, rate?.beta ?? null, rate?.gamma ?? null);
          const canRecognizeRodStroke = !reelHeldRef.current && angularSpeed < 150;
          const rodStroke = canRecognizeRodStroke && rodStrokeMotionRef.current.update({ x, y, z }, now);
          if (rodStroke) {
            performRodStroke();
            lastGestureRef.current = now;
            reelMotionGestureRef.current.reset();
            return;
          }
          if (rodStrokeMotionRef.current.isPending()) {
            reelMotionGestureRef.current.reset();
            return;
          }
          if (!canRecognizeRodStroke) rodStrokeMotionRef.current.reset();
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
        rodStrokeMotionRef.current.reset();
        reelMotionGestureRef.current.reset();
        const gesture = castGestureRef.current.update(acceleration, angularSpeed, now);
        if (gesture) {
          if (stateRef.current.phase === "biting") send({ action: "hook" });
          else cast(castStrengthFromMotion(gesture.acceleration, gesture.angularSpeed), 0);
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
  }, [cast, isPhone, performRodStroke, send, sensorsOn, showToast, startReel, stopReel]);

  useEffect(() => () => {
    if (motionListenerRef.current) window.removeEventListener("devicemotion", motionListenerRef.current);
    if (sensorTimerRef.current !== null) window.clearTimeout(sensorTimerRef.current);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    if (hookFeedbackTimerRef.current !== null) window.clearTimeout(hookFeedbackTimerRef.current);
    fishingAudioRef.current?.dispose();
    fishingAudioRef.current = null;
  }, []);

  return {
    state, presentationState, online, displayConnected, renderFailed, reelHeld, feedback, hookFeedback, rodStrokeRevision, newEncounter, catchSaveStatus, toast, chargeProgress, reticle,
    soundEnabled, collection, selectedCollectionId, setSelectedCollectionId, controllerUrl, controllerHost, controllerUrlError,
    sensorStatus, sensorButtonLabel, sensorsOn,
    actions: {
      activate, retryCatchSave, cast, cancelCharge, handlePointerDown, handlePointerUp, handlePointerCancel, releaseCharge,
      startCharge, startReel, stopReel, performRodStroke, toggleSensor, toggleSound, showToast, showFeedback,
    },
  };
}
