import type { ElementType, ReactNode } from "react";
import "./KidGameTitle.css";

export function KidGameTitle({
  children,
  className = "",
  fitHud = false,
  tag: Tag = "h1",
}: {
  children: ReactNode;
  className?: string;
  fitHud?: boolean;
  tag?: ElementType;
}) {
  return (
    <Tag className={`kid-game-title${fitHud ? " kid-game-title--slot" : ""} ${className}`.trim()}>
      <span className="kid-game-title-chip">{children}</span>
    </Tag>
  );
}
