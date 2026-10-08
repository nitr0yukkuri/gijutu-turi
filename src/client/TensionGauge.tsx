type TensionGaugeProps = {
  value: number;
  lunge?: number;
  warning?: boolean;
};

const ARC = "M20 84 A68 68 0 0 1 156 84";

/** Displays the shared presentation snapshot; never changes the fishing rules. */
export function TensionGauge({ value, lunge = 0, warning = false }: TensionGaugeProps) {
  const tension = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const impact = Math.min(100 - tension, 26 * (Number.isFinite(lunge) ? Math.max(0, Math.min(1, lunge)) : 0));
  const level = tension > 80 ? "danger" : tension > 65 ? "high" : tension < 12 ? "slack" : "steady";
  const status = level === "danger" ? "切れそう" : level === "high" ? "張りが強い" : level === "slack" ? tension < 6 ? "針外れ注意" : "ゆるみ注意" : "安定";
  const hint = level === "danger" ? "巻くのを止める" : level === "slack" ? tension < 6 ? "糸を張る" : "少し糸を張る" : warning ? "強い引きに注意" : "";

  return (
    <div className="tension-gauge" role="meter" aria-label="糸の張り"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={tension}
      aria-valuetext={`${tension}%、${status}${hint ? `。${hint}` : ""}`}
      data-level={level} data-critical-slack={level === "slack" && tension < 6} data-warning={warning} data-lunge={impact > .01}>
      <svg viewBox="0 0 176 104" aria-hidden="true" focusable="false">
        <path className="tension-gauge-track" d={ARC} pathLength={100} />
        <path className="tension-gauge-slack-limit" d={ARC} pathLength={100} strokeDasharray="6 100" />
        <path className="tension-gauge-limit" d={ARC} pathLength={100} strokeDasharray="20 100" strokeDashoffset={-80} />
        <path className="tension-gauge-fill" d={ARC} pathLength={100} strokeDasharray={`${tension} 100`} opacity={tension > 0 ? 1 : 0} />
        <path className="tension-gauge-impact" d={ARC} pathLength={100} strokeDasharray={`${impact} 100`} strokeDashoffset={-tension} opacity={impact > .01 ? 1 : 0} />
        <path className="tension-gauge-mark" d="m139 47 8-6" />
      </svg>
    </div>
  );
}
