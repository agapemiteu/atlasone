import {
  AiChat02Icon,
  ArrowRight01Icon,
  CheckmarkBadge01Icon,
  Copy01Icon,
  Database01Icon,
  GithubIcon,
  Plant02Icon,
  Robot01Icon,
  Tick02Icon,
  TranslateIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

// Hugeicons free set (MIT). One stroke weight across the site.
const ICONS = {
  arrow: ArrowRight01Icon,
  chat: AiChat02Icon,
  copy: Copy01Icon,
  data: Database01Icon,
  github: GithubIcon,
  plant: Plant02Icon,
  agent: Robot01Icon,
  tick: Tick02Icon,
  translate: TranslateIcon,
  verified: CheckmarkBadge01Icon,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return <HugeiconsIcon icon={ICONS[name]} size={size} strokeWidth={1.6} className={className} aria-hidden />;
}
