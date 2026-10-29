import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./IdleAnswerHint.css";

const IDLE_DELAY_MS = 5000;
const OPENING_DELAY_MS = 350;

/** Visual guidance only: never clicks a choice or changes the learner's score. */
export default function IdleAnswerHint({ active, questionKey, sourceSelector = '[data-idle-answer="true"], [data-idle-source]', destinationSelector }: { active: boolean; questionKey: string; sourceSelector?: string; destinationSelector?: string }) {
  const [point, setPoint] = useState<{ x: number; y: number; dx: number; dy: number; drag: boolean } | null>(null);
  const openingPlayedRef = useRef(false);

  useEffect(() => {
    setPoint(null);
    if (!active) return;
    let timer = 0;
    let frame = 0;
    let startedAt = 0;
    let openingLive = !openingPlayedRef.current;

    const reveal = () => {
      const blocked = document.hidden || Boolean(document.querySelector(".game-overlay, .game-exit-confirm"));
      const target = blocked ? null : document.querySelector<HTMLElement>(sourceSelector);
      if (!target) {
        setPoint(null);
        timer = window.setTimeout(reveal, 250);
        return;
      }
      const box = target.getBoundingClientRect();
      if (!box.width || !box.height) {
        timer = window.setTimeout(reveal, 250);
        return;
      }
      let x = box.left + box.width * Number(target.dataset.hintX ?? .55);
      let y = box.top + box.height * Number(target.dataset.hintY ?? .55);
      const tracePath = document.querySelector<SVGPathElement>('[data-idle-path="true"]');
      if (tracePath) {
        if (!startedAt) startedAt = performance.now();
        const start = Number(tracePath.dataset.hintProgress ?? 0);
        const fraction = Math.min(1, start + ((performance.now() - startedAt) % 3200) / 3200 * Math.min(.35, 1 - start));
        const pathPoint = tracePath.getPointAtLength(tracePath.getTotalLength() * fraction);
        const matrix = tracePath.getScreenCTM();
        if (matrix) {
          const screenPoint = new DOMPoint(pathPoint.x, pathPoint.y).matrixTransform(matrix);
          x = screenPoint.x;
          y = screenPoint.y;
        }
      }
      const match = target.dataset.idleMatch;
      const resolvedDestination = destinationSelector ?? (match ? `[data-idle-target="${CSS.escape(match)}"]` : undefined);
      const destination = resolvedDestination ? document.querySelector<HTMLElement>(resolvedDestination)?.getBoundingClientRect() : null;
      if (resolvedDestination && !destination) {
        setPoint(null);
        timer = window.setTimeout(reveal, 250);
        return;
      }
      openingPlayedRef.current = true;
      setPoint({
        x,
        y,
        dx: destination ? destination.left + destination.width / 2 - x : 0,
        dy: destination ? destination.top + destination.height / 2 - y : 0,
        drag: !!destination,
      });
      frame = window.requestAnimationFrame(reveal);
    };

    const arm = (delay: number) => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      startedAt = 0;
      setPoint(null);
      if (!document.hidden) timer = window.setTimeout(reveal, delay);
    };

    const onMove = () => {
      if (openingLive) return;
      arm(IDLE_DELAY_MS);
    };
    const onIntent = () => {
      openingLive = false;
      openingPlayedRef.current = true;
      arm(IDLE_DELAY_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        window.cancelAnimationFrame(frame);
        setPoint(null);
        return;
      }
      arm(openingLive ? OPENING_DELAY_MS : IDLE_DELAY_MS);
    };

    arm(openingLive ? OPENING_DELAY_MS : IDLE_DELAY_MS);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onIntent, { passive: true });
    window.addEventListener("touchstart", onIntent, { passive: true });
    window.addEventListener("keydown", onIntent);
    window.addEventListener("resize", onMove);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onIntent);
      window.removeEventListener("touchstart", onIntent);
      window.removeEventListener("keydown", onIntent);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, questionKey, sourceSelector, destinationSelector]);

  if (!point) return null;
  return createPortal(
    <div className={`idle-answer-hint${point.drag ? " idle-answer-hint--drag" : ""}`} style={{ left: point.x, top: point.y, "--hint-dx": `${point.dx}px`, "--hint-dy": `${point.dy}px` } as CSSProperties} aria-hidden="true">
      <span className="idle-answer-hint__ripple" />
      <svg viewBox="0 0 80 100" fill="none">
        <path d="M26 48V13c0-10 13-10 13 0v28-8c0-9 12-9 12 0v9-5c0-8 12-8 12 0v9-3c0-8 12-7 12 1v23c0 12-8 17-11 26H33c-1-7-5-11-10-17L8 58c-6-8 3-16 10-9l8 8v-9Z" fill="#FFD19B" stroke="#985C35" strokeWidth="3" strokeLinejoin="round"/>
        <path d="M31 87h36v11H31z" fill="#FCFCED" stroke="#39616C" strokeWidth="3" strokeLinejoin="round"/>
        <path d="M32 13v27" stroke="#FFE8C9" strokeWidth="4" strokeLinecap="round"/>
      </svg>
    </div>, document.body
  );
}
