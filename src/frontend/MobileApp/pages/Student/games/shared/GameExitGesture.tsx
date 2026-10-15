import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

const HOLD_DURATION_MS = 100;
const EXIT_THRESHOLD = 0.96;

type GameExitGestureProps = { className: string; onExit: () => void };
type ExitRail = { left: number; top: number; width: number; height: number };

export default function GameExitGesture({ className, onExit }: GameExitGestureProps) {
  const holdTimer = useRef<number | null>(null);
  const activePointer = useRef<number | null>(null);
  const confirmingRef = useRef(false);
  const holdingRef = useRef(false);
  const railRef = useRef<ExitRail | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const [holding, setHolding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rail, setRail] = useState<ExitRail | null>(null);
  const [tutorialDismissed, setTutorialDismissed] = useState(false);

  const clearTimer = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const closeConfirmation = () => {
    clearTimer();
    confirmingRef.current = false;
    holdingRef.current = false;
    activePointer.current = null;
    setHolding(false);
    setConfirming(false);
    setProgress(0);
    setTutorialDismissed(false);
  };

  const openRail = () => {
    const button = buttonRef.current;
    if (!button || !holdingRef.current) return;
    const bounds = button.getBoundingClientRect();
    const nextRail = {
      left: bounds.left,
      top: bounds.top,
      width: Math.max(bounds.width, window.innerWidth - bounds.left - Math.max(20, bounds.left)),
      height: bounds.height,
    };
    holdTimer.current = null;
    railRef.current = nextRail;
    confirmingRef.current = true;
    setRail(nextRail);
    setProgress(0);
    setConfirming(true);
    if (navigator.vibrate) navigator.vibrate(35);
  };

  const updateSwipe = (clientX: number) => {
    const currentRail = railRef.current;
    if (!confirmingRef.current || !currentRail) return 0;
    const travel = Math.max(1, currentRail.width - currentRail.height);
    const next = Math.min(1, Math.max(0, (clientX - currentRail.left - currentRail.height / 2) / travel));
    setProgress(next);
    if (next > 0.012) setTutorialDismissed(true);
    return next;
  };

  const finishGesture = (clientX: number) => {
    clearTimer();
    const completed = confirmingRef.current && updateSwipe(clientX) >= EXIT_THRESHOLD;
    closeConfirmation();
    if (completed) {
      if (navigator.vibrate) navigator.vibrate([35, 35, 55]);
      onExitRef.current();
    }
  };

  useEffect(() => {
    const isActivePointer = (event: PointerEvent | TouchEvent) => {
      if ("pointerId" in event) return event.pointerId === activePointer.current;
      return holdingRef.current || confirmingRef.current;
    };

    const clientXFromEvent = (event: PointerEvent | TouchEvent) => {
      if ("clientX" in event && typeof event.clientX === "number") return event.clientX;
      const touch = "changedTouches" in event
        ? event.changedTouches[0] ?? event.touches[0]
        : undefined;
      return touch?.clientX ?? 0;
    };

    const onMove = (event: PointerEvent | TouchEvent) => {
      if (!isActivePointer(event)) return;
      event.preventDefault();
      if (confirmingRef.current) updateSwipe(clientXFromEvent(event));
    };

    const onUp = (event: PointerEvent | TouchEvent) => {
      if (!isActivePointer(event)) return;
      event.preventDefault();
      finishGesture(clientXFromEvent(event));
    };

    const onCancel = (event: PointerEvent) => {
      if (event.pointerId !== activePointer.current) return;
      event.preventDefault();
      closeConfirmation();
    };

    const onSelectStart = (event: Event) => {
      if (holdingRef.current || confirmingRef.current) event.preventDefault();
    };

    const options: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("pointermove", onMove, options);
    window.addEventListener("pointerup", onUp, options);
    window.addEventListener("pointercancel", onCancel, options);
    window.addEventListener("touchmove", onMove, options);
    window.addEventListener("touchend", onUp, options);
    window.addEventListener("touchcancel", closeConfirmation, options);
    window.addEventListener("blur", closeConfirmation);
    window.addEventListener("selectstart", onSelectStart, options);
    return () => {
      window.removeEventListener("pointermove", onMove, options);
      window.removeEventListener("pointerup", onUp, options);
      window.removeEventListener("pointercancel", onCancel, options);
      window.removeEventListener("touchmove", onMove, options);
      window.removeEventListener("touchend", onUp, options);
      window.removeEventListener("touchcancel", closeConfirmation, options);
      window.removeEventListener("blur", closeConfirmation);
      window.removeEventListener("selectstart", onSelectStart, options);
    };
  }, []);

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (!confirming) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [confirming]);

  const beginHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    clearTimer();
    activePointer.current = event.pointerId;
    holdingRef.current = true;
    setHolding(true);
    holdTimer.current = window.setTimeout(openRail, HOLD_DURATION_MS);
  };

  const overlay = confirming && rail ? (
    <div className="game-exit-confirm" role="dialog" aria-modal="true" aria-label="Keep holding and swipe right to exit the game">
      <div className="game-exit-confirm__track" style={{ left: rail.left, top: rail.top, width: rail.width, height: rail.height }}>
        <span className="game-exit-confirm__target" style={{ width: rail.height, height: rail.height }} aria-hidden="true">×</span>
        <span
          className="game-exit-confirm__handle"
          style={{ left: `calc(${progress} * (100% - ${rail.height}px))`, width: rail.height, height: rail.height }}
          aria-hidden="true"
        >×</span>
        <div className={`game-exit-confirm__tutorial${tutorialDismissed ? " is-dismissed" : ""}`} aria-hidden="true">
          <svg className="game-exit-confirm__hand" viewBox="0 0 80 100" fill="none">
            <path d="M26 48V13c0-10 13-10 13 0v28-8c0-9 12-9 12 0v9-5c0-8 12-8 12 0v9-3c0-8 12-7 12 1v23c0 12-8 17-11 26H33c-1-7-5-11-10-17L8 58c-6-8 3-16 10-9l8 8v-9Z" fill="#FFD19B" stroke="#985C35" strokeWidth="3" strokeLinejoin="round"/>
            <path d="M31 87h36v11H31z" fill="#FCFCED" stroke="#39616C" strokeWidth="3" strokeLinejoin="round"/>
            <path d="M32 13v27" stroke="#FFE8C9" strokeWidth="4" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${className} game-map-exit${holding ? " is-holding" : ""}${confirming ? " is-confirming" : ""}`}
        onPointerDown={beginHold}
        onContextMenu={(event) => event.preventDefault()}
        onCopy={(event) => event.preventDefault()}
        onCut={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        aria-label="Hold, then swipe right to exit to the level map"
      >
        <span aria-hidden="true">×</span>
      </button>
      {typeof document !== "undefined" && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
