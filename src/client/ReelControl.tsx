import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type ReelControlProps = {
  active: boolean;
  disabled: boolean;
  placement: "phone";
  onStart: () => void;
  onStop: () => void;
};

const wrapAngle = (angle: number): number => {
  if (angle > Math.PI) return angle - Math.PI * 2;
  if (angle < -Math.PI) return angle + Math.PI * 2;
  return angle;
};

const pointerPosition = (event: PointerEvent<HTMLButtonElement>) => {
  const art = event.currentTarget.querySelector(".reel-control-art")?.getBoundingClientRect();
  if (!art) return { angle: Number.NaN, radius: 0, minRadius: 0 };
  const x = event.clientX - (art.left + art.width * 220 / 320);
  const y = event.clientY - (art.top + art.height * 275 / 420);
  return { angle: Math.atan2(y, x), radius: Math.hypot(x, y), minRadius: Math.min(art.width, art.height) * .18 };
};

/**
 * A touch and mouse reeling control. Pointer, keyboard, and press-and-hold
 * inputs all emit the existing start/stop intent; the server remains
 * authoritative for reeling, distance, and tension.
 */
export function ReelControl({ active, disabled, placement, onStart, onStop }: ReelControlProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const previousAngleRef = useRef<number | null>(null);
  const clockwiseProgressRef = useRef(0);
  const [rotation, setRotation] = useState(0);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0 || activePointerIdRef.current !== null) return;
    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = pointerPosition(event);
    previousAngleRef.current = position.radius > position.minRadius ? position.angle : null;
    clockwiseProgressRef.current = 0;
    onStart();
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || activePointerIdRef.current !== event.pointerId) return;
    const position = pointerPosition(event);
    if (position.radius <= position.minRadius) {
      previousAngleRef.current = null;
      return;
    }
    if (previousAngleRef.current === null) {
      previousAngleRef.current = position.angle;
      return;
    }

    const delta = wrapAngle(position.angle - previousAngleRef.current);
    previousAngleRef.current = position.angle;
    if (!Number.isFinite(delta)) return;

    setRotation(value => ((value + delta * 180 / Math.PI) % 360 + 360) % 360);
    clockwiseProgressRef.current += delta;
    if (clockwiseProgressRef.current >= .16) {
      onStart();
      clockwiseProgressRef.current = 0;
    } else if (clockwiseProgressRef.current <= -.16) {
      onStop();
      clockwiseProgressRef.current = 0;
    }
  };

  const stop = (pointerId?: number) => {
    if (pointerId !== undefined && activePointerIdRef.current !== pointerId) return;
    activePointerIdRef.current = null;
    previousAngleRef.current = null;
    clockwiseProgressRef.current = 0;
    onStop();
  };

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => stop(event.pointerId);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key !== "Enter" && event.key !== " ") || event.repeat) return;
    event.preventDefault();
    onStart();
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onStop();
  };

  return (
    <button
      type="button"
      className={`reel-control reel-control--${placement}${active ? " is-held" : ""}`}
      aria-label={active ? "リールを巻いています。指を離すと止まります" : "リールのハンドルを時計回りに回すか、押し続けて巻く"}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={() => stop()}
    >
      <svg className="reel-control-art" viewBox="0 0 320 420" aria-hidden="true">
        <defs>
          <linearGradient id={`reel-gold-${placement}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#fff2a0" /><stop offset=".22" stopColor="#f6c432" />
            <stop offset=".5" stopColor="#9f6415" /><stop offset=".72" stopColor="#ffe36a" /><stop offset="1" stopColor="#bd7819" />
          </linearGradient>
          <linearGradient id={`reel-silver-${placement}`} x1="0" x2=".9" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" /><stop offset=".2" stopColor="#9da9b8" />
            <stop offset=".38" stopColor="#f4f5ee" /><stop offset=".63" stopColor="#596578" /><stop offset=".82" stopColor="#e6e8e2" /><stop offset="1" stopColor="#707b8a" />
          </linearGradient>
          <linearGradient id={`reel-body-${placement}`} x1="0" x2="1" y1="0" y2=".8">
            <stop offset="0" stopColor="#566277" /><stop offset=".3" stopColor="#101827" />
            <stop offset=".56" stopColor="#394459" /><stop offset=".78" stopColor="#080e19" /><stop offset="1" stopColor="#667287" />
          </linearGradient>
          <linearGradient id={`reel-line-${placement}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f7f5e9" /><stop offset=".5" stopColor="#aeb8bf" /><stop offset="1" stopColor="#faf8ef" />
          </linearGradient>
          <filter id={`reel-shadow-${placement}`} x="-30%" y="-30%" width="160%" height="170%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
            <feOffset dy="5" result="offset" /><feComponentTransfer><feFuncA type="linear" slope=".35" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g filter={`url(#reel-shadow-${placement})`} strokeLinejoin="round">
          {/* Reel body and spool stay fixed; only the handle assembly turns. */}
          <path d="M84 205 104 278q5 19 25 26l-2 69q1 24 22 30l27-7q14-7 13-23l-3-69q22-8 31-30l20-68-30-15H108Z" fill={`url(#reel-body-${placement})`} stroke="#050b13" strokeWidth="6" />
          <path d="M111 232q47 18 99-2l10 38q-4 22-25 30l-2 54-49 3-5-57q-19-8-22-29Z" fill={`url(#reel-body-${placement})`} stroke="#6e7889" strokeWidth="3" />
          <path d="M128 286q28 12 65 1l-3 20q-28 12-58 1Z" fill={`url(#reel-gold-${placement})`} stroke="#9d691b" strokeWidth="3" />
          <path d="m139 322 48-1 3 53q0 18-16 26l-19 3q-15-5-15-23Z" fill={`url(#reel-silver-${placement})`} stroke="#101722" strokeWidth="5" />
          <path d="m151 336 26-2 2 49-12 7-13-8Z" fill="#131b29" stroke="#9faaba" strokeWidth="3" />
          <path d="M135 378q17 8 39 0" fill="none" stroke="#fff2c9" strokeWidth="3" opacity=".8" />

          {/* Bail wire frames the spool, echoing the attached black-and-gold reel. */}
          <path d="M70 77C26 89 26 166 51 214q27 48 107 58 80-10 108-58 25-48-19-137" fill="none" stroke="#121927" strokeWidth="16" />
          <path d="M70 77C26 89 26 166 51 214q27 48 107 58 80-10 108-58 25-48-19-137" fill="none" stroke={`url(#reel-silver-${placement})`} strokeWidth="8" />
          <path d="M54 112q-8 40 11 76m201-78q13 41-7 79" fill="none" stroke="#fff" strokeWidth="2" opacity=".65" />
          <path d="M49 101q3-17 20-22l16 9q4 10-4 18l-17 6q-13-2-15-11m195-17q17-4 23 11l-5 14q-10 6-20 0l-8-14q1-9 10-11" fill={`url(#reel-silver-${placement})`} stroke="#111927" strokeWidth="5" />

          {/* Spool body with fine line ridges and gold lips. */}
          <path d="M74 73q5-27 31-31h108q26 5 31 31v111q-3 31-28 40-54 18-113 0-24-9-29-40Z" fill={`url(#reel-line-${placement})`} stroke="#151c29" strokeWidth="7" />
          <path d="M82 102h154M79 111h159M78 120h161M78 129h162M79 138h161M80 147h159M82 156h155M84 165h150" fill="none" stroke="#8995a3" strokeWidth="2" opacity=".65" />
          <path d="M78 69q3-24 28-29h107q24 4 29 29l-6 17q-68 22-151 0Z" fill="#171e2a" stroke={`url(#reel-gold-${placement})`} strokeWidth="10" />
          <ellipse cx="160" cy="59" rx="82" ry="34" fill="#111824" stroke={`url(#reel-gold-${placement})`} strokeWidth="10" />
          <ellipse cx="160" cy="58" rx="62" ry="23" fill="#262f3d" stroke="#8995a3" strokeWidth="5" />
          <ellipse cx="160" cy="56" rx="36" ry="13" fill="#101722" stroke="#515d70" strokeWidth="4" />
          <path d="M147 30q-3 21 3 42m19-42q4 21-2 42" fill="none" stroke={`url(#reel-silver-${placement})`} strokeWidth="8" />
          <path d="M77 177q83 28 166 0l-1 15q-5 22-28 28-53 17-110 0-23-7-28-28Z" fill={`url(#reel-gold-${placement})`} stroke="#141b28" strokeWidth="5" />
          <path d="M106 212q52 17 108 0" fill="none" stroke="#fff1a0" strokeWidth="3" opacity=".8" />
          <path d="M95 235q-7 25 13 44m118-44q8 24-12 43" fill="none" stroke={`url(#reel-silver-${placement})`} strokeWidth="13" />
          <path d="M98 246q10 16 22 17m102-17q-10 16-22 17" fill="none" stroke={`url(#reel-gold-${placement})`} strokeWidth="5" />

          {/* The handle is the only rotating part, driven by the pointer drag. */}
          <g className="reel-control-crank" transform={`rotate(${rotation} 220 275)`}>
            <circle cx="220" cy="275" r="24" fill="#101724" stroke={`url(#reel-gold-${placement})`} strokeWidth="7" />
            <circle cx="220" cy="275" r="11" fill={`url(#reel-silver-${placement})`} stroke="#252d3a" strokeWidth="3" />
            <path d="M225 292q7 22 25 40l13 14" fill="none" stroke="#111824" strokeWidth="20" strokeLinecap="round" />
            <path d="M225 292q7 22 25 40l13 14" fill="none" stroke={`url(#reel-silver-${placement})`} strokeWidth="12" strokeLinecap="round" />
            <g transform="translate(266 348) rotate(-24)">
              <rect x="-7" y="-10" width="22" height="20" rx="7" fill={`url(#reel-silver-${placement})`} stroke="#151c28" strokeWidth="4" />
              <path d="M9-15h29q22 0 22 15T38 15H9q-8-3-8-15t8-15Z" fill={`url(#reel-body-${placement})`} stroke="#080e18" strokeWidth="5" />
              <path d="M18-10h19" stroke={`url(#reel-gold-${placement})`} strokeWidth="4" />
              <path d="M54-10q13 10 0 20" fill="none" stroke={`url(#reel-gold-${placement})`} strokeWidth="4" />
            </g>
          </g>
          <circle cx="220" cy="275" r="7" fill="#f6d65b" stroke="#171e2a" strokeWidth="3" />
        </g>
      </svg>
      <span className="reel-control-label">{active ? "巻いています" : "ハンドルを回して巻く"}</span>
      <small>{active ? "指を離すと止まる" : "押し続けても巻けます"}</small>
    </button>
  );
}
