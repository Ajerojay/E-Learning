import ActivityHub from "./ActivityHub";

const GAMES = [
  {
    id: "count",
    title: "Count the Raindrops",
    blurb: "Tap the raindrops that match the number on the cloud.",
    emoji: "💧",
    tint: "#d7f0ff",
    intro: "Count the Raindrops! Tap raindrops that match the number",
  },
  {
    id: "feed",
    title: "Feeding Time",
    blurb: "Drag snacks onto Bear's plate and count out loud.",
    emoji: "🍯",
    tint: "#ffe8c8",
    intro: "Feeding Time! Count snacks onto Bear's plate",
  },
  {
    id: "dots",
    title: "Connect the Dots",
    blurb: "Draw a line from 1 to 5 to find the hidden animal.",
    emoji: "✏️",
    tint: "#fff4c4",
    intro: "Connect the Dots! Follow the numbers to find a hidden animal",
  },
] as const;

export default function NumbersActivityHub() {
  return (
    <ActivityHub
      theme="numbers"
      title="Numbers Games"
      backTo="/lesson/numbers"
      pathFor={(id) => `/quest/number/${id}`}
      games={GAMES}
    />
  );
}
