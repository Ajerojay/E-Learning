import { useChildVoiceEnabled } from "../../../lib/childVoice";
import "./ChildMusicToggle.css";

export default function ChildVoiceToggle({ className = "" }: { className?: string }) {
  const [enabled, setEnabled] = useChildVoiceEnabled();
  return (
    <button
      type="button"
      className={`child-music-toggle${className ? ` ${className}` : ""}`}
      onClick={() => setEnabled(!enabled)}
      aria-label={enabled ? "Mute voice" : "Unmute voice"}
      title={enabled ? "Mute voice" : "Unmute voice"}
    >
      {enabled ? "🔊" : "🔇"}
    </button>
  );
}
