import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState } from "react";
import mapBg from "./images/quest-map-scenery.png";
import bear from "./images/bear-2.png";
import "./QuestLevelSelect.css";

type QuestLevelSelectProps = {
  title: string;
  unlockedCount: number;
  onSelectLevel: (levelIndex: number) => void;
  onBack: () => void;
};

const LEVELS = [
  { index: 0, label: "Level 1", className: "qlm-node--1" },
  { index: 1, label: "Level 2", className: "qlm-node--2" },
  { index: 2, label: "Level 3", className: "qlm-node--3" },
];

function CloudShape() {
  return (
    <svg className="qlm-cloud" viewBox="0 0 260 150" aria-hidden="true">
      <ellipse cx="78" cy="96" rx="62" ry="40" fill="#cfe8fb" />
      <ellipse cx="138" cy="78" rx="70" ry="52" fill="#cfe8fb" />
      <ellipse cx="196" cy="98" rx="54" ry="38" fill="#cfe8fb" />
      <ellipse cx="78" cy="90" rx="56" ry="34" fill="#ffffff" />
      <ellipse cx="136" cy="74" rx="64" ry="46" fill="#ffffff" />
      <ellipse cx="194" cy="92" rx="48" ry="32" fill="#ffffff" />
    </svg>
  );
}

export default function QuestLevelSelect({
  title,
  unlockedCount,
  onSelectLevel,
  onBack,
}: QuestLevelSelectProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pathD, setPathD] = useState("");

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const draw = () => {
      const nodes = [...stage.querySelectorAll<HTMLElement>(".qlm-node")];
      if (nodes.length < 3) return;
      const box = stage.getBoundingClientRect();
      const points = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - box.left,
          y: rect.top + rect.height * 0.52 - box.top,
        };
      });
      const [start, mid, end] = points;
      setPathD(`M ${start.x} ${start.y} L ${mid.x} ${mid.y} L ${end.x} ${end.y}`);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    window.addEventListener("resize", draw);
    window.addEventListener("orientationchange", draw);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", draw);
      window.removeEventListener("orientationchange", draw);
    };
  }, []);

  return createPortal(
    <div className="qlm" style={{ backgroundImage: `url(${mapBg})` }}>
      <button type="button" className="qlm-back" onClick={onBack}>
        {"\u2190"} Back
      </button>
      <h1 className="qlm-title">{title}</h1>
      <p className="qlm-hint">Pick a level. Finish Level 1 to open the next clouds.</p>

      <div className="qlm-stage" ref={stageRef}>
        <svg className="qlm-trail" aria-hidden="true">
          <path d={pathD} />
        </svg>
        <img className="qlm-bear" src={bear} alt="" />
        {LEVELS.map((level) => {
          const locked = level.index >= unlockedCount;
          return (
            <button
              key={level.index}
              type="button"
              className={`qlm-node ${level.className}${locked ? " is-locked" : " is-open"}`}
              onClick={() => {
                if (!locked) onSelectLevel(level.index);
              }}
              aria-label={locked ? `${level.label} locked` : `Play ${level.label}`}
              disabled={locked}
            >
              <CloudShape />
              {locked ? (
                <span className="qlm-lock" aria-hidden="true">{"\u{1F512}"}</span>
              ) : null}
              <span className="qlm-label">{level.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
