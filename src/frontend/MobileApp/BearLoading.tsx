import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import mainBear from "./images/loading/main-bear.png";
import miniBear from "./images/loading/mini-bear.png";
import flower from "./images/loading/flower.png";
import dot from "./images/loading/dot.png";
import "./BearLoading.css";

const SPRITES = {
  bear: miniBear,
  flower,
  dot,
} as const;

const ORBIT = [
  { kind: "bear", start: 0, hue: "312deg", sat: "1.2", size: "15%", top: "1%" },
  { kind: "dot", start: 18, hue: "42deg", sat: "1.3", size: "4.5%", top: "7%" },
  { kind: "bear", start: 48, hue: "200deg", sat: "1.15", size: "15%", top: "1%" },
  { kind: "flower", start: 88, hue: "18deg", sat: "0.75", size: "12%", top: "4%" },
  { kind: "flower", start: 118, hue: "14deg", sat: "1.25", size: "10%", top: "5%" },
  { kind: "bear", start: 148, hue: "148deg", sat: "1.05", size: "15%", top: "1%" },
  { kind: "dot", start: 166, hue: "0deg", sat: "1", size: "4%", top: "8%" },
  { kind: "flower", start: 180, hue: "352deg", sat: "1", size: "10%", top: "4%" },
  { kind: "dot", start: 194, hue: "318deg", sat: "1.2", size: "3.8%", top: "8%" },
  { kind: "bear", start: 218, hue: "0deg", sat: "1.1", size: "15%", top: "1%" },
  { kind: "flower", start: 248, hue: "0deg", sat: "0.9", size: "9%", top: "6%" },
  { kind: "flower", start: 275, hue: "4deg", sat: "1", size: "13%", top: "3%" },
  { kind: "dot", start: 298, hue: "200deg", sat: "1", size: "4%", top: "7%" },
  { kind: "bear", start: 328, hue: "0deg", sat: "1.1", size: "15%", top: "1%" },
  { kind: "dot", start: 346, hue: "42deg", sat: "1.3", size: "4.5%", top: "7%" },
] as const;

const TITLE_TOP = [
  { letter: "L", color: "#ff6b8a" },
  { letter: "e", color: "#ff9f43" },
  { letter: "a", color: "#f7d22e" },
  { letter: "r", color: "#7bd36a" },
  { letter: "n", color: "#4ec6e8" },
  { letter: "E", color: "#7b9cff" },
  { letter: "a", color: "#c58cff" },
  { letter: "s", color: "#ff6b8a" },
  { letter: "e", color: "#ff9f43" },
];

const LOADING_LETTERS = [
  { letter: "L", color: "#ff6b8a" },
  { letter: "O", color: "#ff9f43" },
  { letter: "A", color: "#f7d22e" },
  { letter: "D", color: "#7bd36a" },
  { letter: "I", color: "#4ec6e8" },
  { letter: "N", color: "#7b9cff" },
  { letter: "G", color: "#c58cff" },
  { letter: ".", color: "#ff6b8a" },
  { letter: ".", color: "#ff9f43" },
  { letter: ".", color: "#f7d22e" },
];

type BearLoadingProps = {
  compact?: boolean;
  dark?: boolean;
  overlay?: boolean;
};

export default function BearLoading({ compact = false, dark = false, overlay = false }: BearLoadingProps) {
  const node = (
    <div
      className={`bear-load${compact ? " is-compact" : ""}${dark ? " is-dark" : ""}${overlay ? " is-overlay" : ""}`}
      role="status"
      aria-label="Loading LearnEase"
    >
      {!compact && (
        <h1 className="bear-load-title">
          <span className="bear-load-title-row">
            {TITLE_TOP.map((item, index) => (
              <span key={`top-${index}`} style={{ color: item.color }}>{item.letter}</span>
            ))}
          </span>
        </h1>
      )}
      <div className="bear-load-badge">
        <div className="bear-load-stage">
          {ORBIT.map((item) => (
            <span
              key={`${item.kind}-${item.start}`}
              className="bear-load-orbit"
              style={{ "--start": `${item.start}deg` } as CSSProperties}
            >
              <img
                src={SPRITES[item.kind]}
                alt=""
                className={`bear-load-item is-${item.kind}`}
                style={{
                  "--hue": item.hue,
                  "--sat": item.sat,
                  "--size": item.size,
                  "--top": item.top,
                } as CSSProperties}
              />
            </span>
          ))}
          <img src={mainBear} alt="" className="bear-load-hero" />
        </div>
      </div>
      {!compact && (
        <>
          <p className="bear-load-caption">
            {LOADING_LETTERS.map((item, index) => (
              <span key={`load-${index}`} style={{ color: item.color }}>{item.letter}</span>
            ))}
          </p>
          <div className="bear-load-bar" aria-hidden="true">
            <span className="bear-load-bar-fill" />
          </div>
        </>
      )}
    </div>
  );

  if (overlay && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}
