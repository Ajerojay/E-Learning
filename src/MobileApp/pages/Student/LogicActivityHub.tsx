import ActivityHub from "./ActivityHub";
import "./LogicPlayBg.css";

const GAMES = [
  {
    id: "pattern",
    title: "What Comes Next?",
    blurb: "Look at the pattern and drag the right picture into the box.",
    emoji: "🧩",
    tint: "#efe4ff",
    intro: "What Comes Next? Finish the pattern",
  },
  {
    id: "size",
    title: "Big vs. Small",
    blurb: "Sort giant things into the big box and tiny things into the small box.",
    emoji: "📦",
    tint: "#ffe9c8",
    intro: "Big versus Small! Sort big things and tiny things",
  },
  {
    id: "odd",
    title: "Odd One Out",
    blurb: "Tap the picture that does not belong with the others.",
    emoji: "❓",
    tint: "#dceeff",
    intro: "Odd One Out! Tap the picture that does not belong",
  },
] as const;

export default function LogicActivityHub() {
  return (
    <ActivityHub
      theme="logic"
      title="Logic Games"
      backTo="/lesson/logic"
      pathFor={(id) => `/quest/logic/${id}`}
      games={GAMES}
    />
  );
}
