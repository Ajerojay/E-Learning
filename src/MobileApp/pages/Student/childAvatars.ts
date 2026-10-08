import fox from "./images/avatars/fox.png";
import robot from "./images/avatars/robot.png";
import dino from "./images/avatars/dino.png";
import bee from "./images/avatars/bee.png";
import cat from "./images/avatars/cat.png";
import octopus from "./images/avatars/octopus.png";
import bear from "./images/avatars/bear.png";
import hero from "./images/avatars/hero.png";
import unicorn from "./images/avatars/unicorn.png";
import { isChildAvatarId, type ChildAvatarId } from "../../../lib/childAvatar";

export type ChildAvatar = {
  id: ChildAvatarId;
  label: string;
  src: string;
};

export const CHILD_AVATARS: ChildAvatar[] = [
  { id: "fox", label: "Fox", src: fox },
  { id: "robot", label: "Robot", src: robot },
  { id: "dino", label: "Dino", src: dino },
  { id: "bee", label: "Bee", src: bee },
  { id: "cat", label: "Kitty", src: cat },
  { id: "octopus", label: "Octopus", src: octopus },
  { id: "bear", label: "Bear", src: bear },
  { id: "hero", label: "Hero", src: hero },
  { id: "unicorn", label: "Unicorn", src: unicorn },
];

export function childAvatarById(avatarId: string | null | undefined): ChildAvatar | null {
  if (!avatarId || !isChildAvatarId(avatarId)) return null;
  return CHILD_AVATARS.find((avatar) => avatar.id === avatarId) ?? null;
}
