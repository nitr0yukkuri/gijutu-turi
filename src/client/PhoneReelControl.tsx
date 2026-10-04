import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type PhoneReelControlProps = {
  active: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
};

const wrapAngle = (angle: number): number => {
  if (angle > Math.PI) return angle - Math.PI * 2;
  if (angle < -Math.PI) return angle + Math.PI * 2;
  return angle;
};

const pointerAngle = (event: PointerEvent<HTMLButtonElement>): number => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.atan2(
    event.clientY - (bounds.top + bounds.height / 2),
    event.clientX - (bounds.left + bounds.width / 2),
  );
};

/**
 * A touch fallback for the phone controller. It intentionally emits the same
 * start/stop intent as motion input; the server still owns the reel lease and
 * all distance/tension decisions.
 */
export function PhoneReelControl({ active, disabled, onStart, onStop }: PhoneReelControlProps) {
  const previousAngleRef = useRef<number | null>(null);
  const clockwiseProgressRef = useRef(0);
  const [rotation, setRotation] = useState(0);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    previousAngleRef.current = pointerAngle(event);
    clockwiseProgressRef.current = 0;
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || previousAngleRef.current === null) return;
    const nextAngle = pointerAngle(event);
    const delta = wrapAngle(nextAngle - previousAngleRef.current);
    previousAngleRef.current = nextAngle;
    if (!Number.isFinite(delta)) return;

    setRotation(value => value + delta * 180 / Math.PI);
    clockwiseProgressRef.current += delta;
    if (clockwiseProgressRef.current >= .16) {
      onStart();
      clockwiseProgressRef.current = 0;
    } else if (clockwiseProgressRef.current <= -.16) {
      onStop();
      clockwiseProgressRef.current = 0;
    }
  };

  const stop = () => {
    previousAngleRef.current = null;
    clockwiseProgressRef.current = 0;
    onStop();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
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
      className={`phone-reel${active ? " is-held" : ""}`}
      aria-label={active ? "リールを巻いています。指を離すと止まります" : "画面のリールを時計回りに回して巻く"}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={stop}
    >
      <span className="phone-reel-ring" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true">
        <i /><i /><i />
      </span>
      <span className="phone-reel-label">{active ? "巻いています" : "回して巻く"}</span>
      <small>{active ? "離すと止まる" : "時計回りに指を動かす"}</small>
    </button>
  );
}
