import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Bookmark,
  Briefcase,
  Building2,
  Camera,
  Coffee,
  Dog,
  Flag,
  Gamepad2,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Megaphone,
  Music,
  Palette,
  Plane,
  ShoppingBag,
  Sparkles,
  Star,
  Stethoscope,
  Tag,
  Users,
  Wrench,
} from "lucide-react";

/** Keep in sync with convex/dmLabels.ts DM_LABEL_ICONS. */
export const DM_LABEL_ICON_OPTIONS: Array<{
  key: string;
  Icon: LucideIcon;
  label: string;
}> = [
  { key: "tag", Icon: Tag, label: "Tag" },
  { key: "briefcase", Icon: Briefcase, label: "Work" },
  { key: "heart", Icon: Heart, label: "Favorites" },
  { key: "star", Icon: Star, label: "Star" },
  { key: "home", Icon: Home, label: "Home" },
  { key: "users", Icon: Users, label: "People" },
  { key: "shopping-bag", Icon: ShoppingBag, label: "Shopping" },
  { key: "graduation-cap", Icon: GraduationCap, label: "School" },
  { key: "plane", Icon: Plane, label: "Travel" },
  { key: "music", Icon: Music, label: "Music" },
  { key: "camera", Icon: Camera, label: "Camera" },
  { key: "coffee", Icon: Coffee, label: "Coffee" },
  { key: "gamepad-2", Icon: Gamepad2, label: "Games" },
  { key: "landmark", Icon: Landmark, label: "Finance" },
  { key: "stethoscope", Icon: Stethoscope, label: "Health" },
  { key: "wrench", Icon: Wrench, label: "Tools" },
  { key: "sparkles", Icon: Sparkles, label: "Sparkles" },
  { key: "bookmark", Icon: Bookmark, label: "Bookmark" },
  { key: "flag", Icon: Flag, label: "Flag" },
  { key: "building-2", Icon: Building2, label: "Business" },
  { key: "baby", Icon: Baby, label: "Family" },
  { key: "dog", Icon: Dog, label: "Pets" },
  { key: "palette", Icon: Palette, label: "Creative" },
  { key: "megaphone", Icon: Megaphone, label: "Promo" },
];

const byKey = new Map(DM_LABEL_ICON_OPTIONS.map((row) => [row.key, row.Icon]));

export function dmLabelIcon(key: string): LucideIcon {
  return byKey.get(key) ?? Tag;
}
