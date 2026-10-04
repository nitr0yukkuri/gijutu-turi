import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { toDataURL } from "qrcode";
import { getFishSpecies, isFishSpeciesId, type FishSilhouetteKey } from "../fish-species.js";
import { OCEAN_RENDER_DELAY_MS } from "../ocean-timing.js";
import { canContinueAfterCatchSave } from "../ocean-contract.js";
import { k8sLungeForSnapshot } from "../rendering/k8s-fight-presentation.js";
import { resolveFishingRoute } from "./fishing-route.js";
import { TECH_TREE_BRANCHES, TECH_TREE_FISH_LINKS, TECH_TREE_NODE_DETAILS } from "./tech-tree.js";
import { isCompletePreviewPath, techTreeReveal } from "./tech-tree-preview.js";
import { useOceanRuntime } from "./useOceanRuntime.js";
import { PhoneReelControl } from "./PhoneReelControl.js";
import type { Collection, CollectionEntry, OceanPhase } from "./types.js";
import "./tech-tree.css";
import "./responsive.css";


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

function CollectionModel({ entry, modelKey = entry.modelKey ?? "go-fish", silhouette = false }: { entry: CollectionEntry; modelKey?: string; silhouette?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;
    let preview: { dispose: () => void } | undefined;
    setFailed(false);
    void import("../rendering/collection-preview.js").then(({ mountCollectionFish }) => {
      if (disposed || !mountRef.current) return;
      try { preview = mountCollectionFish(mountRef.current, modelKey, { silhouette }); }
      catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { disposed = true; preview?.dispose(); };
  }, [entry.id, modelKey, silhouette]);
  const label = silhouette ? "未発見の魚影" : collectionName(entry);
  return <>
    <div id="collection-model" ref={mountRef} hidden={failed} role="img" aria-label={`${label}。ドラッグまたは左右の矢印キーで回転。`} tabIndex={failed ? -1 : 0}>
      {silhouette && <span className="collection-silhouette-caption">魚影を観察中</span>}
    </div>
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
        {silhouetteKey === "rust-striped-marlin" && <path className="silhouette-bill" d="M80 84 18 80 78 93Z" />}
        <path className="silhouette-body" d={silhouetteKey === "rust-striped-marlin"
          ? "M75 91C84 70 105 57 132 55c42-4 91 11 138 35-22 24-58 36-105 39-47 3-79-11-90-38Z"
          : silhouetteKey === "js-eel"
          ? "M30 91C45 79 61 71 85 70c27-4 54 0 84 5 37 7 69 15 98 19 25 3 48-2 73-10-17 15-37 23-62 26-31 3-58-2-91-5-43 7-75 10-102 3-26-5-44-11-55-17Z"
          : silhouetteKey === "docker-whale"
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
          <path className="silhouette-tail" d={silhouetteKey === "rust-striped-marlin"
            ? "M261 91c22-20 45-28 69-31-10 12-12 22-7 32-6 10-4 20 7 31-24-4-47-15-69-32Z"
            : silhouetteKey === "js-eel"
            ? "M302 91c19-7 38-8 54-5-10 6-12 11-6 17-9 5-19 6-35 1Z"
            : silhouetteKey === "go-school"
            ? "M237 91c25-22 51-31 79-34-14 13-18 25-12 36-6 11-2 23 12 37-29-4-55-16-79-35Z"
            : silhouetteKey === "cluster-leviathan"
              ? "M242 91c24-19 47-27 72-31-11 12-13 23-7 34-6 11-4 22 7 34-25-4-48-15-72-31Z"
              : "M227 92c22-18 44-25 67-27-9 12-10 21-4 29-6 9-4 19 5 29-25-3-46-13-68-29Z"} />
          <path className="silhouette-fin" d={silhouetteKey === "rust-striped-marlin" ? "M104 66Q116 56 124 24Q133 23 140 38L164 59Q184 62 204 68Z" : silhouetteKey === "js-eel" ? "M94 75C141 69 190 76 235 88c28 8 52 10 76 3l22-7c-17 15-38 21-64 17-42-7-76-21-119-24-23-2-42 0-56 4Z" : silhouetteKey === "css-fish" ? "M112 59 142 31l19 32Z" : silhouetteKey === "cluster-leviathan" ? "M111 57 138 34l22 31-28 4Z" : "M117 57 149 27l17 36Z"} />
          <path className="silhouette-fin silhouette-fin--lower" d={silhouetteKey === "rust-striped-marlin" ? "M139 118 165 141l18-22Z" : silhouetteKey === "js-eel" ? "M111 106c37 10 71 7 104 2 35 5 63 8 94-2-20 18-52 18-92 9-43 7-78 6-106-9Z" : "M137 125 159 151l12-31Z"} />
        </>}
        {silhouetteKey === "rust-striped-marlin" && <g className="silhouette-stripes">
          <path d="M124 59Q116 83 128 119M143 56Q136 84 148 124M163 56Q158 84 169 126M184 60Q179 87 190 123M205 65Q201 88 211 118M225 72Q222 91 231 111M244 80Q242 94 249 104" />
        </g>}
        {silhouetteKey === "js-eel" && <g className="silhouette-anago-spots">
          <circle cx="108" cy="91" r="2.2" /><circle cx="127" cy="92" r="2.2" />
          <circle cx="146" cy="94" r="2.2" /><circle cx="165" cy="96" r="2.2" />
          <circle cx="184" cy="98" r="2.2" /><circle cx="203" cy="99" r="2.2" />
          <circle cx="222" cy="100" r="2.2" /><circle cx="241" cy="101" r="2.2" />
        </g>}
        {silhouetteKey === "js-eel" && <path className="silhouette-anago-jaw" d="M29 91Q48 87 69 92" />}
        <circle className="silhouette-eye" cx={silhouetteKey === "rust-striped-marlin" ? 96 : silhouetteKey === "js-eel" ? 78 : silhouetteKey === "css-fish" ? 90 : 77} cy="82" r={silhouetteKey === "js-eel" ? 5 : 4} />
        <path className="silhouette-gill" d={silhouetteKey === "rust-striped-marlin" ? "M112 72c-6 12-6 25 1 37" : silhouetteKey === "js-eel" ? "M101 75c-4 8-4 16 0 24" : silhouetteKey === "docker-whale" ? "M94 73c-7 14-7 27 0 39" : "M101 72c-7 13-7 25 0 37"} />
        {silhouetteKey === "css-fish" && <path className="silhouette-color-trace" d="M92 111c35 10 68 9 103-1" />}
      </svg>
      <span className="collection-silhouette-caption">魚影を観察中</span>
    </div>
  );
}

function FishTechIcon({ speciesId }: { speciesId: string }) {
  const fish = speciesId === "whale-001" ? <>
    <path className="tech-tree-fish-fill" d="M6 24c7-10 21-14 38-9 5 2 9 5 11 9-3 8-13 14-28 14C16 38 9 33 6 24Z" />
    <path className="tech-tree-fish-fill" d="M48 24 61 14l-3 11 3 10Z" />
    <path className="tech-tree-fish-detail" d="M18 16c2-5 7-8 13-8m-9 24c5 2 12 2 18-1" />
    <circle className="tech-tree-fish-eye" cx="17" cy="22" r="1.5" />
  </> : speciesId === "rust-001" ? <>
    <path className="tech-tree-fish-fill" d="M8 24c8-6 19-8 32-5l9 5-9 5c-13 3-24 1-32-5Z" />
    <path className="tech-tree-fish-fill" d="M43 24 60 14l-4 10 4 10Z" />
    <path className="tech-tree-fish-detail" d="M12 22 1 17m24 3 7-11 4 12m-9 8 5 9" />
    <circle className="tech-tree-fish-eye" cx="15" cy="23" r="1.3" />
  </> : speciesId === "js-001" ? <>
    <path className="tech-tree-fish-fill" d="M4 26c7-10 14-11 22-7 8 5 11 13 19 12 5-1 9-5 14-8l-4 11c-8 7-16 9-23 4-8-5-12-13-20-10-3 1-5 1-8-2Z" />
    <path className="tech-tree-fish-detail" d="M27 20c5 1 8 4 10 7m-16-9 5 4" />
    <circle className="tech-tree-fish-eye" cx="11" cy="24" r="1.4" />
  </> : speciesId === "k8s-001" ? <>
    <path className="tech-tree-fish-fill" d="M5 25c10-9 24-10 40-4l7 5-7 5C27 36 13 33 5 25Z" />
    <path className="tech-tree-fish-fill" d="M45 26 60 14l-4 12 4 12Z" />
    <path className="tech-tree-fish-detail" d="m19 19 5-10 6 9m4 13 6 8m-20-8-5 8" />
    <circle className="tech-tree-fish-eye" cx="14" cy="24" r="1.4" />
  </> : speciesId === "css-001" ? <>
    <path className="tech-tree-fish-fill" d="M7 24c7-9 18-12 30-7 5 2 9 5 12 8-3 5-8 8-13 10C23 39 12 34 7 24Z" />
    <path className="tech-tree-fish-fill" d="M43 25 60 13v24Z" />
    <path className="tech-tree-fish-detail" d="M22 17v17m8-17v18m-17-9c7 5 20 6 29 1" />
    <circle className="tech-tree-fish-eye" cx="15" cy="23" r="1.5" />
  </> : <>
    <path className="tech-tree-fish-fill" d="M5 27c5-7 13-10 23-7 5 1 9 4 11 7-2 4-6 7-11 8C18 38 10 34 5 27Z" />
    <path className="tech-tree-fish-fill" d="M35 27 47 18v18Z" />
    <path className="tech-tree-fish-detail" d="M42 12c4-3 10-3 15 0m-12 6c4-2 8-2 13 0m-7 11c3-1 6 0 9 2" />
    <circle className="tech-tree-fish-eye" cx="13" cy="26" r="1.4" />
  </>;
  return (
    <svg className="tech-tree-fish-icon" viewBox="0 0 64 48" aria-hidden="true" focusable="false">{fish}</svg>
  );
}

function TechTreeView({ entries, selectedId, onSelect, completePreview, isOpen }: {
  entries: CollectionEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  completePreview: boolean;
  isOpen: boolean;
}) {
  const speciesEntries = entries.filter(entry => isFishSpeciesId(entry.id) && entry.catalogStatus === "active");
  const discovered = speciesEntries.filter(entry => entry.status === "caught").length;
  const [showAllPreview, setShowAllPreview] = useState(completePreview);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [detailExpanded, setDetailExpanded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  const previewEnabled = import.meta.env.DEV && completePreview && showAllPreview;
  const selected = speciesEntries.find(entry => entry.id === selectedId) ?? speciesEntries[0];
  const selectedSpecies = selected && isFishSpeciesId(selected.id) ? getFishSpecies(selected.id) : undefined;
  const selectedDetails = selected && isFishSpeciesId(selected.id) ? TECH_TREE_NODE_DETAILS[selected.id] : undefined;
  const selectedReveal = techTreeReveal(selected?.status ?? "unknown", previewEnabled, import.meta.env.DEV);
  const selectedSpeciesId = selected && isFishSpeciesId(selected.id) ? selected.id : undefined;
  const selectedBranch = selectedSpeciesId
    ? TECH_TREE_BRANCHES.find(branch => branch.speciesIds.includes(selectedSpeciesId))
    : undefined;
  const mapRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ width: number; height: number; byId: Record<string, string> }>({ width: 1, height: 1, byId: {} });
  const pathNodeIds = speciesEntries.map(entry => entry.id).join(",");

  useEffect(() => {
    const map = mapRef.current;
    const root = map?.querySelector<HTMLElement>(".tech-tree-root");
    if (!map || !root || !isOpen) return;
    const measure = () => {
      const mapRect = map.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      if (!mapRect.width || !mapRect.height) return;
      const startX = rootRect.left + rootRect.width / 2 - mapRect.left;
      const startY = rootRect.top + rootRect.height / 2 - mapRect.top;
      const byId: Record<string, string> = {};
      const centers: Record<string, { x: number; y: number }> = {};
      map.querySelectorAll<HTMLButtonElement>(".tech-tree-node").forEach(node => {
        const icon = node.querySelector<HTMLElement>(".tech-tree-node-icon");
        if (!icon || !node.dataset.speciesId) return;
        const iconRect = icon.getBoundingClientRect();
        const endX = iconRect.left + iconRect.width / 2 - mapRect.left;
        const endY = iconRect.top + iconRect.height / 2 - mapRect.top;
        centers[node.dataset.speciesId] = { x: endX, y: endY };
        const dx = endX - startX;
        const dy = endY - startY;
        byId[node.dataset.speciesId] = `M${startX} ${startY} C${startX + dx * .35} ${startY + dy * .1}, ${endX - dx * .18} ${endY - dy * .12}, ${endX} ${endY}`;
      });
      TECH_TREE_FISH_LINKS.forEach(link => {
        const from = centers[link.from];
        const to = centers[link.to];
        if (!from || !to) return;
        if (link.route === "direct") {
          const middleX = (from.x + to.x) / 2;
          const arc = Math.min(16, Math.abs(to.x - from.x) * .12);
          byId[`fish-link-${link.id}`] = `M${from.x} ${from.y} C${middleX} ${from.y - arc}, ${middleX} ${to.y - arc}, ${to.x} ${to.y}`;
          return;
        }
        if (mapRect.width <= 700) {
          const railX = mapRect.width - 14;
          const direction = Math.sign(to.y - from.y) || 1;
          byId[`fish-link-${link.id}`] = `M${from.x} ${from.y} C${from.x + 30} ${from.y}, ${railX} ${from.y}, ${railX} ${from.y + direction * 14} L${railX} ${to.y - direction * 14} C${railX} ${to.y}, ${to.x + 30} ${to.y}, ${to.x} ${to.y}`;
          return;
        }
        const railX = mapRect.width - 18;
        const direction = Math.sign(to.y - from.y) || 1;
        byId[`fish-link-${link.id}`] = `M${from.x} ${from.y} C${from.x + 32} ${from.y}, ${railX} ${from.y}, ${railX} ${from.y + direction * 18} C${railX} ${from.y + direction * 42}, ${railX} ${to.y - direction * 42}, ${railX} ${to.y - direction * 18} C${railX} ${to.y}, ${to.x + 32} ${to.y}, ${to.x} ${to.y}`;
      });
      setPaths({ width: mapRect.width, height: mapRect.height, byId });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(map);
    map.querySelectorAll<HTMLElement>(".tech-tree-node-icon").forEach(icon => observer?.observe(icon));
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [pathNodeIds, compact, isOpen]);

  const inspector = selected && selectedSpecies && (
    <section id="tech-tree-inspector" className={`tech-tree-inspector tech-tree-node--${selected.id}`} aria-label="選択した技術ノード">
      <div className="tech-tree-inspector-topline">
        <span className={selectedReveal.caught ? "is-unlocked" : selectedReveal.preview ? "is-preview" : "is-locked"}>
          <i aria-hidden="true" />{selectedReveal.caught ? "発見済み" : selectedReveal.preview ? "プレビュー" : "未発見"}
        </span>
      </div>
      <div className="tech-tree-specimen">
        {isOpen && <CollectionModel key={`${selected.id}:${selectedReveal.revealed}`} entry={selected} modelKey={selectedSpecies.modelKey} silhouette={!selectedReveal.revealed} />}
      </div>
      <div className="tech-tree-inspector-heading" aria-live="polite">
        <h4>{selectedReveal.revealed ? collectionName(selected) : selectedSpecies.unknownTitle}</h4>
      </div>
      {selectedReveal.revealed && selectedDetails ? <div className="tech-tree-node-data">
        <h5>{selectedDetails.technology}</h5>
        <p className="tech-tree-concept">{selectedDetails.concept}</p>
        <p className="tech-tree-expression"><span>魚の動き</span>{selectedDetails.gameExpression}</p>
        {selectedReveal.caught && <p className="tech-tree-catches">釣果 <strong>{selected.catches} 回</strong></p>}
      </div> : <div className="tech-tree-node-data">
        <p className="tech-tree-concept">{selectedSpecies.unknownHint}</p>
      </div>}
      {compact && <button className="tech-tree-detail-close" type="button" onClick={() => {
        mapRef.current?.querySelector<HTMLButtonElement>('.tech-tree-node[aria-pressed="true"]')?.focus();
        setDetailExpanded(false);
      }}>詳細を閉じる <span aria-hidden="true">↑</span></button>}
    </section>
  );

  return (
    <section className="tech-tree" aria-labelledby="tech-tree-heading">
      <header className="tech-tree-intro">
        <h3 id="tech-tree-heading" className="visually-hidden">技術ツリー</h3>
        <div className="tech-tree-intro-actions">
          <div className="tech-tree-progress" aria-live="polite">
            <div><span>発見</span><strong>{discovered}<small> / {speciesEntries.length}</small></strong></div>
            <div className="tech-tree-progress-track" aria-hidden="true">{speciesEntries.map(entry => <i key={entry.id} className={entry.status === "caught" ? "is-discovered" : undefined} />)}</div>
          </div>
          {import.meta.env.DEV && completePreview && <button type="button" className="tech-tree-preview-toggle" aria-pressed={showAllPreview} title="発見記録は変わりません" onClick={() => setShowAllPreview(value => !value)}>全種プレビュー</button>}
        </div>
      </header>

      {speciesEntries.length === 0 ? <p className="tech-tree-empty" role="status">技術ツリーを読み込めませんでした。魚図鑑に戻ってください。</p> : <>
        <div className="tech-tree-layout">
          <div ref={mapRef} className="tech-tree-map" aria-label="技術分野と魚のつながり">
            <svg className="tech-tree-paths" viewBox={`0 0 ${paths.width} ${paths.height}`} preserveAspectRatio="none" aria-hidden="true">
              {speciesEntries.map(entry => <path key={entry.id} className={`tech-tree-root-link${selected?.id === entry.id ? " is-active" : ""}`} d={paths.byId[entry.id] ?? ""} />)}
              {TECH_TREE_FISH_LINKS.map(link => <path
                key={link.id}
                className={`tech-tree-fish-link${selected?.id === link.from || selected?.id === link.to ? " is-related" : ""}`}
                d={paths.byId[`fish-link-${link.id}`] ?? ""}
              />)}
            </svg>
            <div className="tech-tree-root" aria-hidden="true" />
            <div className="tech-tree-branches">
              {TECH_TREE_BRANCHES.map(branch => {
                const branchEntries = branch.speciesIds
                  .map(id => speciesEntries.find(entry => entry.id === id))
                  .filter((entry): entry is CollectionEntry => Boolean(entry));
                if (branchEntries.length === 0) return null;
                return <section key={branch.id} className={`tech-tree-branch tech-tree-branch--${branch.id}${selectedBranch?.id === branch.id ? " is-current" : ""}`} aria-labelledby={`tech-branch-${branch.id}`}>
                  <header className="tech-tree-branch-heading">
                    <h4 id={`tech-branch-${branch.id}`}>{branch.label}</h4>
                  </header>
                  <div className="tech-tree-nodes">
                    {branchEntries.map(entry => {
                      const reveal = techTreeReveal(entry.status, previewEnabled, import.meta.env.DEV);
                      const species = isFishSpeciesId(entry.id) ? getFishSpecies(entry.id) : undefined;
                      const details = isFishSpeciesId(entry.id) ? TECH_TREE_NODE_DETAILS[entry.id] : undefined;
                      const title = reveal.revealed && details ? details.name : "未発見";
                      const subtitle = reveal.revealed && details ? details.technology : species?.unknownTitle ?? "まだ見ぬ魚";
                      return <button
                        key={entry.id}
                        type="button"
                        className={`tech-tree-node tech-tree-node--${entry.id}${reveal.revealed ? " is-unlocked" : " is-locked"}${reveal.preview ? " is-preview" : ""}${entry.id === selected?.id ? " is-selected" : ""}`}
                        data-species-id={entry.id}
                        aria-pressed={entry.id === selected?.id}
                        aria-controls={!compact || detailExpanded ? "tech-tree-inspector" : undefined}
                        aria-expanded={compact ? entry.id === selected?.id && detailExpanded : undefined}
                        aria-label={`${reveal.revealed ? `${title}。` : ""}${reveal.caught ? "発見済み" : reveal.preview ? "プレビュー表示" : "未発見"}。${subtitle}`}
                        onClick={() => {
                          setDetailExpanded(entry.id === selected?.id ? !detailExpanded : true);
                          onSelect(entry.id);
                        }}
                      >
                        <span className="tech-tree-node-icon" aria-hidden="true">
                          <FishTechIcon speciesId={entry.id} />
                          <span className="tech-tree-node-mark">{reveal.caught ? "✓" : reveal.preview ? "◇" : "?"}</span>
                        </span>
                        <span className="tech-tree-node-copy"><strong>{title}</strong><small>{reveal.revealed ? details?.nodeLabel ?? subtitle : subtitle}</small></span>
                      </button>;
                    })}
                  </div>
                  {compact && detailExpanded && selectedBranch?.id === branch.id && inspector}
                </section>;
              })}
            </div>
          </div>

          {!compact && inspector}
        </div>
      </>}
      <div className="tech-tree-legend"><span><i className="tech-tree-legend-caught" aria-hidden="true" />発見済み</span><span><i className="tech-tree-legend-link" aria-hidden="true" />関連</span></div>
    </section>
  );
}

export function CollectionDialog({
  dialogRef, collection, selectedId, isOpen, onSelect, onClose, onClosed, completePreview,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  collection: Collection;
  selectedId: string;
  isOpen: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onClosed: () => void;
  completePreview: boolean;
}) {
  const [activeView, setActiveView] = useState<"fish" | "tech">(completePreview ? "tech" : "fish");
  const entries = collection.entries ?? [];
  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0];
  const caught = selected?.status === "caught";
  const preview = selected?.status === "preview";
  const selectedSpecies = selected && isFishSpeciesId(selected.id) ? getFishSpecies(selected.id) : undefined;
  const hasModel = Boolean(caught && selected?.modelKey && selectedSpecies?.modelKey === selected.modelKey);
  const hasSilhouetteModel = Boolean(selected?.status === "unknown" && selectedSpecies?.modelKey);
  const silhouetteKey = selectedSpecies?.silhouetteKey ?? "css-fish";

  return (
    <dialog ref={dialogRef} id="collection-dialog" className="collection-dialog" data-view={activeView} aria-labelledby={activeView === "tech" ? "tech-tree-heading" : "collection-title"} onClose={onClosed} onClick={event => dialogClick(event.currentTarget, event)}>
      <div className="collection-shell">
        <header className="collection-header">
          {activeView === "fish" && <div className="collection-heading">
            <h2 id="collection-title">魚図鑑</h2>
            {collection.activeTotal > 0 && <span id="collection-count" className="collection-count">発見済み {collection.registered} / {collection.activeTotal}</span>}
          </div>}
          <nav className="collection-views" aria-label="釣果の表示">
            <button type="button" aria-pressed={activeView === "fish"} onClick={() => setActiveView("fish")}>魚図鑑</button>
            <button type="button" aria-pressed={activeView === "tech"} onClick={() => setActiveView("tech")}>技術ツリー</button>
          </nav>
          <button className="collection-close" aria-label="図鑑を閉じる" title="海へ戻る" onClick={onClose}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2 14 14M14 2 2 14" /></svg></button>
        </header>
        {activeView === "fish" ? <>
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
              {hasModel && isOpen && selected && <CollectionModel key={`${selected.id}:caught`} entry={selected} />}
              {hasSilhouetteModel && isOpen && selected && selectedSpecies?.modelKey && <CollectionModel key={`${selected.id}:silhouette`} entry={selected} modelKey={selectedSpecies.modelKey} silhouette />}
              {!hasModel && !hasSilhouetteModel && <CollectionSilhouette silhouetteKey={silhouetteKey} label={selectedSpecies?.unknownTitle ?? "未発見の魚影"} />}
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
                <h3 id="collection-detail-name">{selectedSpecies?.unknownTitle ?? "まだ見ぬ魚"}</h3>
                <p id="collection-detail-description" className="collection-detail-description">{selectedSpecies?.unknownHint ?? "魚影の特徴を調査中です。"}</p>
              </>}
            </div>
          </section>
        </> : <TechTreeView entries={entries} selectedId={selectedId} onSelect={onSelect} completePreview={completePreview} isOpen={isOpen} />}
      </div>
    </dialog>
  );
}
export function App() {
  const params = new URLSearchParams(window.location.search);
  const controllerId = params.get("controller");
  const isPhone = Boolean(controllerId);
  const completePreview = isCompletePreviewPath(window.location.pathname, import.meta.env.DEV) && !isPhone;
  const fishingRoute = resolveFishingRoute(window.location.pathname, params.get("fish"));
  const oceanMountRef = useRef<HTMLDivElement>(null);
  const helpDialogRef = useRef<HTMLDialogElement>(null);
  const connectDialogRef = useRef<HTMLDialogElement>(null);
  const collectionDialogRef = useRef<HTMLDialogElement>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const runtime = useOceanRuntime({ isPhone, controllerId, initialFishId: fishingRoute.initialFishId, routePath: fishingRoute.path, oceanMountRef, collectionOpen });
  const { state, online, displayConnected, renderFailed, reelHeld, feedback, hookFeedback, rodStrokeRevision, newEncounter, catchSaveStatus, toast, chargeProgress, reticle, soundEnabled, collection, selectedCollectionId, controllerUrl, controllerHost, controllerUrlError, sensorStatus, sensorButtonLabel, sensorsOn } = runtime;
  const { activate, retryCatchSave, cancelCharge, handlePointerDown, handlePointerUp, handlePointerCancel, startReel, stopReel, performRodStroke, toggleSensor, toggleSound, showToast } = runtime.actions;
  const fighting = state.phase === "fighting";
  const biting = state.phase === "biting";
  const caughtEntry = collection.entries.find(entry => entry.id === state.fishId);
  const fightButtonLabel = biting ? "合わせる" : reelHeld ? "巻いています" : "巻く";
  const fightButtonHint = biting ? (state.criticalWindow ? "今押すと、ナイスフッキング！" : "ウキが沈んだら押す") : reelHeld ? "離して止める" : "押して巻く";
  const resultActionLabel = online ? "もう一度、投げる" : "再接続中…";
  const resultConnectionHint = online ? "" : "海との接続が戻ると、もう一度投げられます。";
  const catchSaveMessage = catchSaveStatus === "pending"
    ? "図鑑に記録中です…"
    : catchSaveStatus === "failed"
      ? "図鑑に記録できませんでした。接続を確認して再試行してください。"
      : "";
  const phoneHint = state.phase === "caught" && catchSaveMessage
    ? catchSaveMessage
    : state.phase === "caught"
      ? caughtEntry?.tagline ?? phoneHints.caught
      : fighting
        ? "回して巻く。手前に引いて戻すと竿を引けます。糸が張るほど振動が速くなり、魚の強い引きも手に伝わります。"
        : biting && state.criticalWindow
          ? "今が狙いどき。画面をタップするか、小さく引いて合わせます。"
          : phoneHints[state.phase];
  const catchAgainLabel = !online
    ? "再接続中…"
    : catchSaveStatus === "pending"
      ? "図鑑に記録中…"
      : catchSaveStatus === "failed"
        ? "記録後にもう一度投げられます"
        : "もう一度、海へ";
  const distanceVisible = ["casting", "waiting", "biting", "fighting", "caught"].includes(state.phase);
  const distanceMeters = state.phase === "caught" ? "0.0" : Math.max(0, state.distance || 0).toFixed(1);
  const tension = Math.round((state.tension || 0) * 100);
  const tensionColor = tension > 80 ? "#ef9c80" : tension < 12 ? "#a9bfcb" : "#a6e4e7";
  const k8sLunge = k8sLungeForSnapshot(state, OCEAN_RENDER_DELAY_MS / 1000);
  const tensionTrackStyle = {
    "--tension-color": tensionColor,
    "--k8s-lunge-start": `${tension}%`,
    "--k8s-lunge-width": `${26 * k8sLunge}%`,
  } as CSSProperties;
  const k8sRodStyle = {
    "--k8s-rod-angle": `${-3.5 * k8sLunge}deg`,
    "--k8s-rod-glow": `${12 * k8sLunge}px`,
  } as CSSProperties;
  const phoneCastLabel = state.phase === "idle" ? "タッチで投げる" : fighting ? (reelHeld ? "巻いている — 離すと緩む" : "押して巻く / 離して緩める") : phaseLabels[state.phase];
  const isLocalDevelopment = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

  useEffect(() => { document.title = isPhone ? "釣り竿 — 技術釣り" : import.meta.env.DEV && completePreview ? "技術ツリー（全開放プレビュー）— 技術釣り" : fishingRoute.title; }, [completePreview, fishingRoute.title, isPhone]);
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
    if (!completePreview || !collectionDialogRef.current || collectionDialogRef.current.open) return;
    collectionDialogRef.current.showModal();
    setCollectionOpen(true);
  }, [completePreview]);
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
          <div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension} aria-valuetext={`${tension}%`} data-k8s-mode={state.fishId === "k8s-001" && fighting ? state.mode : "rest"} data-k8s-lunge={k8sLunge > .01} style={tensionTrackStyle}><span id="tension-fill" style={{ width: `${tension}%` }} /><b className="tension-impact" aria-hidden="true" /><i /></div>
          <button id="fight-button" className={`fight-button${reelHeld ? " is-held" : ""}${biting ? " is-hook" : ""}${biting && state.criticalWindow ? " is-critical-window" : ""}`} aria-label={biting ? state.criticalWindow ? "今が狙いどき。合わせる" : "合わせる。ウキが沈んだら押す" : reelHeld ? "巻いています。離して止める" : "巻く。押して巻く"} disabled={!online || renderFailed} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}>
            <span className="fight-button-label">{fightButtonLabel}</span><small className="fight-button-help">{fightButtonHint}</small>
          </button>
        </section>
        <section id="catch-ui" className="catch-ui" hidden={state.phase !== "caught"} aria-live="polite">
          <p>{newEncounter ? "NEW ENCOUNTER" : "FISH CAUGHT"}</p>
          <h1>{caughtEntry ? collectionName(caughtEntry) : "魚"}</h1>
          <p>{caughtEntry?.tagline ?? "魚を釣り上げました。"}</p>
          {catchSaveMessage && <p className="result-connection" role="status">{catchSaveMessage}</p>}
          {catchSaveStatus === "failed" && <button id="retry-catch-save" className="primary-button" disabled={!online} onClick={retryCatchSave}>図鑑への保存を再試行</button>}
          <button id="catch-again" className="primary-button" disabled={!online || !canContinueAfterCatchSave(catchSaveStatus)} onClick={() => activate()}>{catchAgainLabel}</button>
          {!online && <p className="result-connection" role="status">{resultConnectionHint}</p>}
        </section>
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
        <div className="phone-instruction"><p id="phone-kicker">スマホ操作</p><h1 id="phone-title">{phoneTitles[state.phase]}</h1><p id="phone-hint">{phoneHint}</p>{hookFeedback && <p className="hook-critical-status" role="status">ナイスフッキング！</p>}</div>
        <div key={rodStrokeRevision} className={`rod-symbol${fighting ? " is-fighting" : ""}${state.fishId === "k8s-001" && fighting ? " is-k8s-fighting" : ""}${k8sLunge > .01 ? " is-k8s-lunge" : ""}`} style={k8sRodStyle} aria-hidden="true"><svg viewBox="0 0 160 230"><path d="M48 220 93 32 Q101 14 113 18" /><path className="rod-thread" d="M113 18q22 112-12 164" /><circle cx="101" cy="185" r="4" /><path d="m85 51 15 4m-19 11 16 4m-30 53 16 4" /></svg></div>
        <div id="phone-tension" className="phone-tension" hidden={!fighting}><output id="phone-distance" className="phone-distance" aria-label="魚までの距離">{distanceMeters}m</output><div className="tension-track" role="meter" aria-label="糸の張り" aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${tension}%`} aria-valuenow={tension} data-k8s-mode={state.fishId === "k8s-001" && fighting ? state.mode : "rest"} data-k8s-lunge={k8sLunge > .01} style={tensionTrackStyle}><span id="phone-tension-fill" style={{ width: `${tension}%` }} /><b className="tension-impact" aria-hidden="true" /><i /></div></div>
        <button id="sensor-button" className="primary-button" onClick={() => void toggleSensor()}>{sensorButtonLabel}</button>
        {fighting ? <><PhoneReelControl active={reelHeld} disabled={!online || !displayConnected} onStart={startReel} onStop={stopReel} /><button type="button" className="phone-rod-pump" disabled={!online || !displayConnected} onClick={performRodStroke}><span>竿を引く</span><small>手前に引いて、元の位置へ戻す</small></button></> : state.phase === "caught" && catchSaveStatus === "failed" ? <button id="phone-catch-retry" className="phone-cast" disabled={!online} onClick={retryCatchSave}>図鑑への保存を再試行</button> : <button id="phone-cast" className={`phone-cast${reelHeld ? " is-held" : ""}${biting && state.criticalWindow ? " is-critical-window" : ""}`} disabled={!online || !displayConnected || ["casting", "retrieving"].includes(state.phase) || state.phase === "caught" && !canContinueAfterCatchSave(catchSaveStatus)} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={stopReel} onClick={event => { if (event.detail === 0) activate(); }}>{biting && state.criticalWindow ? "今、合わせる！" : state.phase === "caught" && catchSaveStatus === "pending" ? "図鑑に記録中…" : phoneCastLabel}</button>}
        <p id="sensor-status" className="sensor-status" role="status">{sensorStatus}</p>
      </section>
      <dialog ref={helpDialogRef} id="help-dialog" aria-labelledby="help-title" onClick={event => dialogClick(event.currentTarget, event)}>
        <button className="close-dialog quiet-button" aria-label="閉じる" onClick={() => closeDialog(helpDialogRef)}>×</button>
        <div className="help-content">
          <header className="help-header"><p className="eyebrow">操作方法</p><h2 id="help-title">釣り方</h2><p className="help-lead">画面中央のボタンを順番に使います。</p></header>
          <ol className="instructions">
            <li><span>1</span><div><div className="instruction-heading"><strong>投げる</strong></div><p>「投げる」を長押しし、好きなタイミングで離します。長く押すほど遠くへ飛びます。スペースキーでも操作できます。</p></div></li>
            <li><span>2</span><div><div className="instruction-heading"><strong>合わせる</strong></div><p>ウキが沈み、ボタンが「合わせる」に変わったら押します。</p></div></li>
            <li><span>3</span><div><div className="instruction-heading"><strong>巻く・竿を引く</strong></div><p>魚が走っている間は巻かずに待ちます。落ち着いたら「巻く」を押し、糸の張りが赤くなったらいったん離します。スマホでは、手前に引いて元の位置へ戻すと竿を引けます。これはリールを巻く操作とは別です。</p></div></li>
          </ol>
          <p className="fine-print">スマホを使う場合は「スマホを接続」からQRコードを読み取り、スマホ画面の指示に従ってください。</p>
        </div>
      </dialog>
      <dialog ref={connectDialogRef} id="connect-dialog" aria-label="スマホを接続" aria-describedby="pairing-description" onClick={event => dialogClick(event.currentTarget, event)}>
        <button className="close-dialog quiet-button" aria-label="閉じる" onClick={() => closeDialog(connectDialogRef)}>×</button><p id="pairing-description">スマホで読み取って接続</p>
        <div className={`pairing-qr${qrDataUrl ? "" : " is-loading"}`} aria-live="polite">{qrDataUrl ? <img id="controller-qr" src={qrDataUrl} alt="スマホ接続用QRコード" /> : controllerUrlError || "QRコードを準備中…"}</div>
        {isLocalDevelopment && <p id="pairing-note" className="fine-print">{controllerHost ? <>接続先: <code>{controllerHost}{window.location.port ? `:${window.location.port}` : ""}</code>。PCとスマホを同じWi-Fiに接続してください。<br /></> : null}ローカルHTTPではタッチ操作が使えます。モーションセンサーにはHTTPSが必要です。</p>}
      </dialog>
      <CollectionDialog dialogRef={collectionDialogRef} collection={collection} selectedId={selectedCollectionId} isOpen={collectionOpen} onSelect={runtime.setSelectedCollectionId} onClose={() => closeDialog(collectionDialogRef)} onClosed={() => setCollectionOpen(false)} completePreview={completePreview} />
      <div id="toast" className={`toast${toast ? " visible" : ""}`} role="status">{toast}</div>
      <noscript><p className="render-notice">この海を動かすにはJavaScriptを有効にしてください。</p></noscript>
    </>
  );
}
