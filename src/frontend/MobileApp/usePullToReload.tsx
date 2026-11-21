import { type ReactNode, useEffect, useState, type RefObject } from "react";
import mainBear from "./images/loading/main-bear.png";
import { isMobileApp } from "./isMobileApp";
import "./usePullToReload.css";

const THRESHOLD = 56;
const MAX_PULL = 52;

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function nearestScrollTop(target: EventTarget | null) {
  let node: HTMLElement | null = target instanceof HTMLElement ? target : null;
  let max = document.scrollingElement?.scrollTop ?? window.scrollY;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      max = Math.max(max, node.scrollTop);
    }
    node = node.parentElement;
  }
  for (const selector of [".pd-main", ".pp-main", ".teacher-app > main"]) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) max = Math.max(max, el.scrollTop);
  }
  return max;
}

export function usePullToReload(scrollerRef?: RefObject<HTMLElement | null>) {
  const [pull, setPull] = useState(0);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let startY = 0;
    let active = false;
    let distance = 0;

    const atTop = (target: EventTarget | null) => {
      const fromRef = scrollerRef?.current?.scrollTop ?? 0;
      return Math.max(fromRef, nearestScrollTop(target)) <= 2;
    };

    const onStart = (event: TouchEvent) => {
      if (!isMobileApp() || reloading || isEditable(event.target)) return;
      const path = window.location.pathname;
      if (/quest|lesson/i.test(path)) return;
      if (!atTop(event.target)) return;
      startY = event.touches[0]?.clientY ?? 0;
      active = true;
      distance = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!active || reloading) return;
      distance = Math.max(0, (event.touches[0]?.clientY ?? startY) - startY);
      if (distance < 8) return;
      if (!atTop(event.target)) {
        active = false;
        distance = 0;
        setPull(0);
        return;
      }
      event.preventDefault();
      setPull(Math.min(MAX_PULL, distance));
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      if (distance >= THRESHOLD) {
        setReloading(true);
        setPull(MAX_PULL);
        window.setTimeout(() => window.location.reload(), 180);
        return;
      }
      distance = 0;
      setPull(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollerRef, reloading]);

  return { pull, reloading };
}

export function AppPullToReload({ children }: { children: ReactNode }) {
  const { pull, reloading } = usePullToReload();
  const offset = reloading ? MAX_PULL : pull;

  useEffect(() => {
    document.documentElement.style.setProperty("--app-pull", `${offset}px`);
    return () => {
      document.documentElement.style.removeProperty("--app-pull");
    };
  }, [offset]);

  return (
    <>
      <div className="app-pull-reload" style={{ height: offset }} aria-live="polite">
        {offset > 8 || reloading ? <img src={mainBear} alt="" className="app-pull-bear" /> : null}
      </div>
      {children}
    </>
  );
}
