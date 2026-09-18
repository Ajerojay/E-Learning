import { useId } from "react";
import { livePlayStars } from "./questLevelMap";
import "./LevelStars.css";

function StarIcon({ fill, uid }: { fill: "full" | "half" | "empty"; uid: string }) {
  const clip = `star-half-${uid}`;
  return (
    <svg className={`level-star is-${fill}`} viewBox="0 0 24 24" aria-hidden="true">
      {fill === "half" ? (
        <defs>
          <clipPath id={clip}>
            <rect x="0" y="0" width="12" height="24" />
          </clipPath>
        </defs>
      ) : null}
      <path
        d="M12 2.4 14.7 8l6.3.7-4.7 4.3 1.3 6.2L12 16.4 6.4 19.2l1.3-6.2L3 8.7 9.3 8z"
        fill="#fff4d4"
        stroke="#e0c27a"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {fill !== "empty" ? (
        <path
          d="M12 2.4 14.7 8l6.3.7-4.7 4.3 1.3 6.2L12 16.4 6.4 19.2l1.3-6.2L3 8.7 9.3 8z"
          fill="#ffd24a"
          stroke="#e39b18"
          strokeWidth="1.6"
          strokeLinejoin="round"
          clipPath={fill === "half" ? `url(#${clip})` : undefined}
        />
      ) : null}
    </svg>
  );
}

export default function LevelStarRow({
  stars,
  size = "map",
}: {
  stars: number;
  size?: "map" | "popup" | "hud";
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <span
      className={`level-stars level-stars--${size}${stars <= 0 ? " is-empty" : ""}`}
      aria-label={`${stars} of 3 stars`}
    >
      {[0, 1, 2].map((index) => {
        const fill = stars >= index + 1 ? "full" : stars >= index + 0.5 ? "half" : "empty";
        return <StarIcon key={index} uid={`${uid}-${index}`} fill={fill} />;
      })}
    </span>
  );
}

export function LiveStarHud({
  timeLeft,
  tried,
  wrong = 0,
}: {
  timeLeft: number;
  tried: boolean;
  wrong?: number;
}) {
  return <LevelStarRow stars={livePlayStars(timeLeft, tried, wrong)} size="hud" />;
}
