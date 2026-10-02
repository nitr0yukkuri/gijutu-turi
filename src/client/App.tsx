import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { toDataURL } from "qrcode";
import { getFishSpecies, isFishSpeciesId, type FishSilhouetteKey } from "../fish-species.js";
import { resolveFishingRoute } from "./fishing-route.js";
import { useOceanRuntime } from "./useOceanRuntime.js";
import { PhoneReelControl } from "./PhoneReelControl.js";
import type { Collection, CollectionEntry, OceanPhase } from "./types.js";


const phaseLabels: Record<OceanPhase, string> = {
  idle: "投げる", casting: "投げています", waiting: "回収する", retrieving: "戻しています",
  biting: "合わせる", fighting: "巻く", caught: "もう一度釣る", escaped: "もう一度投げる",
};

const phoneTitles: Record<OceanPhase, ReactNode> = {
  idle: <>投げる</>, casting: <>投げています</>, waiting: <>アタリを<br />待っています</>,
  retrieving: <>ルアーを<br />回収しています</>, biting: <>合わせる</>, fighting: <>魚とファイト中</>,
  caught: <>釣れました</>, escaped: <>逃げられました</>,
};

const failureHints: Record<string, [string, string]> = {
  missed: ["合わせるタイミングが遅れました。", "ウキが沈んだら、ボタンを押してください。"],
  line: ["糸が切れました。", "糸の張りが赤くなる前に、巻くのを止めてください。"],
  slack: ["針が外れました。", "魚が掛かったら、糸を緩めすぎないでください。"],
  distance: ["魚が逃げました。", "魚が落ち着いている間に、少しずつ巻いてください。"],
};

const phoneHints: Record<OceanPhase, string> = {
  idle: "スマホを振って投げます。強く振るほど遠くへ飛びます。", casting: "そのままお待ちください。", waiting: "ウキが沈んだら、画面をタップするかスマホを小さく引きます。",
  retrieving: "ルアーを回収しています。", biting: "画面のボタンを押すか、スマホを小さく引きます。", fighting: "魚が落ち着いたら回して巻く。走ったら止めて待つ。手前に引いて戻すと竿を引けます。",
  caught: "釣り上げた魚を図鑑に記録しました。", escaped: "もう一度投げてください。",
};

const dialogClick = (dialog: HTMLDialogElement, event: MouseEvent<HTMLDialogElement>): void => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
};

const collectionName = (entry: CollectionEntry): string => {
  // The API can outlive a frontend deployment and still carry an older
  // catalog label. Keep the visible name tied to the species registry so a
  // stale SQLite row can never bring back "CSS特徴魚".
  if (entry.id === "fish-001") return "go fish";
  if (isFishSpeciesId(entry.id)) return getFishSpecies(entry.id).name;
  return entry.name ?? "名前のない魚";
};

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
      try { preview = mountCollectionFish(mountRef.current, entry.modelKey ?? "go-fish"); }
      catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { disposed = true; preview?.dispose(); };
  }, [entry.id, entry.modelKey]);
  return <>
    <div id="collection-model" ref={mountRef} hidden={failed} role="img" aria-label={`${collectionName(entry)}の3Dモデル。ドラッグまたは左右の矢印キーで回転。`} tabIndex={failed ? -1 : 0} />
    {failed && <p className="collection-model-error" role="status">魚の表示を読み込めませんでした。図鑑を開き直してください。</p>}
  </>;
}

function CollectionSilhouette({ silhouetteKey, label }: { silhouetteKey: FishSilhouetteKey; label: string }) {
  return (
    <div className={`collection-silhouette collection-silhouette--${silhouetteKey}`} role="img" aria-label={`${label}のシルエット`}>
      <svg viewBox="0 0 360 180" aria-hidden="true" focusable="false">
        {silhouetteKey === "go-school" && <g className="silhouette-ghosts">
          <path d="M64 94C78 58 126 40 188 55c27 7 46 21 55 39-12 19-32 32-58 38-61 14-108-2-121-38Z" transform="translate(-26 10) scale(.82)" />
          <path d="M64 94C78 58 126 40 188 55c27 7 46 21 55 39-12 19-32 32-58 38-61 14-108-2-121-38Z" transform="translate(22 -7) scale(.82)" />
        </g>}
        {silhouetteKey === "cluster-leviathan" && <g className="silhouette-ghosts">
          <path d="M53 94C62 56 111 38 180 49c37 6 61 22 76 45-15 23-39 37-76 43-69 10-118-8-127-43Z" transform="translate(-25 10) scale(.76)" />
          <path d="M53 94C62 56 111 38 180 49c37 6 61 22 76 45-15 23-39 37-76 43-69 10-118-8-127-43Z" transform="translate(23 -8) scale(.76)" />
        </g>}
        <path className="silhouette-body" d={silhouetteKey === "docker-whale"
          ? "M47 94C54 56 101 35 169 45c48 7 81 26 96 49-15 28-48 45-98 48-67 4-113-15-120-48Z"
          : silhouetteKey === "cluster-leviathan"
            ? "M48 94C56 55 102 36 169 46c45 6 77 24 94 48-17 27-49 43-95 48-66 7-114-11-120-48Z"
          : silhouetteKey === "go-school"
            ? "M58 93C70 55 119 39 184 52c31 6 53 21 65 40-14 21-36 34-66 40-64 12-113-2-125-39Z"
            : "M76 94C86 62 125 47 179 57c27 5 45 18 55 36-10 18-29 30-55 35-53 10-93-2-103-34Z"} />
        {silhouetteKey === "docker-whale" ? <>
          <path className="silhouette-tail" d="M245 92c23-16 45-27 70-30-10 13-11 24-5 34-7 11-6 22 5 35-27-5-49-18-70-34Z" />
          <rect className="silhouette-container" x="103" y="48" width="48" height="25" rx="3" />
          <path className="silhouette-fin" d="M115 53 132 29l17 22Z" />
        </> : <>
          <path className="silhouette-tail" d={silhouetteKey === "go-school"
            ? "M237 91c25-22 51-31 79-34-14 13-18 25-12 36-6 11-2 23 12 37-29-4-55-16-79-35Z"
            : silhouetteKey === "cluster-leviathan"
              ? "M242 91c24-19 47-27 72-31-11 12-13 23-7 34-6 11-4 22 7 34-25-4-48-15-72-31Z"
              : "M227 92c22-18 44-25 67-27-9 12-10 21-4 29-6 9-4 19 5 29-25-3-46-13-68-29Z"} />
          <path className="silhouette-fin" d={silhouetteKey === "css-fish" ? "M112 59 142 31l19 32Z" : silhouetteKey === "cluster-leviathan" ? "M111 57 138 34l22 31-28 4Z" : "M117 57 149 27l17 36Z"} />
          <path className="silhouette-fin silhouette-fin--lower" d="M137 125 159 151l12-31Z" />
        </>}
        <circle className="silhouette-eye" cx={silhouetteKey === "css-fish" ? 90 : 77} cy="82" r="4" />
        <path className="silhouette-gill" d={silhouetteKey === "docker-whale" ? "M94 73c-7 14-7 27 0 39" : "M101 72c-7 13-7 25 0 37"} />
        {silhouetteKey === "css-fish" && <path className="silhouette-color-trace" d="M92 111c35 10 68 9 103-1" />}
      </svg>
      <span className="collection-silhouette-caption">魚影を観察中</span>
    </div>
  );
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
  const selectedSpecies = selected && isFishSpeciesId(selected.id) ? getFishSpecies(selected.id) : undefined;
  const hasModel = Boolean(caught && selected?.modelKey && selectedSpecies?.modelKey === selected.modelKey);
  const silhouetteKey = selectedSpecies?.silhouetteKey ?? "css-fish";

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
                {entry.status === "caught" ? collectionName(entry) : entry.status === "preview" ? "調査予定" : "？？？"}
              </button>
            ))}
          </nav>
        )}
        <section className="collection-detail" aria-labelledby="collection-detail-name">
          <div id="collection-preview" className="collection-preview">
            {hasModel && isOpen && selected && <CollectionModel key={selected.id} entry={selected} />}
            {!hasModel && <CollectionSilhouette silhouetteKey={silhouetteKey} label={selectedSpecies?.unknownTitle ?? "未発見の魚影"} />}
          </div>
          <div className="collection-detail-copy" aria-live="polite">
            {caught && selected ? <>
              <h3 id="collection-detail-name">{collectionName(selected)}</h3>
              <p id="collection-detail-description" className="collection-detail-description">{selected.description ?? selected.tagline ?? "この魚の記録です。"}</p>
              <p className="collection-catches">{selected.catches} 回釣り上げた</p>
            </> : preview ? <>
              <p className="collection-eyebrow">調査予定</p>
              <h3 id="collection-detail-name">これから出会う魚</h3>
              <p id="collection-detail-description" className="collection-detail-description">この魚は、まだ釣ることができません。</p>
            </> : <>
              <p className="collection-eyebrow">観察メモ</p>
              <h3 id="collection-detail-name">{selectedSpecies?.unknownTitle ?? "まだ見ぬ魚"}</h3>
              <p id="collection-detail-description" className="collection-detail-description">{selectedSpecies?.unknownHint ?? "魚影の特徴を調査中です。"}</p>
              {selectedSpecies && <>
                <ul className="collection-traits" aria-label="観察された特徴">
                  {selectedSpecies.traits.map(trait => <li key={trait}>{trait}</li>)}
                </ul>
                <p className="collection-observation">{selectedSpecies.observation}</p>
              </>}
            </>}
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
  const fishingRoute = resolveFishingRoute(window.location.pathname, params.get("fish"));
  const oceanMountRef = useRef<HTMLDivElement>(null);
  const helpDialogRef = useRef<HTMLDialogElement>(null);
  const connectDialogRef = useRef<HTMLDialogElement>(null);
  const collectionDialogRef = useRef<HTMLDialogElement>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const runtime = useOceanRuntime({ isPhone, controllerId, initialFishId: fishingRoute.initialFishId, routePath: fishingRoute.path, oceanMountRef, collectionOpen });
  const { state, online, displayConnected, renderFailed, reelHeld, feedback, hookFeedback, rodStrokeRevision, newEncounter, toast, chargeProgress, reticle, soundEnabled, collection, selectedCollectionId, controllerUrl, sensorStatus, sensorButtonLabel, sensorsOn } = runtime;
  const { activate, cancelCharge, handlePointerDown, handlePointerUp, handlePointerCancel, startReel, stopReel, performRodStroke, toggleSensor, toggleSound, showToast } = runtime.actions;
  const fighting = state.phase === "fighting";
  const biting = state.phase === "biting";
  const caughtEntry = collection.entries.find(entry => entry.id === state.fishId);
  const fightButtonLabel = biting ? "合わせる" : reelHeld ? "巻いています" : "巻く";
  const fightButtonHint = biting ? (state.criticalWindow ? "今押すと、ナイスフッキング！" : "ウキが沈んだら押す") : reelHeld ? "離して止める" : "押して巻く";
  const resultActionLabel = online ? "もう一度、投げる" : "再接続中…";
  const resultConnectionHint = online ? "" : "海との接続が戻ると、もう一度投げられます。";
  const distanceVisible = ["casting", "waiting", "biting", "fighting", "caught"].includes(state.phase);
  const distanceMeters = state.phase === "caught" ? "0.0" : Math.max(0, state.distance || 0).toFixed(1);
  const tension = Math.round((state.tension || 0) * 100);
  const tensionColor = tension > 80 ? "#ef9c80" : tension < 12 ? "#a9bfcb" : "#a6e4e7";
  const phoneCastLabel = state.phase === "idle" ? "タッチで投げる" : fighting ? (reelHeld ? "巻いている — 離すと緩む" : "押して巻く / 離して緩める") : phaseLabels[state.phase];
  const isLocalDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

  useEffect(() => { document.title = isPhone ? "釣り竿 — 技術釣り" : fishingRoute.title; }, [fishingRoute.title, isPhone]);
  useEffect(() => { document.body.dataset.phase = state.phase; }, [state.phase]);
  useEffect(() => { document.body.classList.toggle("is-charging", chargeProgress > 0); }, [chargeProgress]);
  useEffect(() => {
    if (!["biting", "fighting", "caught", "escaped"].includes(state.phase)) return;
    for (const dialog of [helpDialogRef.current, connectDialogRef.current, collectionDialogRef.current]) if (dialog?.open) dialog.close();
  }, [state.phase]);

  const openDialog = (dialog: RefObject<HTMLDialogElement | null>) => {
    cancelCharge();
    if (dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      if (dialog === collectionDialogRef) setCollectionOpen(true);
    }
  };
  const closeDialog = (dialog: RefObject<HTMLDialogElement | null>) => { if (dialog.current?.open) dialog.current.close(); };
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
        <header className="masthead">
          <div className="top-actions">
            <button id="sound-toggle" className="quiet-button" aria-pressed={soundEnabled} aria-label={soundEnabled ? "音をオフにする" : "音をオンにする"} onClick={() => void toggleSound().catch(() => showToast("この環境では音を再生できません。"))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h4l5-4v12l-5-4H4z" /><path id="sound-wave" d={soundEnabled ? "M17 8q5 4 0 8m3-11q7 7 0 14" : "m17 9 5 6m0-6-5 6"} /></svg></button>
          </div>
        </header>
        <div className={`cast-feedback${feedback.faded ? " is-faded" : ""}`} aria-live="polite" aria-atomic="true"><span id="cast-status">{feedback.text}</span><small id="cast-detail">{feedback.detail}</small></div>
        <output id="distance-meter" className="distance-meter" hidden={!distanceVisible} aria-label={fighting ? "魚までの距離" : "距離"}>{distanceMeters}m</output>
        <div id="cast-reticle" aria-hidden="true" style={reticle ? { left: reticle.x, top: reticle.y } : undefined} />
        <section id="fight-ui" className="fight-ui" hidden={!fighting && !biting} aria-label="魚との駆け引き" data-tension={tension} data-mode={state.mode}>
          {hookFeedback && <p className="hook-critical-status" role="status">ナイスフッキング！</p>}
          <div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension} aria-valuetext={`${tension}%`} style={{ "--tension-color": tensionColor } as CSSProperties}><span id="tension-fill" style={{ width: `${tension}%` }} /><i /></div>
          <button id="fight-button" className={`fight-button${reelHeld ? " is-held" : ""}${biting ? " is-hook" : ""}${biting && state.criticalWindow ? " is-critical-window" : ""}`} aria-label={biting ? state.criticalWindow ? "今が狙いどき。合わせる" : "合わせる。ウキが沈んだら押す" : reelHeld ? "巻いています。離して止める" : "巻く。押して巻く"} disabled={!online || renderFailed} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}>
            <span className="fight-button-label">{fightButtonLabel}</span><small className="fight-button-help">{fightButtonHint}</small>
          </button>
        </section>
        <section id="catch-ui" className="catch-ui" hidden={state.phase !== "caught"} aria-live="polite"><p>{newEncounter ? "NEW ENCOUNTER" : "FISH CAUGHT"}</p><h1>{caughtEntry ? collectionName(caughtEntry) : "魚"}</h1><p>{caughtEntry?.tagline ?? "魚を釣り上げました。"}</p><button id="catch-again" className="primary-button" disabled={!online} onClick={() => activate()}>{online ? "もう一度、海へ" : "再接続中…"}</button>{!online && <p className="result-connection" role="status">{resultConnectionHint}</p>}</section>
        <section id="escape-ui" className="escape-ui" hidden={state.phase !== "escaped"} aria-live="polite"><h2>{runtime.state.reason ? (failureHints[runtime.state.reason]?.[0] ?? "逃げられた。") : "逃げられた。"}</h2><p>{runtime.state.reason ? (failureHints[runtime.state.reason]?.[1] ?? "") : ""}</p><button id="escape-again" className="primary-button" disabled={!online} onClick={() => activate()}>{resultActionLabel}</button>{!online && <p className="result-connection" role="status">{resultConnectionHint}</p>}</section>
        <div className="bottom-shade" aria-hidden="true" />
        <footer className="shore-controls">
          <button className="shore-link" onClick={() => openDialog(helpDialogRef)}><span className="help-mark">?</span> 操作方法</button>
          <div className="entry-actions">
            <button id="cast-button" className="cast-button" aria-label={state.phase === "idle" ? "投げる。長押しして、離す" : state.phase === "waiting" ? "ルアーを回収する" : phaseLabels[state.phase]} disabled={!online || renderFailed || ["casting", "retrieving"].includes(state.phase)} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}><span id="cast-button-label">{phaseLabels[state.phase]}</span></button>
            <span className="cast-charge" aria-hidden="true"><span id="charge-fill" style={{ width: `${chargeProgress * 100}%` }} /></span>
            <button id="connect-button" className="connect-button" aria-label="スマホを接続" onClick={() => openDialog(connectDialogRef)}><svg viewBox="0 0 20 24" aria-hidden="true"><rect x="4" y="2" width="12" height="20" rx="2" /><path d="M8 18h4" /></svg><span>スマホを接続</span></button>
          </div>
          <button className="shore-link" onClick={() => openDialog(collectionDialogRef)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2Z" /></svg> 図鑑</button>
        </footer>
        <p id="render-notice" className="render-notice" role="status" hidden={!renderFailed}>海の描画を開始できませんでした。WebGLが使えるブラウザで開き直してください。</p>
      </main>
      <section id="phone" className="phone" hidden={!isPhone} aria-label="釣り竿コントローラー" data-fight={String(fighting || biting)}>
        <a className="phone-brand" href="./">技術釣り</a><div id="phone-connection" className="phone-connection" data-connected={String(online && displayConnected)} aria-live="polite"><i aria-hidden="true" /><span>{!online ? "海に接続しています…" : displayConnected ? "PC画面と接続済み" : "PC画面を待っています"}</span></div>
        <div className="phone-instruction"><p id="phone-kicker">スマホ操作</p><h1 id="phone-title">{phoneTitles[state.phase]}</h1><p id="phone-hint">{state.phase === "caught" && caughtEntry ? caughtEntry.tagline : fighting ? "回して巻く。手前に引いて戻すと、竿を引けます。" : biting && state.criticalWindow ? "今が狙いどき。画面をタップするか、小さく引いて合わせます。" : phoneHints[state.phase]}</p>{hookFeedback && <p className="hook-critical-status" role="status">ナイスフッキング！</p>}</div>
        <div key={rodStrokeRevision} className={`rod-symbol${fighting ? " is-fighting" : ""}`} aria-hidden="true"><svg viewBox="0 0 160 230"><path d="M48 220 93 32 Q101 14 113 18" /><path className="rod-thread" d="M113 18q22 112-12 164" /><circle cx="101" cy="185" r="4" /><path d="m85 51 15 4m-19 11 16 4m-30 53 16 4" /></svg></div>
        <div id="phone-tension" className="phone-tension" hidden={!fighting}><output id="phone-distance" className="phone-distance" aria-label="魚までの距離">{distanceMeters}m</output><div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension} aria-valuetext={`${tension}%`} style={{ "--tension-color": tensionColor } as CSSProperties}><span id="phone-tension-fill" style={{ width: `${tension}%` }} /><i /></div></div>
        <button id="sensor-button" className="primary-button" onClick={() => void toggleSensor()}>{sensorButtonLabel}</button>
        {fighting ? <><PhoneReelControl active={reelHeld} disabled={!online || !displayConnected} onStart={startReel} onStop={stopReel} /><button type="button" className="phone-rod-pump" disabled={!online || !displayConnected} onClick={performRodStroke}><span>竿を引く</span><small>手前に引いて、元の位置へ戻す</small></button></> : <button id="phone-cast" className={`phone-cast${reelHeld ? " is-held" : ""}${biting && state.criticalWindow ? " is-critical-window" : ""}`} disabled={!online || !displayConnected || ["casting", "retrieving"].includes(state.phase)} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}>{biting && state.criticalWindow ? "今、合わせる！" : phoneCastLabel}</button>}
        <p id="sensor-status" className="sensor-status" role="status">{sensorStatus}</p>
      </section>
      <dialog ref={helpDialogRef} id="help-dialog" aria-labelledby="help-title" onClick={event => dialogClick(event.currentTarget, event)}>
        <button className="close-dialog quiet-button" aria-label="閉じる" onClick={() => closeDialog(helpDialogRef)}>×</button>
        <header className="help-header"><p className="eyebrow">操作方法</p><h2 id="help-title">釣り方</h2><p className="help-lead">画面中央のボタンを順番に使います。</p></header>
        <ol className="instructions">
          <li><span>1</span><div><div className="instruction-heading"><strong>投げる</strong></div><p>「投げる」を長押しし、好きなタイミングで離します。長く押すほど遠くへ飛びます。スペースキーでも操作できます。</p></div></li>
          <li><span>2</span><div><div className="instruction-heading"><strong>合わせる</strong></div><p>ウキが沈み、ボタンが「合わせる」に変わったら押します。</p></div></li>
          <li><span>3</span><div><div className="instruction-heading"><strong>巻く・竿を引く</strong></div><p>魚が走っている間は巻かずに待ちます。落ち着いたら「巻く」を押し、糸の張りが赤くなったらいったん離します。スマホでは、手前に引いて元の位置へ戻すと竿を引けます。これはリールを巻く操作とは別です。</p></div></li>
        </ol>
        <p className="fine-print">スマホを使う場合は「スマホを接続」からQRコードを読み取り、スマホ画面の指示に従ってください。</p>
      </dialog>
      <dialog ref={connectDialogRef} id="connect-dialog" aria-label="スマホを接続" aria-describedby="pairing-description" onClick={event => dialogClick(event.currentTarget, event)}>
        <button className="close-dialog quiet-button" aria-label="閉じる" onClick={() => closeDialog(connectDialogRef)}>×</button><p id="pairing-description">スマホで読み取って接続</p>
        <div className={`pairing-qr${qrDataUrl ? "" : " is-loading"}`} aria-live="polite">{qrDataUrl ? <img id="controller-qr" src={qrDataUrl} alt="スマホ接続用QRコード" /> : "QRコードを準備中…"}</div>
        {isLocalDevelopment && <p id="pairing-note" className="fine-print">PCとスマホを同じWi-Fiに接続してください。</p>}
      </dialog>
      <CollectionDialog dialogRef={collectionDialogRef} collection={collection} selectedId={selectedCollectionId} isOpen={collectionOpen} onSelect={runtime.setSelectedCollectionId} onClose={() => closeDialog(collectionDialogRef)} onClosed={() => setCollectionOpen(false)} />
      <div id="toast" className={`toast${toast ? " visible" : ""}`} role="status">{toast}</div>
      <noscript><p className="render-notice">この海を動かすにはJavaScriptを有効にしてください。</p></noscript>
    </>
  );
}
