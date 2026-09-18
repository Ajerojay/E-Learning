import ActivityHub from "./ActivityHub";

const GAMES = [
  {
    id: "sound",
    title: "Listen and Match",
    blurb: "Tap the speaker, then pick the animal that makes the sound.",
    emoji: "🔊",
    tint: "#ffe4f0",
    intro: "Listen and Match! Hear a sound, then pick the animal",
  },
  {
    id: "beginning",
    title: "Beginning Sounds",
    blurb: "Hear the first sound of a word, then tap the matching letter.",
    emoji: "☀️",
    tint: "#fff3c8",
    intro: "Beginning Sounds! Hear the first sound, then tap the letter",
  },
  {
    id: "vowels",
    title: "The Singing Vowels",
    blurb: "Tap the birds to hear A E I O U, then find the sound Bear asks for.",
    emoji: "🐦",
    tint: "#e8f4ff",
    intro: "The Singing Vowels! Find the bird that sings the sound",
  },
] as const;

export default function PhonicsActivityHub() {
  return (
    <ActivityHub
      theme="phonics"
      title="Phonics Games"
      backTo="/lesson/phonics"
      pathFor={(id) => `/quest/phonics/${id}`}
      games={GAMES}
    />
  );
}
