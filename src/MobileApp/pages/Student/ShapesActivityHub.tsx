import ActivityHub from "./ActivityHub";

const GAMES = [
  {
    id: "house",
    title: "Build the House",
    blurb: "Drag shapes onto the roof, window, and door.",
    emoji: "🏠",
    tint: "#dff6c9",
    intro: "Build the House! Put each shape on the house",
  },
  {
    id: "shadow",
    title: "Shadow Match",
    blurb: "Drag each toy onto its matching shadow.",
    emoji: "⭐",
    tint: "#d7e6f8",
    intro: "Shadow Match! Match each toy to its shadow",
  },
  {
    id: "trace",
    title: "Tracing the Stars",
    blurb: "Follow the glowing star around the shape.",
    emoji: "✨",
    tint: "#e8dcff",
    intro: "Tracing the Stars! Follow the line around the shape",
  },
] as const;

export default function ShapesActivityHub() {
  return (
    <ActivityHub
      theme="shapes"
      title="Shapes Games"
      backTo="/lesson/shapes"
      pathFor={(id) => `/quest/shapes/${id}`}
      games={GAMES}
    />
  );
}
