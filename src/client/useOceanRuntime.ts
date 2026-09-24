import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { createOcean } from "../rendering/ocean-scene.js";
import { castStrengthFromMotion, isCastMotionReleased, isCastMotionStart } from "./cast-motion.js";
import type { Collection, CollectionEntry, Feedback, OceanMessage, OceanSceneController, OceanState, Reticle } from "./types.js";

const configuredBackendUrl = (import.meta.env.VITE_BACKEND_URL ?? "").trim().replace(/\/+$/, "");
const backendUrl = (path: string): string => configuredBackendUrl ? `${configuredBackendUrl}${path}` : path;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const failureHints: Record<string, [string, string]> = {
  missed: ["合わせが、少し遅かった。", "ウキが沈んだら、Spaceかボタンで合わせよう。"],
  line: ["糸が、切れた。", "赤くなる前に巻く手を止めよう。"],
  slack: ["針が、外れた。", "糸が緩みきる前に、少し巻こう。"],
  distance: ["沖へ、逃げられた。", "魚が落ち着く間に、少しずつ巻こう。"],
};

const fallbackCatalog: CollectionEntry[] = [
  {
    id: "fish-001", number: 1, name: "Go魚", classification: "CONCURRENCY SPECIES",
    tagline: "ひとつの光が、群れになる。", description: "一匹が複数に分かれ、同時に引く。Goの並行処理を、群れの抵抗として体験する魚。",
    habitat: "静かな沖", rarity: "COMMON", modelKey: "go-fish", catalogStatus: "active", status: "unknown",
    catches: 0, firstCaughtAt: null, lastCaughtAt: null,
  },
];

const readHasGo = (): boolean => {
  try { return localStorage.getItem("gijutu.collection.go") === "caught"; } catch { return false; }
};

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
  activeTotal: 1,
  catalogTotal: fallbackCatalog.length,
});

const initialState = (): OceanState => ({
  phase: "idle", revision: 0, strength: .65, aim: 0, castAt: 0, retrieveAt: 0,
  tension: 0, distance: 0, mode: "rest", catches: 0, reason: "", resultAt: 0, approach: 0,
});

type UseOceanRuntimeOptions = {
  isPhone: boolean;
  controllerId: string | null;
  oceanMountRef: RefObject<HTMLDivElement | null>;
  collectionOpen: boolean;
};

export function useOceanRuntime({ isPhone, controllerId, oceanMountRef, collectionOpen }: UseOceanRuntimeOptions) {
  const [state, setState] = useState<OceanState>(initialState);
  const stateRef = useRef(state);
  const [online, setOnline] = useState(false);
  const onlineRef = useRef(false);
  const [controllers, setControllers] = useState(0);
  const [displayConnected, setDisplayConnected] = useState(true);
  const displayConnectedRef = useRef(true);
  const [renderFailed, setRenderFailed] = useState(false);
  const [reelHeld, setReelHeld] = useState(false);
  const reelHeldRef = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>({ text: "", detail: "", faded: false });
  const [toast, setToast] = useState("");
  const [chargeProgress, setChargeProgress] = useState(0);
  const [reticle, setReticle] = useState<Reticle>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);
  const [collection, setCollection] = useState<Collection>(() => initialCollection(readHasGo()));
  const [selectedCollectionId, setSelectedCollectionId] = useState("fish-001");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [controllerUrl, setControllerUrl] = useState("");
  const [controllerHost, setControllerHost] = useState("");
  const [pairingStatus, setPairingStatus] = useState("接続を待っています");
  const [sensorStatus, setSensorStatus] = useState("小さな動きで大丈夫です。");
  const [sensorButtonLabel, setSensorButtonLabel] = useState("釣り竿を有効にする");
  const [sensorsOn, setSensorsOn] = useState(false);

  const sceneRef = useRef<OceanSceneController | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const roomIdRef = useRef<string | null>(null);
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
  const hasGoRef = useRef(readHasGo());
  const playerIdRef = useRef(createPlayerId());
  const audioContextRef = useRef<AudioContext | null>(null);
  const seaGainRef = useRef<GainNode | null>(null);
  const sensorTimerRef = useRef<number | null>(null);
  const sensorSamplesRef = useRef(0);
  const sensorPeakRef = useRef({ acceleration: 0, angularSpeed: 0 });
  const sensorPeakAtRef = useRef(0);
  const lastGestureRef = useRef(0);
  const gravityRef = useRef({ x: 0, y: 0, z: 0 });
  const warmupRef = useRef(0);
  const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(null);

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

  const vibrate = useCallback((pattern: number | number[]) => {
    if (isPhone && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  }, [isPhone]);

  const stopReel = useCallback(() => {
    if (reelHeldRef.current && socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ action: "reel", held: false }));
    setReelHeld(false);
    if (reelTimerRef.current !== null) window.clearInterval(reelTimerRef.current);
    reelTimerRef.current = null;
  }, []);

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
      setControllers(0);
      setPairingStatus("海との接続を確認しています");
    }
  }, [cancelCharge, stopReel]);

  const makeNoise = useCallback((duration: number): AudioBuffer => {
    const audioContext = audioContextRef.current;
    if (!audioContext) throw new Error("audio_unavailable");
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }, []);

  const playEffect = useCallback((kind: "cast" | "land") => {
    const audioContext = audioContextRef.current;
    if (!soundEnabledRef.current || !audioContext) return;
    const time = audioContext.currentTime;
    const source = audioContext.createBufferSource();
    source.buffer = makeNoise(kind === "cast" ? .45 : .6);
    const filter = audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = kind === "cast" ? 1300 : 650;
    filter.Q.value = .5;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(.001, time);
    gain.gain.exponentialRampToValueAtTime(kind === "cast" ? .06 : .12, time + .03);
    gain.gain.exponentialRampToValueAtTime(.001, time + .4);
    source.connect(filter); filter.connect(gain); gain.connect(audioContext.destination); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }, [makeNoise]);

  const toggleSound = useCallback(async () => {
    const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error("audio_unavailable");
    if (!audioContextRef.current) {
      const audioContext = new AudioContextCtor();
      const seaGain = audioContext.createGain();
      seaGain.gain.value = 0;
      seaGain.connect(audioContext.destination);
      const noise = audioContext.createBufferSource(); noise.buffer = makeNoise(5); noise.loop = true;
      const filter = audioContext.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 600;
      const lfo = audioContext.createOscillator(); lfo.frequency.value = .14;
      const modulation = audioContext.createGain(); modulation.gain.value = .008;
      lfo.connect(modulation); modulation.connect(seaGain.gain); lfo.start(); noise.connect(filter); filter.connect(seaGain); noise.start();
      audioContextRef.current = audioContext; seaGainRef.current = seaGain;
    }
    const audioContext = audioContextRef.current;
    const seaGain = seaGainRef.current;
    if (!audioContext || !seaGain) return;
    await audioContext.resume();
    const next = !soundEnabledRef.current;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    seaGain.gain.setTargetAtTime(next ? .035 : 0, audioContext.currentTime, .4);
    if (!next) window.setTimeout(() => { if (!soundEnabledRef.current) void audioContext.suspend(); }, 500);
  }, [makeNoise]);

  const markLocalCaught = useCallback(() => {
    hasGoRef.current = true;
    try { localStorage.setItem("gijutu.collection.go", "caught"); } catch { /* best effort */ }
    setCollection(previous => ({
      ...previous,
      registered: Math.max(previous.registered, 1),
      entries: previous.entries.map(entry => entry.id === "fish-001" ? { ...entry, status: "caught", catches: Math.max(entry.catches, 1) } : entry),
    }));
  }, []);

  const loadCollection = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl("/api/collection")}?playerId=${encodeURIComponent(playerIdRef.current)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("collection");
      setCollection(await response.json() as Collection);
    } catch {
      // The local fallback keeps the demo usable when the DB endpoint is unavailable.
    }
  }, []);

  const recordCollectionCatch = useCallback(async (eventKey: string) => {
    try {
      const response = await fetch(backendUrl("/api/collection/catches"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: playerIdRef.current, fishId: "fish-001", eventKey }),
      });
      if (!response.ok) throw new Error("collection");
      setCollection(await response.json() as Collection);
      markLocalCaught();
      showToast("新しい魚が図鑑に登録されました。");
    } catch {
      markLocalCaught();
    }
  }, [markLocalCaught, showToast]);

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
    send({ action: "cast", strength: clamp(strength, .2, 1), aim: clamp(direction, -1, 1) });
  }, [isPhone, renderFailed, send]);

  const startCharge = useCallback(() => {
    if (!onlineRef.current || stateRef.current.phase !== "idle" || chargeAtRef.current !== null) return;
    chargeAtRef.current = performance.now();
    const update = () => {
      if (chargeAtRef.current === null) return;
      const power = clamp((performance.now() - chargeAtRef.current) / 1100, .2, 1);
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
    const power = clamp((performance.now() - chargeAtRef.current) / 1100, .45, 1);
    cancelCharge();
    cast(power);
  }, [cancelCharge, cast]);

  const startReel = useCallback(() => {
    if (reelHeldRef.current || stateRef.current.phase !== "fighting" || !onlineRef.current || (isPhone && !displayConnectedRef.current)) return;
    setReelHeld(true);
    reelHeldRef.current = true;
    send({ action: "reel", held: true });
    reelTimerRef.current = window.setInterval(() => {
      if (onlineRef.current && stateRef.current.phase === "fighting") send({ action: "reel", held: true });
      else stopReel();
    }, 120);
  }, [isPhone, send, stopReel]);

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
    setControllers(message.controllers);
    setDisplayConnected(message.displays > 0);
    displayConnectedRef.current = message.displays > 0;
    sceneRef.current?.setState(next, message.serverNow);
    setConnected(true);
    setPairingStatus(message.controllers ? "釣り竿がつながりました" : "接続を待っています");
    if (next.phase !== "fighting") stopReel();
    if (!isPhone && next.catches > 0 && !hasGoRef.current) markLocalCaught();
    if (previous.phase !== next.phase) {
      cancelCharge();
      if (next.phase === "idle") showFeedback("");
      if (next.phase === "casting") { showFeedback(""); playEffect("cast"); }
      if (next.phase === "waiting") showFeedback("アタリを、待つ。", "ウキが沈んだら合わせる", 2200);
      if (next.phase === "biting") { playEffect("land"); vibrate([90, 60, 90]); }
      if (next.phase === "fighting") { showFeedback(""); vibrate(80); }
      if (next.phase === "caught") {
        showFeedback(""); playEffect("land"); vibrate([90, 90, 180]);
        if (!isPhone) void recordCollectionCatch(`${roomIdRef.current ?? "local"}:${next.revision}`);
      }
      if (next.phase === "escaped") {
        const [title, hint] = failureHints[next.reason] ?? ["沖へ、逃げられた。", "魚が落ち着く間に、少しずつ巻こう。"];
        showFeedback(title, hint); vibrate([160, 80, 60]);
      }
    }
    if (next.phase === "fighting" && previous.mode !== next.mode && next.mode === "split") vibrate([70, 40, 70, 40, 100]);
    if (next.phase === "fighting" && next.tension > .82 && Date.now() - lastVibrationRef.current > 900) { vibrate(45); lastVibrationRef.current = Date.now(); }
  }, [cancelCharge, isPhone, markLocalCaught, playEffect, recordCollectionCatch, setConnected, showFeedback, stopReel, vibrate]);

  const getRoom = useCallback(async (): Promise<{ id: string; host?: string }> => {
    if (isPhone) return { id: controllerId ?? "" };
    const stored = sessionStorage.getItem("gijutu.ocean-room");
    const storedHost = sessionStorage.getItem("gijutu.ocean-host-v2") ?? undefined;
    if (stored && storedHost) return { id: stored, host: storedHost };
    if (stored) sessionStorage.removeItem("gijutu.ocean-room");
    const response = await fetch(backendUrl("/api/ocean-sessions"), { method: "POST" });
    if (!response.ok) throw new Error("room");
    const result = await response.json() as { id: string; host?: string };
    sessionStorage.setItem("gijutu.ocean-room", result.id);
    if (result.host) sessionStorage.setItem("gijutu.ocean-host-v2", result.host);
    return result;
  }, [controllerId, isPhone]);

  const connect = useCallback(async () => {
    try {
      const room = await getRoom();
      if (closingRef.current || pausedForVisibilityRef.current) return;
      const nextRoomId = room.id;
      if (!/^sea_[a-f0-9]{32}$/.test(nextRoomId)) throw new Error("link");
      roomIdRef.current = nextRoomId;
      setRoomId(nextRoomId);
      if (!isPhone) {
        const phoneUrl = new URL("./", window.location.href);
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
        try {
          const message = JSON.parse(event.data) as OceanMessage;
          if (message.type === "ocean") applyState(message);
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
        }
        if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
        if (retriesRef.current++ < 4) retryTimerRef.current = window.setTimeout(() => { retryTimerRef.current = null; void connect(); }, 1000 + retriesRef.current * 500);
        else showToast(isPhone ? "接続できません。海の画面から新しいURLを開いてください。" : "海に接続できません。ページを再読み込みしてください。");
      });
      socket.addEventListener("error", () => setConnected(false));
    } catch {
      setConnected(false);
      showToast("海に接続できません。サーバーの起動を確認してください。");
    }
  }, [applyState, getRoom, isPhone, setConnected, showToast]);

  useEffect(() => {
    if (isPhone || !oceanMountRef.current) return;
    try {
      const scene = createOcean(oceanMountRef.current, {
        onLand: () => {
          playEffect("land");
        },
        onRenderError: () => setRenderFailed(true),
      }) as OceanSceneController;
      sceneRef.current = scene;
      scene.setState(stateRef.current);
      return () => { scene.dispose(); sceneRef.current = null; };
    } catch (error) {
      console.error("Ocean rendering unavailable", error);
      setRenderFailed(true);
    }
  }, [isPhone, oceanMountRef, playEffect]);

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

  useEffect(() => { void loadCollection(); }, [loadCollection]);

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
        void audioContextRef.current?.suspend();
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
        } else if (soundEnabledRef.current) void audioContextRef.current?.resume();
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
      const motion = (event: DeviceMotionEvent) => {
        if (document.hidden) return;
        const linear = event.acceleration;
        const hasLinear = Boolean(linear && [linear.x, linear.y, linear.z].every(Number.isFinite));
        const raw = hasLinear ? linear : event.accelerationIncludingGravity;
        if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number" || typeof raw.z !== "number" || ![raw.x, raw.y, raw.z].every(Number.isFinite)) return;
        sensorSamplesRef.current += 1;
        if (sensorSamplesRef.current === 1) { setSensorStatus("釣り竿が使えます。小さく振って、海へ。"); setSensorButtonLabel("釣り竿は有効です"); }
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
        if (!(stateRef.current.phase === "idle" || stateRef.current.phase === "biting") || !onlineRef.current || now - lastGestureRef.current < 700) {
          sensorPeakRef.current = { acceleration: 0, angularSpeed: 0 };
          return;
        }
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
      setSensorsOn(true); setSensorButtonLabel("釣り竿を確認しています");
      sensorTimerRef.current = window.setTimeout(() => {
        if (sensorSamplesRef.current === 0) { setSensorStatus("センサーの動きを取得できません。タッチで投げられます。"); setSensorButtonLabel("センサーの応答待ち"); }
        else setSensorButtonLabel("釣り竿は有効です");
      }, 2500);
    } catch { setSensorStatus("センサーを開始できません。タッチで投げられます。"); }
  }, [cast, isPhone, send, sensorsOn, showToast]);

  useEffect(() => () => {
    if (motionListenerRef.current) window.removeEventListener("devicemotion", motionListenerRef.current);
    if (sensorTimerRef.current !== null) window.clearTimeout(sensorTimerRef.current);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  return {
    state, online, controllers, displayConnected, renderFailed, reelHeld, feedback, toast, chargeProgress, reticle,
    soundEnabled, collection, selectedCollectionId, setSelectedCollectionId, roomId, controllerUrl, controllerHost, pairingStatus,
    sensorStatus, sensorButtonLabel, sensorsOn,
    actions: {
      activate, cast, cancelCharge, handlePointerDown, handlePointerUp, handlePointerCancel, releaseCharge,
      startCharge, startReel, stopReel, toggleSensor, toggleSound, showToast, showFeedback,
    },
  };
}
