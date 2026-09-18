import { useChildMusicEnabled } from "../../../lib/childMusic";
import "./ChildMusicToggle.css";

export default function ChildMusicToggle({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useChildMusicEnabled();
  return (
    <button
      type="button"
      className={`child-music-toggle${className ? ` ${className}` : ""}`}
      onClick={() => setEnabled(!enabled)}
      aria-label={enabled ? "Mute music" : "Unmute music"}
      title={enabled ? "Mute music" : "Unmute music"}
    >
      {enabled ? "🎵" : "🔇"}
    </button>
  );
}
