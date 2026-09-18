import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import bear from "./images/bear-2.png";
import ChildMusicToggle from "./ChildMusicToggle";
import ChildVoiceToggle from "./ChildVoiceToggle";
import { cancelNativeSpeech, speakKidPrompt } from "../../nativeTts";
import { holdChildMusic, releaseChildMusic } from "../../../lib/childMusic";
import { useChildVoiceEnabled } from "../../../lib/childVoice";
import "./ActivityHub.css";

export type ActivityHubGame = {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  tint: string;
  intro?: string;
};

function speechMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1500, Math.min(3800, 700 + words * 280));
}

export default function ActivityHub({
  theme,
  title,
  copy = "Pick a game. Each one has 3 levels.",
  backTo,
  pathFor,
  games,
}: {
  theme: "colors" | "shapes" | "letters" | "numbers" | "phonics" | "logic";
  title: string;
  copy?: string;
  backTo: string;
  pathFor: (gameId: string) => string;
  games: readonly ActivityHubGame[];
}) {
  const navigate = useNavigate();
  const [voiceEnabled] = useChildVoiceEnabled();
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!voiceEnabled) {
      setSpotlightId(null);
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
      await wait(450);
      if (cancelled) return;
      await say(`Welcome to ${title}`);
      for (const game of games) {
        if (cancelled) return;
        setSpotlightId(game.id);
        cardRefs.current[game.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        await say(game.intro ?? `${game.title}. ${game.blurb}`);
      }
      if (cancelled) return;
      setSpotlightId(null);
      await say("Pick the one you want to play");
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
      setSpotlightId(null);
      cancelNativeSpeech();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (holding) {
        holding = false;
        releaseChildMusic();
      }
    };
  }, [theme, title, games, voiceEnabled]);

  const touring = spotlightId !== null;

  return (
    <div className={`ah ah--${theme}`}>
      <button type="button" className="ah-back" onClick={() => navigate(backTo)}>
        <ArrowLeft size={18} strokeWidth={2.75} aria-hidden="true" />
        Back
      </button>
      <div className="ah-toggles">
        <ChildVoiceToggle />
        <ChildMusicToggle />
      </div>
      <header className="ah-hero">
        <span className="ah-bear-wrap">
          <img className="ah-bear" src={bear} alt="" />
        </span>
        <div className="ah-banner">
          <p className="ah-kicker">Play Zone</p>
          <h1 className="ah-title">{title}</h1>
        </div>
        <p className="ah-copy">{copy}</p>
      </header>
      <div className="ah-grid">
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            ref={(node) => {
              cardRefs.current[game.id] = node;
            }}
            className={`ah-card${touring && game.id === spotlightId ? " is-spotlight" : ""}${touring && game.id !== spotlightId ? " is-dim" : ""}`}
            style={{ background: game.tint }}
            onClick={() => navigate(pathFor(game.id))}
          >
            <span className="ah-emoji" aria-hidden="true">
              {game.emoji}
            </span>
            <span className="ah-card-copy">
              <strong>{game.title}</strong>
              <small>{game.blurb}</small>
            </span>
            <span className="ah-card-go" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
