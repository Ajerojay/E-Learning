import { useMemo } from "react";
import "./ColorConfetti.css";

export default function ColorConfetti({ active }: { active: boolean }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        id: index,
        left: `${(index * 17) % 100}%`,
        delay: `${(index % 8) * 0.08}s`,
        duration: `${1.4 + (index % 5) * 0.18}s`,
        color: ["#ef5b6a", "#4d9fff", "#ffe066", "#62d26f", "#ff9f43", "#ff8fb8", "#b07d73"][index % 7],
        rotate: `${(index * 47) % 360}deg`,
      })),
    []
  );

  if (!active) return null;
  return (
    <div className="cconfetti" aria-hidden="true">
      {bits.map((bit) => (
        <span
          key={bit.id}
          className="cconfetti-bit"
          style={{
            left: bit.left,
            animationDelay: bit.delay,
            animationDuration: bit.duration,
            background: bit.color,
            transform: `rotate(${bit.rotate})`,
          }}
        />
      ))}
    </div>
  );
}
