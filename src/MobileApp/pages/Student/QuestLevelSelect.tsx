import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import mapBg from "./images/quest-map-scenery.png";
import bear from "./images/bear-2.png";
import ChildMusicToggle from "./ChildMusicToggle";
import ChildVoiceToggle from "./ChildVoiceToggle";
import LevelStarRow from "./LevelStars";
import { cancelNativeSpeech, speakKidPrompt } from "../../nativeTts";
import { holdChildMusic, releaseChildMusic } from "../../../lib/childMusic";
import { useChildVoiceEnabled } from "../../../lib/childVoice";
import "./QuestLevelSelect.css";

type QuestLevelSelectProps = {
  title: string;
  unlockedCount: number;
  onSelectLevel: (levelIndex: number) => void;
  onBack: () => void;
  levelCount?: number;
  levelStars?: number[];
};

function mapLevels(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    label: `Level ${index + 1}`,
    className: `qlm-node--${index + 1}`,
  }));
}

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

function speechMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.min(3200, 600 + words * 260));
}

export default function QuestLevelSelect({
  title,
  unlockedCount,
  onSelectLevel,
  onBack,
  levelCount = 3,
  levelStars = [],
}: QuestLevelSelectProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pathD, setPathD] = useState("");
  const [spotlightIndex, setSpotlightIndex] = useState<number | null>(null);
  const [voiceEnabled] = useChildVoiceEnabled();
  const levels = mapLevels(levelCount);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const draw = () => {
      const nodes = [...stage.querySelectorAll<HTMLElement>(".qlm-node")];
      if (nodes.length < 2) return;
      const box = stage.getBoundingClientRect();
      const points = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - box.left,
          y: rect.top + rect.height * 0.52 - box.top,
        };
      });
      setPathD(points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "));
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
  }, [levelCount]);

  useEffect(() => {
    if (!voiceEnabled) {
      setSpotlightIndex(null);
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      return;
    }

    let cancelled = false;
    let holding = true;
    const timers: number[] = [];
    holdChildMusic();

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    const say = async (text: string) => {
      if (cancelled) return;
      speakKidPrompt(text, { interrupt: true, rate: 0.95, pitch: 1.28 });
      await wait(speechMs(text));
    };

    const run = async () => {
      await wait(400);
      if (cancelled) return;
      await say(`This is ${title}`);
      for (let index = 0; index < levelCount; index += 1) {
        if (cancelled) return;
        setSpotlightIndex(index);
        await say(`Level ${index + 1}`);
      }
      if (cancelled) return;
      setSpotlightIndex(null);
      await say("Pick a cloud to play");
    };

    void run().finally(() => {
      if (holding) {
        holding = false;
        releaseChildMusic();
      }
    });

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      setSpotlightIndex(null);
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (holding) {
        holding = false;
        releaseChildMusic();
      }
    };
  }, [title, levelCount, voiceEnabled]);

  return createPortal(
    <div className="qlm" style={{ backgroundImage: `url(${mapBg})` }}>
      <header className="qlm-head">
        <button type="button" className="qlm-back" onClick={onBack}>
          <ArrowLeft size={18} strokeWidth={2.75} aria-hidden="true" />
          Back
        </button>
        <div className="qlm-heading">
          <div className="qlm-banner">
            <span className="qlm-sparkle" aria-hidden="true">✦</span>
            <div className="qlm-banner-inner">
              <p className="qlm-kicker">
                <span aria-hidden="true">🗺️</span>
                Level Map
              </p>
              <h1 className="qlm-title">{title}</h1>
            </div>
            <span className="qlm-sparkle" aria-hidden="true">✦</span>
          </div>
        </div>
        <div className="qlm-toggles">
          <ChildVoiceToggle />
          <ChildMusicToggle />
        </div>
      </header>
      <p className="qlm-hint">Pick a cloud. Finish a level to open the next one.</p>

      <div className="qlm-stage" ref={stageRef}>
        <svg className="qlm-trail" aria-hidden="true">
          <path d={pathD} />
        </svg>
        <img className="qlm-bear" src={bear} alt="" />
        {levels.map((level) => {
          const locked = level.index >= unlockedCount;
          return (
            <button
              key={level.index}
              type="button"
              className={`qlm-node ${level.className}${locked ? " is-locked" : " is-open"}${spotlightIndex === level.index ? " is-spotlight" : ""}${spotlightIndex !== null && spotlightIndex !== level.index ? " is-dim" : ""}`}
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
              <span className="qlm-stars">
                <LevelStarRow stars={levelStars[level.index] ?? 0} />
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
