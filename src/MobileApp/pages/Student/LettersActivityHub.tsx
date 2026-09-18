import ActivityHub from "./ActivityHub";

const GAMES = [
  {
    id: "match",
    title: "Letter Baskets",
    blurb: "Match each apple to the right letter basket.",
    emoji: "🍎",
    tint: "#ffe8c8",
    intro: "Letter Baskets! Match each apple to its letter",
  },
  {
    id: "mama",
    title: "Mama and Baby",
    blurb: "Drag each baby lowercase letter back to its mama.",
    emoji: "🐘",
    tint: "#fff4c4",
    intro: "Mama and Baby! Match little letters to big letters",
  },
  {
    id: "train",
    title: "Alphabet Train",
    blurb: "Load the letter blocks in A-B-C order.",
    emoji: "🚂",
    tint: "#e8f4d8",
    intro: "Alphabet Train! Put the letters in A B C order",
  },
] as const;

export default function LettersActivityHub() {
  return (
    <ActivityHub
      theme="letters"
      title="Letters Games"
      backTo="/lesson/letters"
      pathFor={(id) => `/quest/letter/${id}`}
      games={GAMES}
    />
  );
}
