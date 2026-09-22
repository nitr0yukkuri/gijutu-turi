import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import QRCode from "qrcode";
import { CollectionFishPreview } from "./CollectionFishPreview";
import { createCollection, recordCollectionCatch, type Collection, type CollectionEntry } from "./collection";
import { OceanCanvas } from "./OceanCanvas";
import { useOceanSession } from "./useOceanSession";
import type { OceanPhase } from "./types";

type DialogKind = "help" | "connect" | "collection" | null;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const phaseLabels: Record<OceanPhase, string> = { idle: "ここで投げてみる", casting: "投げています", waiting: "巻き戻す", retrieving: "戻しています", biting: "合わせる", fighting: "押して巻く", caught: "もう一度、海へ", escaped: "もう一度、投げる" };
const failureHints: Record<string, [string, string]> = { missed: ["合わせが、少し遅かった。", "ウキが沈んだら、Spaceかボタンで合わせよう。"], line: ["糸が、切れた。", "赤くなる前に巻く手を止めよう。"], slack: ["針が、外れた。", "糸が緩みきる前に、少し巻こう。"], distance: ["沖へ、逃げられた。", "魚が落ち着く間に、少しずつ巻こう。"] };

function CollectionDialog({ collection, selectedId, onSelect, onClose }: { collection: Collection; selectedId: string; onSelect: (id: string) => void; onClose: () => void }) {
  const entries = collection.entries;
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0];
  if (!selected) return null;
  const caught = selected.status === "caught";
  const preview = selected.status === "preview";
  const activeTotal = Math.max(1, collection.activeTotal);
  const detailName = caught || (preview && selected.name) ? selected.name : "まだ、出会っていない。";
  const detailClassification = caught || (preview && selected.classification) ? selected.classification : "この海の記録は、釣り上げたときに開きます。";
  const detailDescription = caught || (preview && selected.description) ? selected.description : "知らない光が、まだ沖にいる。";

  return <dialog id="collection-dialog" className="collection-dialog" aria-labelledby="collection-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="collection-shell">
      <header className="collection-header">
        <div><p className="eyebrow">SPECIMEN LOG</p><h2 id="collection-title">図鑑</h2><p id="collection-description">この海で出会ったものを、記録しています。</p></div>
        <div className="collection-progress" aria-label="図鑑の進捗"><span>登録 {String(collection.registered).padStart(2, "0")} / {String(activeTotal).padStart(2, "0")}</span><small>{collection.registered >= activeTotal ? "調査完了" : collection.registered ? "次の標本を探す" : "最初の標本を探す"}</small><span className="collection-progress-bar"><i style={{ width: `${Math.min(100, collection.registered / activeTotal * 100)}%` }} /></span></div>
        <button className="close-dialog quiet-button" aria-label="閉じる" onClick={onClose}>×</button>
      </header>
      <div className="collection-layout">
        <section className="collection-index" aria-label="標本一覧">
          <div className="collection-index-heading"><span>SPECIMENS</span><small>{String(entries.length).padStart(2, "0")} 標本を収録</small></div>
          <div className="collection-grid">{entries.map(entry => <CollectionCard key={entry.id} entry={entry} selected={entry.id === selected.id} onSelect={onSelect} />)}</div>
        </section>
        <section className="collection-detail" aria-live="polite">
          <div className="collection-detail-status" data-state={selected.status}>{caught ? "REGISTERED SPECIMEN" : preview ? "RESEARCH PENDING" : "UNKNOWN SPECIES"}</div>
          <div className={`collection-preview ${caught ? "has-model" : preview ? "is-preview" : "is-unknown"}`}>
            {caught && selected.modelKey ? <CollectionFishPreview species={selected.modelKey} /> : <div className="collection-silhouette"><span>{preview ? "…" : "?"}</span></div>}
          </div>
          <div className="collection-detail-copy"><p className="eyebrow">SPECIMEN {String(selected.number).padStart(2, "0")}</p><h3>{detailName}</h3><p className="collection-classification">{detailClassification}</p><p className="collection-detail-description">{detailDescription}</p><dl className="collection-facts"><div><dt>生息域</dt><dd>{caught || (preview && selected.habitat) ? selected.habitat : "—"}</dd></div><div><dt>レア度</dt><dd>{caught || (preview && selected.rarity) ? selected.rarity : "—"}</dd></div><div><dt>釣果</dt><dd>{caught ? `${selected.catches} 回` : "—"}</dd></div></dl></div>
          <p className="collection-detail-hint">{caught ? "ドラッグで回転 · 釣り上げた記録がここに残ります。" : preview ? "この標本は、次の調査で開く予定です。" : "海へ投げて、最初の標本を見つけよう。"}</p>
        </section>
      </div>
      <footer className="collection-footer"><span>SPECIMEN LOG · 技術釣り</span><span>{collection.registered} REGISTERED</span></footer>
    </div>
  </dialog>;
}

function CollectionCard({ entry, selected, onSelect }: { entry: CollectionEntry; selected: boolean; onSelect: (id: string) => void }) {
  const caught = entry.status === "caught";
  const preview = entry.status === "preview";
  const name = caught || (preview && entry.name) ? entry.name : "???";
  const caption = caught ? entry.classification || "REGISTERED" : preview ? "調査予定" : "未発見";
  return <button type="button" className="collection-card" data-state={entry.status} data-selected={String(selected)} aria-label={`${name}、${caption}`} aria-pressed={selected} onClick={() => onSelect(entry.id)}><span className="collection-card-top"><b>#{String(entry.number).padStart(2, "0")}</b><small>{caught ? "REGISTERED" : preview ? "PENDING" : "UNKNOWN"}</small></span><span className={`collection-card-art ${caught ? "is-caught" : preview ? "is-preview" : "is-unknown"}`}><i>{caught ? entry.name?.replace("魚", "") : preview ? "…" : "?"}</i></span><strong>{name}</strong><small>{caption}</small></button>;
}

export default function App() {
  const session = useOceanSession();
  const { state, send, online, isPhone, displayConnected, controllerCount, roomId } = session;
  const [charge, setCharge] = useState(0);
  const [chargeAim, setChargeAim] = useState(0);
  const [reelHeld, setReelHeld] = useState(false);
  const [sensorEnabled, setSensorEnabled] = useState(false);
  const [sensorStatus, setSensorStatus] = useState("小さな動きで大丈夫です。");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [pairingQr, setPairingQr] = useState("");
  const [collection, setCollection] = useState<Collection>(createCollection);
  const [selectedCollectionId, setSelectedCollectionId] = useState("fish-001");
  const [aim, setAim] = useState(0);
  const chargeStarted = useRef<number | null>(null);
  const aimRef = useRef(0);
  const motionRef = useRef({ peak: 0, peakAt: 0, lastGesture: 0, samples: 0, gravity: { x: 0, y: 0, z: 0 } });
  const recordedCatchRevision = useRef(-1);
  const chargeFrame = useRef<number | undefined>();
  const reelTimer = useRef<number | undefined>();
  const stateRef = useRef(state);
  const reelRef = useRef(reelHeld);
  stateRef.current = state;
  reelRef.current = reelHeld;
  const hasCaught = state.catches > 0;
  const pairingUrl = roomId ? `${location.origin}/?controller=${roomId}` : "";
  const tension = Math.round((state.tension || 0) * 100);
  const cue = state.phase === "biting" ? "いま、合わせる" : tension > 80 ? "糸が切れる。緩めて" : tension < 14 ? "糸が緩い。少し巻いて" : state.mode === "warning" ? "魚が、力をためている" : state.mode === "split" ? "引きが、急に重くなった" : state.mode === "surge" ? "強い引き。いったん緩める" : "いま、巻ける";
  const fighting = state.phase === "fighting";
  const biting = state.phase === "biting";
  const distanceVisible = ["casting", "waiting", "biting", "fighting"].includes(state.phase);
  const displayDistance = Math.max(0, Math.round(state.distance));

  useEffect(() => { document.body.dataset.phase = state.phase; }, [state.phase]);
  useEffect(() => { document.title = isPhone ? "釣り竿 — 技術釣り" : "技術釣り — 静かな海に、ひと振り。"; }, [isPhone]);
  useEffect(() => { if (!fighting && reelRef.current) stopReel(); }, [fighting]);
  useEffect(() => () => { cancelCharge(); stopReel(); }, []);
  useEffect(() => { if (!dialog) return; const node = document.querySelector(`#${dialog}-dialog`) as HTMLDialogElement | null; if (node && !node.open) node.showModal(); return () => { if (node?.open) node.close(); }; }, [dialog]);
  useEffect(() => { if (!navigator.serviceWorker) return; void navigator.serviceWorker.register("/service-worker.js"); }, []);
  useEffect(() => {
    if (isPhone || state.phase !== "caught" || recordedCatchRevision.current === state.revision) return;
    recordedCatchRevision.current = state.revision;
    setCollection(previous => recordCollectionCatch(previous, state.species));
  }, [isPhone, state.phase, state.revision, state.species]);
  useEffect(() => {
    if (!pairingUrl) { setPairingQr(""); return; }
    let active = true;
    void QRCode.toDataURL(pairingUrl, { width: 260, margin: 1, errorCorrectionLevel: "M", color: { dark: "#16303c", light: "#dce9e7" } })
      .then(dataUrl => { if (active) setPairingQr(dataUrl); })
      .catch(() => { if (active) setPairingQr(""); });
    return () => { active = false; };
  }, [pairingUrl]);
  useEffect(() => {
    if (!sensorEnabled) return;
    const motion = (event: DeviceMotionEvent) => {
      const linear = event.acceleration;
      const hasLinear = Boolean(linear && [linear.x, linear.y, linear.z].every(value => Number.isFinite(value)));
      const raw = hasLinear ? linear : event.accelerationIncludingGravity;
      if (!raw || ![raw.x, raw.y, raw.z].every(value => Number.isFinite(value))) return;
      const sample = motionRef.current; sample.samples += 1;
      let { x, y, z } = raw;
      if (!hasLinear) { sample.gravity = { x: sample.gravity.x * 0.85 + x * 0.15, y: sample.gravity.y * 0.85 + y * 0.15, z: sample.gravity.z * 0.85 + z * 0.15 }; x -= sample.gravity.x; y -= sample.gravity.y; z -= sample.gravity.z; }
      if (sample.samples < 15) return;
      const force = Math.hypot(x, y, z); const now = performance.now();
      if (!(stateRef.current.phase === "idle" || stateRef.current.phase === "biting") || !online || now - sample.lastGesture < 700) { sample.peak = 0; return; }
      if (force > 10 && sample.peak === 0) { sample.peak = force; sample.peakAt = now; }
      if (sample.peak && now - sample.peakAt > 650) { sample.peak = 0; return; }
      if (sample.peak && force < 4 && now - sample.peakAt > 60) { if (stateRef.current.phase === "biting") send({ action: "hook" }); else send({ action: "cast", strength: clamp(sample.peak / 28, 0.45, 1), aim: 0 }); sample.lastGesture = now; sample.peak = 0; }
    };
    window.addEventListener("devicemotion", motion);
    return () => window.removeEventListener("devicemotion", motion);
  }, [online, sensorEnabled, send]);

  const stopReel = useCallback(() => {
    if (reelRef.current) send({ action: "reel", held: false });
    reelRef.current = false; setReelHeld(false); window.clearInterval(reelTimer.current); reelTimer.current = undefined;
  }, [send]);
  const startReel = useCallback(() => {
    if (reelRef.current || stateRef.current.phase !== "fighting" || !online || (isPhone && !displayConnected)) return;
    reelRef.current = true; setReelHeld(true); send({ action: "reel", held: true });
    reelTimer.current = window.setInterval(() => { if (stateRef.current.phase === "fighting") send({ action: "reel", held: true }); else stopReel(); }, 120);
  }, [displayConnected, isPhone, online, send, stopReel]);
  const cancelCharge = useCallback(() => { chargeStarted.current = null; window.cancelAnimationFrame(chargeFrame.current ?? 0); document.body.classList.remove("is-charging"); setCharge(0); }, []);
  const startCharge = useCallback(() => {
    if (!online || stateRef.current.phase !== "idle" || chargeStarted.current !== null) return;
    const started = performance.now(); chargeStarted.current = started; document.body.classList.add("is-charging");
    const update = (now: number) => { if (chargeStarted.current === null) return; const power = clamp((now - started) / 1100, 0.2, 1); setCharge(power); setChargeAim(aimRef.current); chargeFrame.current = window.requestAnimationFrame(update); };
    chargeFrame.current = window.requestAnimationFrame(update);
  }, [online]);
  const releaseCharge = useCallback(() => { if (chargeStarted.current === null) return; const power = clamp((performance.now() - chargeStarted.current) / 1100, 0.45, 1); cancelCharge(); send({ action: "cast", strength: power, aim: aimRef.current }); }, [cancelCharge, send]);
  const activate = useCallback(() => {
    const phase = stateRef.current.phase;
    if (phase === "biting") send({ action: "hook" });
    else if (phase === "waiting") send({ action: "retrieve" });
    else if (phase === "caught" || phase === "escaped") send({ action: "reset" });
    else if (phase === "fighting") { if (reelRef.current) stopReel(); else startReel(); }
    else if (phase === "idle") send({ action: "cast", strength: 0.65, aim: aimRef.current });
  }, [send, startReel, stopReel]);
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
    if (stateRef.current.phase === "fighting") startReel(); else if (stateRef.current.phase === "idle") startCharge(); else activate();
  };
  const pointerUp = () => { releaseCharge(); stopReel(); };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.matches("input,textarea") || document.querySelector("dialog[open]")) return;
      if (event.code === "KeyR" && stateRef.current.phase === "fighting") { event.preventDefault(); startReel(); return; }
      if (event.code !== "Space" || isPhone || event.repeat) return;
      if ((event.target as HTMLElement | null)?.matches("button:not(#cast-button):not(#fight-button)")) return;
      event.preventDefault(); if (stateRef.current.phase === "fighting") startReel(); else if (stateRef.current.phase === "idle") startCharge(); else activate();
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === "Space") { releaseCharge(); stopReel(); } if (event.code === "KeyR") stopReel(); };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", stopReel);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", stopReel); };
  }, [activate, isPhone, releaseCharge, startCharge, startReel, stopReel]);

  const sharedButtonProps = { onPointerDown: pointerDown, onPointerUp: pointerUp, onPointerCancel: pointerUp, onLostPointerCapture: pointerUp };
  const onLand = useCallback(() => {}, []);
  const enableSensor = async () => {
    if (!window.isSecureContext || !("DeviceMotionEvent" in window)) { setSensorStatus("センサーが使えない環境です。タッチで投げられます。"); return; }
    const permissionApi = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
    if (permissionApi.requestPermission) { const result = await permissionApi.requestPermission(); if (result !== "granted") { setSensorStatus("センサーは許可されていません。タッチ操作で遊べます。"); return; } }
    setSensorEnabled(true); setSensorStatus("釣り竿が使えます。小さく振って、海へ。");
  };
  if (isPhone) return <PhoneController state={state} cue={cue} tension={tension} online={online} displayConnected={displayConnected} reelHeld={reelHeld} hasCaught={hasCaught} sensorStatus={sensorStatus} onSensor={() => void enableSensor()} sharedButtonProps={sharedButtonProps} onActivate={activate} />;

  return <>
    <main id="sea" aria-label="技術釣りの海" onPointerMove={event => { if ((event.target as HTMLElement).closest("button,dialog")) return; const next = clamp((event.clientX / window.innerWidth - 0.5) * 1.7, -1, 1); aimRef.current = next; setAim(next); }}>
      <div id="ocean" role="img" aria-label="空の光が映る、穏やかな夕暮れの海"><OceanCanvas state={state} charge={charge} chargeAim={chargeAim} onLand={onLand} /></div>
      <div className="edge-shade" aria-hidden="true" />
      <header className="masthead chrome"><a className="wordmark" href="/" aria-label="技術釣りの海へ"><span>技術釣り</span></a><div className="top-actions"><span id="connection-status" className="connection-status" hidden={controllerCount === 0}><i /><span>スマホ接続中</span></span><button id="sound-toggle" className="quiet-button" aria-pressed={soundOn} aria-label={soundOn ? "音をオフにする" : "音をオンにする"} onClick={() => setSoundOn(value => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h4l5-4v12l-5-4H4z" /><path d={soundOn ? "M17 8q5 4 0 8m3-11q7 7 0 14" : "m17 9 5 6m0-6-5 6"} /></svg></button></div></header>
      <div className="cast-feedback" aria-live="polite"><span>{state.phase === "waiting" ? "アタリを、待つ。" : ""}</span><small>{state.phase === "waiting" ? "ウキが沈んだら合わせる" : ""}</small></div><div id="cast-reticle" aria-hidden="true" style={{ left: `${50 + aim * 28}%`, top: "48%" }} />
      <section id="fight-ui" className="fight-ui" hidden={!fighting && !biting} aria-label="魚との駆け引き" data-tension={tension} data-mode={state.mode}><p id="fight-cue" role="status">{cue}</p><div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension}><span style={{ width: `${tension}%` }} /><i /></div><button id="fight-button" className={`fight-button${reelHeld ? " is-held" : ""}`} disabled={!online} {...sharedButtonProps} onClick={event => { if (event.detail === 0) activate(); }}>{biting ? "合わせる" : reelHeld ? "巻いている — 離すと緩む" : "押して巻く"}</button><small id="fight-guide">{biting ? "SPACE / スマホを小さく引く" : "R 長押しで巻く / 離すと緩む"}</small></section>
      <section id="catch-ui" className="catch-ui" hidden={state.phase !== "caught"} aria-live="polite"><p>NEW ENCOUNTER</p><h1>{state.species === "k8s" ? "K8s" : "Go"}<span>魚</span></h1><p>{state.species === "k8s" ? "クラスターが、群れになる。" : "ひとつの光が、群れになる。"}</p><button id="catch-again" className="primary-button" disabled={!online} onClick={() => send({ action: "reset" })}>もう一度、海へ</button></section>
      <section id="escape-ui" className="escape-ui" hidden={state.phase !== "escaped"} aria-live="polite"><h2 id="escape-title">{failureHints[state.reason]?.[0] ?? "逃げられた。"}</h2><p id="escape-hint">{failureHints[state.reason]?.[1] ?? "魚が落ち着く間に、少しずつ巻こう。"}</p><button id="escape-again" className="primary-button" disabled={!online} onClick={() => send({ action: "reset" })}>もう一度、投げる</button></section>
      <aside className="distance-readout" hidden={!distanceVisible} aria-label={`距離 ${displayDistance}メートル`}><span>{state.phase === "casting" ? "CAST DISTANCE" : "LINE DISTANCE"}</span><strong>{displayDistance}<small>m</small></strong></aside>
      <div className="bottom-shade" aria-hidden="true" />
      <footer className="shore-controls chrome"><button className="shore-link" data-dialog="help" onClick={() => setDialog("help")}><span className="help-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9.25 9a3 3 0 0 1 5.8 1.15c0 1.9-2.05 2.35-2.55 3.9" /><path d="M12.5 17.35h.01" /></svg></span> あそびかた</button><div className="entry-actions"><button id="connect-button" className="connect-button" onClick={() => setDialog("connect")}><svg viewBox="0 0 20 24" aria-hidden="true"><rect x="4" y="2" width="12" height="20" rx="2" /><path d="M8 18h4" /></svg><span>スマホで釣る</span><span className="entry-arrow" aria-hidden="true">↗</span></button><button id="cast-button" className="cast-button" aria-label={state.phase === "waiting" ? "ルアーを巻き戻す" : "押してためて、離して投げる"} disabled={!online || ["casting", "retrieving"].includes(state.phase)} {...sharedButtonProps} onClick={event => { if (event.detail === 0) activate(); }}><span id="cast-button-label">{phaseLabels[state.phase]}</span><span className="key-hint" aria-hidden="true">SPACE</span></button><span className="cast-charge" aria-hidden="true"><span style={{ width: `${charge * 100}%` }} /></span></div><button className="shore-link" onClick={() => setDialog("collection")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1 7 0-9 2-2-2-5-3-9-2Z" /></svg> 図鑑</button></footer>
    </main>
    <DialogShell kind="help" title="静かな海に、ひと振り。" onClose={() => setDialog(null)}><p className="eyebrow">HOW TO FISH</p><ol className="instructions"><li><span>01</span><div><strong>海へ、投げる。</strong><p>Spaceまたはボタンをタッチ。スマホを回して投げます。</p></div></li><li><span>02</span><div><strong>アタリが来たら、合わせる。</strong><p>ウキが沈んだら、Spaceまたはボタンをタッチ。</p></div></li><li><span>03</span><div><strong>巻く、緩める。</strong><p>押している間に巻き、赤くなる前に離します。緩めすぎても逃げます。</p></div></li></ol><p className="fine-print">リールはタッチ操作にも対応しています。キーボードではRで巻きます。</p></DialogShell>
    <DialogShell kind="connect" title="手の中に、釣り竿を。" onClose={() => setDialog(null)}><p className="eyebrow">CONNECT YOUR PHONE</p><p>スマホのカメラで読み取ってください。</p><div className="pairing-qr" aria-label="スマホ接続用QRコード">{pairingQr ? <img src={pairingQr} alt="スマホ接続用QRコード" /> : <span>接続を準備中…</span>}</div></DialogShell>
    <CollectionDialog collection={collection} selectedId={selectedCollectionId} onSelect={setSelectedCollectionId} onClose={() => setDialog(null)} />
    <div id="toast" className="toast" role="status" />
  </>;
}

function DialogShell({ kind, title, onClose, children }: { kind: Exclude<DialogKind, null>; title: string; onClose: () => void; children: React.ReactNode }) {
  return <dialog id={`${kind}-dialog`} aria-labelledby={`${kind}-title`} onCancel={onClose}><button className="close-dialog quiet-button" aria-label="閉じる" onClick={onClose}>×</button><h2 id={`${kind}-title`}>{title}</h2>{children}</dialog>;
}

function PhoneController({ state, cue, tension, online, displayConnected, reelHeld, hasCaught, sensorStatus, onSensor, sharedButtonProps, onActivate }: { state: ReturnType<typeof useOceanSession>["state"]; cue: string; tension: number; online: boolean; displayConnected: boolean; reelHeld: boolean; hasCaught: boolean; sensorStatus: string; onSensor: () => void; sharedButtonProps: Record<string, unknown>; onActivate: () => void }) {
  const fighting = state.phase === "fighting";
  const biting = state.phase === "biting";
  return <section id="phone" className="phone" aria-label="釣り竿コントローラー"><a className="phone-brand" href="/">技術釣り</a><span className="phone-connection">{online && displayConnected ? "海につながっています" : "海に接続しています"}</span><div className="phone-instruction"><p id="phone-kicker">YOUR FISHING ROD</p><h1 id="phone-title">{state.phase === "caught" ? <>釣れた！<br />{state.species === "k8s" ? "K8s魚" : "Go魚"}</> : state.phase === "escaped" ? <>また、<br />挑もう。</> : state.phase === "fighting" ? <>巻く、<br />緩める。</> : state.phase === "biting" ? <>いま、<br />合わせる！</> : <>海に向けて、<br />ひと振り。</>}</h1><p id="phone-hint">{state.phase === "caught" ? (state.species === "k8s" ? "クラスターが群れになって引く魚。" : "一匹が群れになる、並行処理の魚。") : biting ? "小さく引く、または下のボタンをタッチ。" : fighting ? "押して巻く。赤くなる前に離す。" : "Spaceまたはボタンをタッチ。スマホを回して投げます。"}</p></div><div className="rod-symbol" aria-hidden="true"><svg viewBox="0 0 160 230"><path d="M48 220 93 32 Q101 14 113 18" /><path className="rod-thread" d="M113 18q22 112-12 164" /><circle cx="101" cy="185" r="4" /><path d="m85 51 15 4m-19 11 16 4m-30 53 16 4" /></svg></div>{fighting && <div id="phone-tension" className="phone-tension"><div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension}><span style={{ width: `${tension}%` }} /><i /></div><p id="phone-fight-cue">{cue}</p></div>}<button id="sensor-button" className="primary-button" onClick={onSensor}>釣り竿を有効にする</button><button id="phone-cast" className={`phone-cast${reelHeld ? " is-held" : ""}`} disabled={!online} {...sharedButtonProps} onClick={event => { if (event.detail === 0) onActivate(); }}>{state.phase === "idle" ? "タッチで投げる" : state.phase === "fighting" ? (reelHeld ? "巻いている — 離すと緩む" : "押して巻く / 離して緩める") : state.phase === "caught" || state.phase === "escaped" ? "もう一度、海へ" : phaseLabels[state.phase]}</button><p className="sensor-status" role="status">{hasCaught ? "魚を図鑑に記録しています。" : sensorStatus}</p></section>;
}
