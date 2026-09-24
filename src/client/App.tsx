import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { toDataURL } from "qrcode";
import { useOceanRuntime } from "./useOceanRuntime.js";
import type { Collection, CollectionEntry, OceanPhase } from "./types.js";


const phaseLabels: Record<OceanPhase, string> = {
  idle: "ここで投げてみる", casting: "投げています", waiting: "巻き戻す", retrieving: "戻しています",
  biting: "合わせる", fighting: "押して巻く", caught: "もう一度、海へ", escaped: "もう一度、投げる",
};

const phoneTitles: Record<OceanPhase, ReactNode> = {
  idle: <>海に向けて、<br />ひと振り。</>, casting: <>そのまま、<br />海を見て。</>, waiting: <>静かに、<br />アタリを待つ。</>,
  retrieving: <>もう一度、<br />好きな場所へ。</>, biting: <>いま、<br />合わせる！</>, fighting: <>巻く、<br />緩める。</>,
  caught: <>釣れた！<br />go fish</>, escaped: <>また、<br />挑もう。</>,
};

const failureHints: Record<string, [string, string]> = {
  missed: ["合わせが、少し遅かった。", "ウキが沈んだら、Spaceかボタンで合わせよう。"],
  line: ["糸が、切れた。", "赤くなる前に巻く手を止めよう。"],
  slack: ["針が、外れた。", "糸が緩みきる前に、少し巻こう。"],
  distance: ["沖へ、逃げられた。", "魚が落ち着く間に、少しずつ巻こう。"],
};

const phoneHints: Record<OceanPhase, string> = {
  idle: "速く振るほど遠くへ。スマホをしっかり持ってください。", casting: "ルアーが飛んでいます。", waiting: "ウキが沈んだら、小さく引くかボタンをタッチ。",
  retrieving: "ルアーを巻き戻しています。", biting: "小さく引く、または下のボタンをタッチ。", fighting: "押して巻く。赤くなる前に離す。",
  caught: "一匹が群れになる、並行処理の魚。", escaped: "もう一度、海に投げてみよう。",
};

const cueFor = (phase: OceanPhase, tension: number, mode: string): string => {
  if (phase === "biting") return "いま、合わせる";
  if (tension > 80) return "糸が切れる。緩めて";
  if (tension < 14) return "糸が緩い。少し巻いて";
  if (mode === "warning") return "魚が、力をためている";
  if (mode === "split") return "引きが、急に重くなった";
  if (mode === "surge") return "強い引き。いったん緩める";
  return "いま、巻ける";
};

const dialogClick = (dialog: HTMLDialogElement, event: MouseEvent<HTMLDialogElement>): void => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
};

const collectionName = (entry: CollectionEntry): string => entry.id === "fish-001" ? "go fish" : entry.name ?? "名前のない魚";

function CollectionModel({ entry }: { entry: CollectionEntry }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;
    let preview: { dispose: () => void } | undefined;
    setFailed(false);
    void import("../rendering/collection-preview.js").then(({ mountCollectionFish }) => {
      if (disposed || !mountRef.current) return;
      try { preview = mountCollectionFish(mountRef.current); }
      catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { disposed = true; preview?.dispose(); };
  }, [entry.id, entry.modelKey]);
  return <>
    <div id="collection-model" ref={mountRef} hidden={failed} role="img" aria-label={`${collectionName(entry)}の3Dモデル。ドラッグまたは左右の矢印キーで回転。`} tabIndex={failed ? -1 : 0} />
    {failed && <p className="collection-model-error" role="status">魚の表示を読み込めませんでした。図鑑を開き直してください。</p>}
  </>;
}

function CollectionDialog({
  dialogRef, collection, selectedId, isOpen, onSelect, onClose, onClosed,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  collection: Collection;
  selectedId: string;
  isOpen: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const entries = collection.entries ?? [];
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0];
  const caught = selected?.status === "caught";
  const preview = selected?.status === "preview";
  const hasModel = caught && selected?.modelKey === "go-fish";

  return (
    <dialog ref={dialogRef} id="collection-dialog" className="collection-dialog" aria-labelledby="collection-title" onClose={onClosed} onClick={event => dialogClick(event.currentTarget, event)}>
      <div className="collection-shell">
        <header className="collection-header">
          <div className="collection-heading">
            <h2 id="collection-title">図鑑</h2>
            {collection.activeTotal > 0 && <span id="collection-count" className="collection-count">発見済み {collection.registered} / {collection.activeTotal}</span>}
          </div>
          <button className="collection-close" aria-label="図鑑を閉じる" title="海へ戻る" onClick={onClose}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2 14 14M14 2 2 14" /></svg></button>
        </header>
        {entries.length > 1 && (
          <nav className="collection-picker" aria-label="魚を選ぶ">
            {entries.map(entry => (
              <button key={entry.id} type="button" aria-current={entry.id === selected?.id ? "true" : undefined} onClick={() => onSelect(entry.id)}>
                <span aria-hidden="true">{String(entry.number).padStart(2, "0")}</span>
                {entry.status === "caught" ? collectionName(entry) : entry.status === "preview" ? "調査予定" : "未発見"}
              </button>
            ))}
          </nav>
        )}
        <section className="collection-detail" aria-labelledby="collection-detail-name">
          <div id="collection-preview" className="collection-preview">
            {hasModel && isOpen && selected && <CollectionModel key={selected.id} entry={selected} />}
            {!hasModel && <div className="collection-silhouette" aria-hidden="true">?</div>}
          </div>
          <div className="collection-detail-copy" aria-live="polite">
            <h3 id="collection-detail-name">{caught && selected ? collectionName(selected) : preview ? "これから出会う魚" : "まだ見ぬ魚"}</h3>
            <p id="collection-detail-description" className="collection-detail-description">
              {caught && selected ? selected.id === "fish-001" ? "群れに分かれ、同時に糸を引く魚。Goの並行処理を表しています。" : selected.description : preview ? "この魚は、まだ釣ることができません。" : "釣り上げた魚が、ここに残ります。"}
            </p>
            {caught && selected && <p className="collection-catches">{selected.catches} 回釣り上げた</p>}
          </div>
        </section>
      </div>
    </dialog>
  );
}
export function App() {
  const params = new URLSearchParams(window.location.search);
  const controllerId = params.get("controller");
  const isPhone = Boolean(controllerId);
  const oceanMountRef = useRef<HTMLDivElement>(null);
  const mastheadRef = useRef<HTMLElement>(null);
  const shoreControlsRef = useRef<HTMLElement>(null);
  const viewToggleRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const helpDialogRef = useRef<HTMLDialogElement>(null);
  const connectDialogRef = useRef<HTMLDialogElement>(null);
  const collectionDialogRef = useRef<HTMLDialogElement>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [sceneryOnly, setSceneryOnly] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const runtime = useOceanRuntime({ isPhone, controllerId, oceanMountRef, collectionOpen });
  const { state, online, controllers, displayConnected, renderFailed, reelHeld, feedback, toast, chargeProgress, reticle, soundEnabled, collection, selectedCollectionId, controllerUrl, sensorStatus, sensorButtonLabel, sensorsOn } = runtime;
  const { activate, cancelCharge, handlePointerDown, handlePointerUp, handlePointerCancel, startReel, stopReel, toggleSensor, toggleSound, showToast } = runtime.actions;
  const fighting = state.phase === "fighting";
  const biting = state.phase === "biting";
  const distanceVisible = ["casting", "waiting", "biting", "fighting"].includes(state.phase);
  const distanceMeters = Math.max(0, state.distance || 0).toFixed(1);
  const tension = Math.round((state.tension || 0) * 100);
  const tensionColor = tension > 80 ? "#ef9c80" : tension < 12 ? "#a9bfcb" : "#a6e4e7";
  const phoneCastLabel = state.phase === "idle" ? "タッチで投げる" : fighting ? (reelHeld ? "巻いている — 離すと緩む" : "押して巻く / 離して緩める") : phaseLabels[state.phase];
  const isLocalDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

  useEffect(() => { document.title = isPhone ? "釣り竿 — 技術釣り" : "技術釣り — 静かな海に、ひと振り。"; }, [isPhone]);
  useEffect(() => { document.body.dataset.phase = state.phase; }, [state.phase]);
  useEffect(() => {
    document.body.classList.toggle("scenery-only", sceneryOnly);
    if (mastheadRef.current) (mastheadRef.current as HTMLElement & { inert: boolean }).inert = sceneryOnly;
    if (shoreControlsRef.current) (shoreControlsRef.current as HTMLElement & { inert: boolean }).inert = sceneryOnly;
  }, [sceneryOnly]);
  useEffect(() => { document.body.classList.toggle("is-charging", chargeProgress > 0); }, [chargeProgress]);
  useEffect(() => {
    if (!["biting", "fighting", "caught", "escaped"].includes(state.phase)) return;
    if (sceneryOnly) setSceneryOnly(false);
    for (const dialog of [helpDialogRef.current, connectDialogRef.current, collectionDialogRef.current]) if (dialog?.open) dialog.close();
  }, [sceneryOnly, state.phase]);

  const openDialog = (dialog: RefObject<HTMLDialogElement | null>) => {
    cancelCharge();
    if (dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      if (dialog === collectionDialogRef) setCollectionOpen(true);
    }
  };
  const closeDialog = (dialog: RefObject<HTMLDialogElement | null>) => { if (dialog.current?.open) dialog.current.close(); };
  const showScenery = (hide: boolean) => {
    setSceneryOnly(hide);
    if (hide) window.setTimeout(() => restoreRef.current?.focus(), 0);
    else window.setTimeout(() => viewToggleRef.current?.focus(), 0);
  };
  useEffect(() => {
    let active = true;
    if (!controllerUrl) { setQrDataUrl(""); return () => { active = false; }; }
    void toDataURL(controllerUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
      color: { dark: "#102f3c", light: "#f2fbf8" },
    }).then(dataUrl => { if (active) setQrDataUrl(dataUrl); }).catch(() => { if (active) setQrDataUrl(""); });
    return () => { active = false; };
  }, [controllerUrl]);

  return (
    <>
      <main id="sea" aria-label="技術釣りの海" hidden={isPhone}>
        <div id="ocean" ref={oceanMountRef} role="img" aria-label="空の光が映る、穏やかな夕暮れの海" />
        <div className="edge-shade" aria-hidden="true" />
        <header ref={mastheadRef} className="masthead chrome">
          <div className="top-actions">
            <span id="connection-status" className="connection-status" hidden={controllers === 0}><i /><span>スマホ接続中</span></span>
            <button id="sound-toggle" className="quiet-button" aria-pressed={soundEnabled} aria-label={soundEnabled ? "音をオフにする" : "音をオンにする"} onClick={() => void toggleSound().catch(() => showToast("この環境では音を再生できません。"))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h4l5-4v12l-5-4H4z" /><path id="sound-wave" d={soundEnabled ? "M17 8q5 4 0 8m3-11q7 7 0 14" : "m17 9 5 6m0-6-5 6"} /></svg></button>
            <button ref={viewToggleRef} id="view-toggle" className="quiet-button" aria-label="景色だけを見る" aria-pressed={sceneryOnly} onClick={() => showScenery(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg></button>
          </div>
        </header>
        <div className={`cast-feedback${feedback.faded ? " is-faded" : ""}`} aria-live="polite" aria-atomic="true"><span id="cast-status">{feedback.text}</span><small id="cast-detail">{feedback.detail}</small></div>
        <output id="distance-meter" className="distance-meter" hidden={!distanceVisible} aria-label={fighting ? "魚までの距離" : "距離"}>{distanceMeters}m</output>
        <div id="cast-reticle" aria-hidden="true" style={reticle ? { left: reticle.x, top: reticle.y } : undefined} />
        <section id="fight-ui" className="fight-ui" hidden={!fighting && !biting} aria-label="魚との駆け引き" data-tension={tension} data-mode={state.mode}>
          <p id="fight-cue" role="status">{cueFor(state.phase, tension, state.mode)}</p>
          <div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension} aria-valuetext={`${tension}%`} style={{ "--tension-color": tensionColor } as CSSProperties}><span id="tension-fill" style={{ width: `${tension}%` }} /><i /></div>
          <button id="fight-button" className={`fight-button${reelHeld ? " is-held" : ""}`} disabled={!online || renderFailed} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}>{biting ? "合わせる" : reelHeld ? "巻いている — 離すと緩む" : "押して巻く"}</button><small id="fight-guide">{biting ? "SPACE / スマホを小さく引く" : "R 長押しで巻く / 離すと緩む"}</small>
        </section>
        <section id="catch-ui" className="catch-ui" hidden={state.phase !== "caught"} aria-live="polite"><p>NEW ENCOUNTER</p><h1>go fish</h1><p>ひとつの光が、群れになる。</p><button id="catch-again" className="primary-button" disabled={!online} onClick={() => activate()}>もう一度、海へ</button></section>
        <section id="escape-ui" className="escape-ui" hidden={state.phase !== "escaped"} aria-live="polite"><h2>{runtime.state.reason ? (failureHints[runtime.state.reason]?.[0] ?? "逃げられた。") : "逃げられた。"}</h2><p>{runtime.state.reason ? (failureHints[runtime.state.reason]?.[1] ?? "") : ""}</p><button id="escape-again" className="primary-button" disabled={!online} onClick={() => activate()}>もう一度、投げる</button></section>
        <div className="bottom-shade" aria-hidden="true" />
        <footer ref={shoreControlsRef} className="shore-controls chrome">
          <button className="shore-link" onClick={() => openDialog(helpDialogRef)}><span className="help-mark">?</span> あそびかた</button>
          <div className="entry-actions">
            <button id="connect-button" className="connect-button" onClick={() => openDialog(connectDialogRef)}><svg viewBox="0 0 20 24" aria-hidden="true"><rect x="4" y="2" width="12" height="20" rx="2" /><path d="M8 18h4" /></svg><span>スマホで釣る</span><span className="entry-arrow" aria-hidden="true">↗</span></button>
            <button id="cast-button" className="cast-button" aria-label={state.phase === "waiting" ? "ルアーを巻き戻す" : "押してためて、離して投げる"} disabled={!online || renderFailed || ["casting", "retrieving"].includes(state.phase)} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}><span id="cast-button-label">{phaseLabels[state.phase]}</span><span className="key-hint" aria-hidden="true">SPACE</span></button>
            <span className="cast-charge" aria-hidden="true"><span id="charge-fill" style={{ width: `${chargeProgress * 100}%` }} /></span>
          </div>
          <button className="shore-link" onClick={() => openDialog(collectionDialogRef)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2Z" /></svg> 図鑑</button>
        </footer>
        <button ref={restoreRef} id="restore-ui" hidden={!sceneryOnly} onClick={() => showScenery(false)}>操作を表示</button>
        <p id="render-notice" className="render-notice" role="status" hidden={!renderFailed}>海の描画を開始できませんでした。WebGLが使えるブラウザで開き直してください。</p>
      </main>
      <section id="phone" className="phone" hidden={!isPhone} aria-label="釣り竿コントローラー" data-fight={String(fighting || biting)}>
        <a className="phone-brand" href="./">技術釣り</a><span id="phone-connection" className="phone-connection">{displayConnected ? "海につながっています" : online ? "海の画面が閉じています" : "海との接続が切れています"}</span>
        <div className="phone-instruction"><p id="phone-kicker">YOUR FISHING ROD</p><h1 id="phone-title">{phoneTitles[state.phase]}</h1><p id="phone-hint">{phoneHints[state.phase]}</p></div>
        <div className="rod-symbol" aria-hidden="true"><svg viewBox="0 0 160 230"><path d="M48 220 93 32 Q101 14 113 18" /><path className="rod-thread" d="M113 18q22 112-12 164" /><circle cx="101" cy="185" r="4" /><path d="m85 51 15 4m-19 11 16 4m-30 53 16 4" /></svg></div>
        <div id="phone-tension" className="phone-tension" hidden={!fighting}><output id="phone-distance" className="phone-distance" aria-label="魚までの距離">{distanceMeters}m</output><div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension} aria-valuetext={`${tension}%`} style={{ "--tension-color": tensionColor } as CSSProperties}><span id="phone-tension-fill" style={{ width: `${tension}%` }} /><i /></div><p id="phone-fight-cue">{cueFor(state.phase, tension, state.mode)}</p></div>
        <button id="sensor-button" className="primary-button" onClick={() => void toggleSensor()}>{sensorButtonLabel}</button><button id="phone-cast" className={`phone-cast${reelHeld ? " is-held" : ""}`} disabled={!online || !displayConnected || ["casting", "retrieving"].includes(state.phase)} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}>{phoneCastLabel}</button><p id="sensor-status" className="sensor-status" role="status">{sensorStatus}</p>
      </section>
      <dialog ref={helpDialogRef} id="help-dialog" aria-labelledby="help-title" onClick={event => dialogClick(event.currentTarget, event)}>
        <button className="close-dialog quiet-button" aria-label="閉じる" onClick={() => closeDialog(helpDialogRef)}>×</button><p className="eyebrow">HOW TO FISH</p><h2 id="help-title">静かな海に、ひと振り。</h2>
        <ol className="instructions"><li><span>01</span><div><strong>海へ、投げる。</strong><p>スマホは速く振るほど遠くへ飛びます。タッチやSpaceでも投げられます。</p></div></li><li><span>02</span><div><strong>アタリが来たら、合わせる。</strong><p>ウキが沈んだら、ボタン・Space、またはスマホを小さく引きます。</p></div></li><li><span>03</span><div><strong>巻く、緩める。</strong><p>ボタンかRを押している間、巻きます。赤くなる前に離して緩め、青い間に巻きましょう。緩めすぎても逃げます。</p></div></li></ol>
        <p className="fine-print">スマホはしっかり持ち、手首の小さな動きで。リールはタッチ操作です。キーボードではSpaceで合わせ、Rで巻きます。</p>
      </dialog>
      <dialog ref={connectDialogRef} id="connect-dialog" aria-label="スマホを接続" aria-describedby="pairing-description" onClick={event => dialogClick(event.currentTarget, event)}>
        <button className="close-dialog quiet-button" aria-label="閉じる" onClick={() => closeDialog(connectDialogRef)}>×</button><p id="pairing-description">QRコードを読み取ってください。</p>
        <div className={`pairing-qr${qrDataUrl ? "" : " is-loading"}`} aria-live="polite">{qrDataUrl ? <img id="controller-qr" src={qrDataUrl} alt="スマホ接続用QRコード" /> : "QRコードを準備中…"}</div>
        {isLocalDevelopment && <p id="pairing-note" className="fine-print">PCとスマホを同じWi-Fiに接続してください。</p>}
      </dialog>
      <CollectionDialog dialogRef={collectionDialogRef} collection={collection} selectedId={selectedCollectionId} isOpen={collectionOpen} onSelect={runtime.setSelectedCollectionId} onClose={() => closeDialog(collectionDialogRef)} onClosed={() => setCollectionOpen(false)} />
      <div id="toast" className={`toast${toast ? " visible" : ""}`} role="status">{toast}</div>
      <noscript><p className="render-notice">この海を動かすにはJavaScriptを有効にしてください。</p></noscript>
    </>
  );
}
