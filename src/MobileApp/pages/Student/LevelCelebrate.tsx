import { useId, useMemo } from "react";
import bear from "./images/bear-celebrate.png";
import { playStarPopSound } from "./starPopSound";
import "./LevelCelebrate.css";

function GoldStar({
  className,
  fill,
  onPop,
}: {
  className: string;
  fill: "full" | "half" | "empty";
  onPop: () => void;
}) {
  const uid = useId().replace(/:/g, "");
  const face = `lcelebStarFace-${uid}`;
  const inner = `lcelebStarInner-${uid}`;
  const empty = `lcelebStarEmpty-${uid}`;
  const clip = `lcelebStarHalf-${uid}`;
  const star = "M32 5.2 39.8 22.4 58.6 24.2 44.4 36.8 48.6 55.4 32 45.8 15.4 55.4 19.6 36.8 5.4 24.2 24.2 22.4Z";
  return (
    <svg
      className={`${className} is-${fill}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      onAnimationStart={(event) => {
        if (!event.animationName.includes("lceleb-star-pop")) return;
        onPop();
      }}
    >
      <defs>
        <linearGradient id={face} x1="14" y1="6" x2="50" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff6b8" />
          <stop offset="28%" stopColor="#ffe566" />
          <stop offset="62%" stopColor="#ffc433" />
          <stop offset="100%" stopColor="#ef9a12" />
        </linearGradient>
        <radialGradient id={inner} cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#fffbe8" />
          <stop offset="55%" stopColor="#ffe98a" />
          <stop offset="100%" stopColor="#f6c43a" />
        </radialGradient>
        <linearGradient id={empty} x1="16" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fffdf4" />
          <stop offset="55%" stopColor="#f4e4b8" />
          <stop offset="100%" stopColor="#e2c78a" />
        </linearGradient>
        {fill === "half" ? (
          <clipPath id={clip}>
            <rect x="0" y="0" width="32" height="64" />
          </clipPath>
        ) : null}
      </defs>
      <path d={star} transform="translate(2.2 3.6)" fill="#c56a08" />
      <path d={star} transform="translate(1.1 1.8)" fill="#e08910" />
      <path d={star} fill={`url(#${empty})`} stroke="#e0c27a" strokeWidth="3.2" strokeLinejoin="round" />
      {fill !== "empty" ? (
        <g clipPath={fill === "half" ? `url(#${clip})` : undefined}>
          <path d={star} fill={`url(#${face})`} stroke="#d8880c" strokeWidth="3.2" strokeLinejoin="round" />
          <path d={star} fill={`url(#${inner})`} transform="translate(32 33) scale(0.62) translate(-32 -33)" />
        </g>
      ) : (
        <path d={star} fill="#fff8e4" transform="translate(32 33) scale(0.58) translate(-32 -33)" />
      )}
      <path
        d="M21 16.5c5.5-7.5 13-10 18.5-8.4"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity={fill === "empty" ? 0.4 : 0.8}
      />
      <circle cx="24.5" cy="20" r="2.1" fill="#fff" opacity={fill === "empty" ? 0.32 : 0.72} />
    </svg>
  );
}

/** Right star delay 1.4s + pop 0.72s, then a short land beat before TTS. */
export const LEVEL_CELEBRATE_STAR_POP_MS = 2600;

export default function LevelCelebrate({ stars }: { stars: number }) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        id: index,
        left: `${(index * 11) % 100}%`,
        delay: `${(index % 12) * 0.16}s`,
        duration: `${2.2 + (index % 6) * 0.32}s`,
        width: 8 + (index % 5) * 3,
        height: 12 + (index % 4) * 4,
        round: index % 5 === 0,
        color: ["#ef5b6a", "#4d9fff", "#ffe066", "#62d26f", "#ff9f43", "#ff8fb8", "#b07d73"][index % 7],
        rotate: `${(index * 47) % 360}deg`,
      })),
    []
  );

  const sparks = useMemo(
    () => [
      { top: "8%", left: "12%" },
      { top: "18%", left: "82%" },
      { top: "48%", left: "6%" },
      { top: "42%", left: "88%" },
      { top: "68%", left: "18%" },
      { top: "72%", left: "78%" },
    ],
    []
  );

  const fills: Array<"full" | "half" | "empty"> = [0, 1, 2].map((index) =>
    stars >= index + 1 ? "full" : stars >= index + 0.5 ? "half" : "empty"
  );

  return (
    <div className="lceleb" aria-hidden="true">
      <div className="lceleb-confetti">
        {confetti.map((bit) => (
          <span
            key={bit.id}
            className={`lceleb-bit${bit.round ? " is-round" : ""}`}
            style={{
              left: bit.left,
              width: bit.width,
              height: bit.height,
              background: bit.color,
              animationDelay: bit.delay,
              animationDuration: bit.duration,
              ["--spin" as string]: bit.rotate,
            }}
          />
        ))}
      </div>

      <div className="lceleb-stars" aria-label={`${stars} of 3 stars`}>
        <GoldStar className="lceleb-star is-left" fill={fills[0]} onPop={() => playStarPopSound(0, fills[0])} />
        <GoldStar className="lceleb-star is-mid" fill={fills[1]} onPop={() => playStarPopSound(1, fills[1])} />
        <GoldStar className="lceleb-star is-right" fill={fills[2]} onPop={() => playStarPopSound(2, fills[2])} />
      </div>

      <div className="lceleb-bear-stage">
        {sparks.map((spark) => (
          <span key={`${spark.top}-${spark.left}`} className="lceleb-spark" style={spark} />
        ))}
        <span className="lceleb-hill" />
        <img className="lceleb-bear" src={bear} alt="" />
      </div>
    </div>
  );
}
