import ActivityHub from "./ActivityHub";

const GAMES = [
  {
    id: "sort",
    title: "Color Baskets",
    blurb: "Sort each picture into the matching color basket.",
    emoji: "🧺",
    tint: "#dff6c9",
    intro: "Color Baskets! Sort each picture by color",
  },
  {
    id: "balloons",
    title: "Balloon Pop",
    blurb: "Pop only the color Bear asks for.",
    emoji: "🎈",
    tint: "#d8f3e4",
    intro: "Balloon Pop! Pop only the color Bear asks for",
  },
  {
    id: "paint",
    title: "Fill the Canvas",
    blurb: "Pick a paint color and fill the drawing.",
    emoji: "🎨",
    tint: "#fff4d6",
    intro: "Fill the Canvas! Pick a color and paint the picture",
  },
] as const;

export default function ColorsActivityHub() {
  return (
    <ActivityHub
      theme="colors"
      title="Colors Games"
      backTo="/lesson/colors"
      pathFor={(id) => `/quest/colors/${id}`}
      games={GAMES}
    />
  );
}
