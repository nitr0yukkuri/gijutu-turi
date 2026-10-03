import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { isOceanMessage } from "../ocean-contract.js";
import { FishingAudioController } from "../audio/fishing-audio.js";
import { castStrengthFromMotion, isCastMotionReleased, isCastMotionStart, isReelMotionStart, isReelMotionStop, reelAngularSignal } from "./cast-motion.js";
import { RodStrokeMotion } from "./rod-stroke-motion.js";
import { isFirstCatch } from "./catch-discovery.js";
import { fetchCollection, type CollectionLoadResult } from "./collection-response.js";
import { CAST_MAX_STRENGTH, CAST_MIN_STRENGTH } from "../cast-distance.js";
import { FISH_SPECIES, type FishSpeciesId } from "../fish-species.js";
import type { Collection, CollectionEntry, Feedback, OceanMessage, OceanSceneController, OceanState, Reticle } from "./types.js";

const configuredBackendUrl = (import.meta.env.VITE_BACKEND_URL ?? "").trim().replace(/\/+$/, "");
const backendUrl = (path: string): string => configuredBackendUrl ? `${configuredBackendUrl}${path}` : path;
const roomFishStorageKey = "gijutu.ocean-room-fish";
const COLLECTION_LOAD_ERROR_MESSAGE = "図鑑を読み込めません。DBとの接続を確認してください。";

class OceanRoomRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("ocean_room_rate_limited");
  }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const failureHints: Record<string, [string, string]> = {
  missed: ["合わせが、少し遅かった。", "ウキが沈んだら、Spaceかボタンで合わせよう。"],
  line: ["糸が、切れた。", "赤くなる前に巻く手を止めよう。"],
  slack: ["針が外れた。", "釣れそうな魚：go fish"],
  distance: ["沖へ、逃げられた。", "魚が落ち着く間に、少しずつ巻こう。"],
};

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
  const [newEncounter, setNewEncounter] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState("fish-001");
  const [controllerUrl, setControllerUrl] = useState("");
  const [controllerHost, setControllerHost] = useState("");
  const [sensorStatus, setSensorStatus] = useState("投げるときは振り、魚が掛かったらスマホを回します。");
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
  const sensorPeakRef = useRef({ acceleration: 0, angularSpeed: 0 });
  const sensorPeakAtRef = useRef(0);
  const lastGestureRef = useRef(0);
  const gravityRef = useRef({ x: 0, y: 0, z: 0 });
  const warmupRef = useRef(0);
  const motionReelRef = useRef(false);
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);
  const rodStrokeMotionRef = useRef(new RodStrokeMotion());
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
    if (next) getFishingAudio().sync(stateRef.current, stateRef.current);
  }, [getFishingAudio]);

  const loadCollection = useCallback(async (): Promise<CollectionLoadResult> => {
    const result = await fetchCollection(`${backendUrl("/api/collection")}?playerId=${encodeURIComponent(playerIdRef.current)}`);
    if (result.ok) {
      collectionRef.current = result.value;
      setCollection(result.value);
    }
    return result;
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

  const applyState = useCallback((message: OceanMessage) => {
    const previous = stateRef.current;
    const next = message.state;
    stateRef.current = next;
    setState(next);
    setDisplayConnected(message.displays > 0);
    displayConnectedRef.current = message.displays > 0;
    fishingAudioRef.current?.sync(previous, next);
    sceneRef.current?.setState(next, message.serverNow);
    if (Number.isSafeInteger(message.rodStroke) && (message.rodStroke ?? 0) >= 0) {
      const previousRodStroke = receivedRodStrokeRef.current;
      if (previousRodStroke !== null && (message.rodStroke ?? 0) > previousRodStroke) {
        const newStrokes = Math.min(4, (message.rodStroke ?? 0) - previousRodStroke);
        for (let index = 0; index < newStrokes; index++) sceneRef.current?.rodStroke?.();
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
      }
      if (next.phase === "caught") {
        setNewEncounter(false);
        setSelectedCollectionId(next.fishId);
        showFeedback(""); vibrate([90, 90, 180]);
        if (!isPhone) {
          // The room persists the catch before broadcasting this snapshot.
          // The display only reloads the read model; it must not submit a
          // second catch command from the browser.
          const previousCatches = collectionRef.current.entries.find(entry => entry.id === next.fishId)?.catches ?? 0;
          void loadCollection().then(result => {
            if (!result.ok) { showToast(COLLECTION_LOAD_ERROR_MESSAGE); return; }
            const loaded = result.value;
            const currentCatches = loaded.entries.find(entry => entry.id === next.fishId)?.catches ?? previousCatches;
            const firstCatch = isFirstCatch(previousCatches, currentCatches);
            setNewEncounter(firstCatch);
            showToast(firstCatch ? "新しい魚が図鑑に登録されました。" : "魚を釣り上げました。");
          });
        }
      }
      if (next.phase === "escaped") {
        const [title, hint] = failureHints[next.reason] ?? ["沖へ、逃げられた。", "魚が落ち着く間に、少しずつ巻こう。"];
        showFeedback(title, hint); vibrate([160, 80, 60]);
      }
    }
    if (next.phase === "fighting" && previous.mode !== next.mode && next.mode === "split") vibrate([70, 40, 70, 40, 100]);
    if (next.phase === "fighting" && next.tension > .82 && Date.now() - lastVibrationRef.current > 900) { vibrate(45); lastVibrationRef.current = Date.now(); }
  }, [cancelCharge, getFishingAudio, isPhone, loadCollection, setConnected, showFeedback, showHookFeedback, showToast, stopReel, vibrate]);

  const getRoom = useCallback(async (): Promise<{ id: string; host?: string }> => {
    if (isPhone) return { id: controllerId ?? "" };
    const stored = sessionStorage.getItem("gijutu.ocean-room");
    const storedHost = sessionStorage.getItem("gijutu.ocean-host-v2") ?? undefined;
    const storedFish = sessionStorage.getItem(roomFishStorageKey);
    if (stored && storedHost && storedFish === roomFishKey) return { id: stored, host: storedHost };
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
    const scheduleRetry = (finalMessage: string) => {
      if (closingRef.current || pausedForVisibilityRef.current || retryTimerRef.current !== null) return;
      if (retriesRef.current >= 4) { showToast(finalMessage); return; }
      const attempt = retriesRef.current++;
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void connect();
      }, 1000 + attempt * 1000);
    };
    try {
      const room = await getRoom();
      if (closingRef.current || pausedForVisibilityRef.current) return;
      const nextRoomId = room.id;
      if (!/^sea_[a-f0-9]{32}$/.test(nextRoomId)) throw new Error("link");
      if (!isPhone) {
        const phoneUrl = new URL(routePath, window.location.origin);
        if (room.host && ["localhost", "127.0.0.1", "[::1]"].includes(phoneUrl.hostname)) phoneUrl.hostname = room.host;
        phoneUrl.searchParams.set("controller", nextRoomId);
        setControllerHost(room.host ?? phoneUrl.hostname);
        setControllerUrl(phoneUrl.href);
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
      socket.addEventListener("open", () => { opened = true; retriesRef.current = 0; setConnected(true); });
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
        if (!opened && !isPhone) {
          sessionStorage.removeItem("gijutu.ocean-room");
          sessionStorage.removeItem("gijutu.ocean-host-v2");
          sessionStorage.removeItem(roomFishStorageKey);
        }
        scheduleRetry(isPhone ? "接続できません。海の画面から新しいURLを開いてください。" : "海に接続できません。ページを再読み込みしてください。");
      });
      socket.addEventListener("error", () => setConnected(false));
    } catch (error) {
      setConnected(false);
      if (error instanceof OceanRoomRateLimitError) {
        const wait = Math.max(1, Math.ceil(error.retryAfterSeconds));
        showToast(`接続が集中しています。${wait}秒後にもう一度試してください。`);
        return;
      }
      showToast("海に接続できません。再接続しています。");
      scheduleRetry("海に接続できません。ページを再読み込みしてください。");
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
          onLand: () => {
            fishingAudioRef.current?.play("splash");
          },
          onSurfaceImpact: () => {
            fishingAudioRef.current?.play("splash");
          },
          onRenderError: () => { if (!disposed) setRenderFailed(true); },
        }) as OceanSceneController;
        sceneRef.current = scene;
        scene.setState(stateRef.current);
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
  }, [getFishingAudio, isPhone, oceanMountRef]);

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
    void loadCollection().then(result => {
      if (!result.ok) showToast(COLLECTION_LOAD_ERROR_MESSAGE);
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
    if (sensorsOn) { showToast("釣り竿は有効です。小さく振ってください。"); return; }
    try {
      if (!window.isSecureContext || !window.DeviceMotionEvent) { setSensorStatus("センサーが使えない環境です。下のボタンで投げられます。"); return; }
      const motionApi = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof motionApi.requestPermission === "function" && await motionApi.requestPermission() !== "granted") { setSensorStatus("センサーは許可されていません。タッチ操作で遊べます。"); return; }
      sensorSamplesRef.current = 0;
      warmupRef.current = 0;
      if (sensorTimerRef.current !== null) window.clearTimeout(sensorTimerRef.current);
      const motion = (event: DeviceMotionEvent) => {
        if (document.hidden) return;
        const linear = event.acceleration;
        const hasLinear = Boolean(linear && [linear.x, linear.y, linear.z].every(Number.isFinite));
        const raw = hasLinear ? linear : event.accelerationIncludingGravity;
        if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number" || typeof raw.z !== "number" || ![raw.x, raw.y, raw.z].every(Number.isFinite)) return;
        sensorSamplesRef.current += 1;
        if (sensorSamplesRef.current === 1) { setSensorStatus("投げるときは振り、魚が掛かったらスマホを回します。"); setSensorButtonLabel("モーション操作は有効です"); }
        let { x, y, z } = raw;
        if (!hasLinear) {
          const gravity = gravityRef.current;
          gravity.x = gravity.x * .85 + x * .15; gravity.y = gravity.y * .85 + y * .15; gravity.z = gravity.z * .85 + z * .15;
          x -= gravity.x; y -= gravity.y; z -= gravity.z;
        }
        if (warmupRef.current++ < 15) return;
        const acceleration = Math.hypot(x, y, z);
        const rate = event.rotationRate;
        const angularSpeed = rate && [rate.alpha, rate.beta, rate.gamma].every(Number.isFinite)
          ? Math.hypot(rate.alpha ?? 0, rate.beta ?? 0, rate.gamma ?? 0)
          : 0;
        const now = performance.now();
        const phase = stateRef.current.phase;
        if (!(phase === "idle" || phase === "biting" || phase === "fighting") || !onlineRef.current || now - lastGestureRef.current < 700 && phase !== "fighting") {
          sensorPeakRef.current = { acceleration: 0, angularSpeed: 0 };
          rodStrokeMotionRef.current.reset();
          if (motionReelRef.current) stopReel();
          return;
        }
        if (phase === "fighting") {
          const rotation = reelAngularSignal(rate?.alpha ?? null, rate?.beta ?? null, rate?.gamma ?? null);
          const canRecognizeRodStroke = !reelHeldRef.current && angularSpeed < 150;
          const rodStroke = canRecognizeRodStroke && rodStrokeMotionRef.current.update({ x, y, z }, now);
          if (rodStroke) {
            performRodStroke();
            lastGestureRef.current = now;
            sensorPeakRef.current = { acceleration: 0, angularSpeed: 0 };
            return;
          }
          if (rodStrokeMotionRef.current.isPending()) return;
          if (!canRecognizeRodStroke) rodStrokeMotionRef.current.reset();
          if (isReelMotionStart(rotation)) {
            // Motion owns the lease only when it started it. This prevents a
            // sensor sample from stopping a reel held by the screen control.
            if (!reelHeldRef.current) {
              motionReelRef.current = true;
              startReel();
            }
          } else if (motionReelRef.current && isReelMotionStop(rotation)) {
            stopReel();
          }
          return;
        }
        rodStrokeMotionRef.current.reset();
        const peak = sensorPeakRef.current;
        if (isCastMotionStart(acceleration, angularSpeed) && peak.acceleration === 0 && peak.angularSpeed === 0) {
          peak.acceleration = acceleration;
          peak.angularSpeed = angularSpeed;
          sensorPeakAtRef.current = now;
        }
        if (peak.acceleration || peak.angularSpeed) {
          peak.acceleration = Math.max(acceleration, peak.acceleration);
          peak.angularSpeed = Math.max(angularSpeed, peak.angularSpeed);
          if (now - sensorPeakAtRef.current > 650) {
            sensorPeakRef.current = { acceleration: 0, angularSpeed: 0 };
            return;
          }
          if (isCastMotionReleased(acceleration, angularSpeed) && now - sensorPeakAtRef.current > 60) {
            if (stateRef.current.phase === "biting") send({ action: "hook" });
            else cast(castStrengthFromMotion(peak.acceleration, peak.angularSpeed), 0);
            lastGestureRef.current = now;
            sensorPeakRef.current = { acceleration: 0, angularSpeed: 0 };
          }
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
    state, online, displayConnected, renderFailed, reelHeld, feedback, hookFeedback, rodStrokeRevision, newEncounter, toast, chargeProgress, reticle,
    soundEnabled, collection, selectedCollectionId, setSelectedCollectionId, controllerUrl, controllerHost,
    sensorStatus, sensorButtonLabel, sensorsOn,
    actions: {
      activate, cast, cancelCharge, handlePointerDown, handlePointerUp, handlePointerCancel, releaseCharge,
      startCharge, startReel, stopReel, performRodStroke, toggleSensor, toggleSound, showToast, showFeedback,
    },
  };
}
