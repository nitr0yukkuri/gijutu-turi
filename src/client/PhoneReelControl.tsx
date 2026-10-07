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

const pointerPosition = (event: PointerEvent<HTMLButtonElement>) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - (bounds.left + bounds.width / 2);
  const y = event.clientY - (bounds.top + bounds.height / 2);
  return {
    angle: Math.atan2(y, x),
    radius: Math.hypot(x, y),
    rotationRadius: Math.min(bounds.width, bounds.height) * .2,
  };
};

/**
 * A touch fallback for the phone controller. It intentionally emits the same
 * start/stop intent as motion input; the server still owns the reel lease and
 * all distance/tension decisions.
 */
export function PhoneReelControl({ active, disabled, onStart, onStop }: PhoneReelControlProps) {
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
    previousAngleRef.current = position.radius > position.rotationRadius ? position.angle : null;
    clockwiseProgressRef.current = 0;
    onStart();
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || activePointerIdRef.current !== event.pointerId) return;
    const position = pointerPosition(event);
    if (position.radius <= position.rotationRadius) {
      previousAngleRef.current = null;
      return;
    }
    if (previousAngleRef.current === null) {
      previousAngleRef.current = position.angle;
      return;
    }
    const nextAngle = position.angle;
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

  const stop = (pointerId?: number) => {
    if (pointerId !== undefined && activePointerIdRef.current !== pointerId) return;
    activePointerIdRef.current = null;
    previousAngleRef.current = null;
    clockwiseProgressRef.current = 0;
    onStop();
  };

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => stop(event.pointerId);

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
      aria-label={active ? "リールを巻いています。指を離すと止まります" : "リールを押し続けるか、時計回りに回して巻く"}
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
      <span className="phone-reel-ring" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true">
        <i /><i /><i />
      </span>
      <span className="phone-reel-crank" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true"><i /></span>
      <span className="phone-reel-hub" aria-hidden="true" />
      <span className="phone-reel-label">{active ? "巻いています" : "押す / 回して巻く"}</span>
      <small>{active ? "離すと止まる" : "押し続ける / 時計回りに回す"}</small>
    </button>
  );
}
