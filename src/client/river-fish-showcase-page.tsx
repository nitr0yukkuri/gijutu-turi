import { useEffect, useRef, useState } from "react";
import { RIVER_FISH_DESIGNS } from "../river-fish-designs.js";
import "./river-fish-showcase.css";

function RiverFishModel({ modelKey, label }: { modelKey: string; label: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;
    let preview: { dispose: () => void } | undefined;
    setFailed(false);
    void import("../rendering/collection-preview.js").then(({ mountCollectionFish }) => {
      if (disposed || !mountRef.current) return;
      try { preview = mountCollectionFish(mountRef.current, modelKey); }
      catch { setFailed(true); }
    }).catch(() => setFailed(true));
    return () => { disposed = true; preview?.dispose(); };
  }, [modelKey]);

  return <>
    <div ref={mountRef} className="river-fish-model" hidden={failed} role="img" aria-label={`${label}の3Dモデル。ドラッグして向きを変えられます。`} tabIndex={0} />
    {failed && <p className="river-fish-model-error" role="status">魚モデルを表示できませんでした。</p>}
  </>;
}

export function RiverFishShowcasePage() {
  const [selectedKey, setSelectedKey] = useState(RIVER_FISH_DESIGNS[0]!.modelKey);
  const selected = RIVER_FISH_DESIGNS.find(fish => fish.modelKey === selectedKey) ?? RIVER_FISH_DESIGNS[0]!;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "川の技術魚 — 技術釣り";
    return () => { document.title = previousTitle; };
  }, []);

  return <main className="complete-showcase river-showcase" aria-labelledby="river-showcase-title">
    <div className="complete-showcase-shell river-showcase-shell">
      <header className="complete-showcase-header">
        <div className="complete-showcase-copy">
          <p className="complete-showcase-eyebrow">RIVER FISH · MODEL STUDY</p>
          <h1 id="river-showcase-title">川の技術魚</h1>
          <p>川にすむ魚の体つきや泳ぎを手がかりに、技術の性質を魚ごとの動きへ置き換えた展示です。</p>
        </div>
        <div className="complete-showcase-progress" role="status" aria-label={`${RIVER_FISH_DESIGNS.length}種類の川魚`}>
          <span>RIVER SPECIES</span>
          <strong>{RIVER_FISH_DESIGNS.length}<small> 種</small></strong>
        </div>
      </header>

      <section className="river-fish-book" aria-label="川魚のモデルと特徴">
        <nav className="river-fish-picker" aria-label="川魚を選ぶ">
          {RIVER_FISH_DESIGNS.map(fish => <button
            key={fish.modelKey}
            type="button"
            aria-pressed={fish.modelKey === selected.modelKey}
            className={fish.modelKey === selected.modelKey ? "is-selected" : ""}
            onClick={() => setSelectedKey(fish.modelKey)}
          >
            <span className="river-fish-number">{String(fish.number).padStart(2, "0")}</span>
            <strong>{fish.name}</strong>
            <small>{fish.fish} · {fish.technology}</small>
          </button>)}
        </nav>

        <article className="river-fish-detail" aria-live="polite">
          <div className="river-fish-visual">
            <RiverFishModel key={selected.modelKey} modelKey={selected.modelKey} label={selected.name} />
            <span className="river-fish-waterline" aria-hidden="true" />
          </div>
          <div className="river-fish-copy">
            <p className="river-fish-eyebrow">NO. {String(selected.number).padStart(2, "0")} · {selected.technology}</p>
            <h2>{selected.name}</h2>
            <p className="river-fish-tagline">{selected.tagline}</p>
            <p className="river-fish-concept">{selected.technologyConcept}</p>
            <dl className="river-fish-facts">
              <div><dt>生息域</dt><dd>{selected.habitat}</dd></div>
              <div><dt>魚の特徴</dt><dd>{selected.appearance}</dd></div>
              <div><dt>実際の生態</dt><dd>{selected.naturalBehavior}</dd></div>
              <div><dt>ゲームでの動き</dt><dd>{selected.gameBehavior}</dd></div>
            </dl>
          </div>
        </article>
      </section>

      <footer className="complete-showcase-footer river-fish-footer">
        <a href="/">海の釣り場へ戻る</a>
        <span>魚の形と生態は参考資料をもとに整理し、技術との対応やファイト表現は作品独自の解釈です。</span>
      </footer>
    </div>
  </main>;
}
