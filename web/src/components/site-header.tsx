import type { PublicStatus } from "@atlas/public-status.ts";
import { Button } from "@/components/ui/button";
import { STATE_TEXT } from "@/hooks/use-status";
import { cn } from "@/lib/utils";
import { REPO } from "@/lib/content";
import { Icon } from "./icon";

export function Logo() {
  return (
    <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect width="24" height="24" rx="6" className="fill-foreground" />
        <path d="M7 17 12 6l5 11M9.2 13h5.6" className="stroke-background" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Atlas One
    </a>
  );
}

export function StatusDot({ status, withText = true }: { status: PublicStatus | null; withText?: boolean }) {
  const state = status?.backend;
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      <span
        className={cn(
          "size-2 rounded-full bg-muted-foreground/40",
          state === "ready" && "bg-success ring-4 ring-success/15",
          (state === "waking" || state === "loading") && "animate-pulse bg-warning",
        )}
      />
      {withText && <span>N-ATLaS {state ? STATE_TEXT[state].toLowerCase() : "…"}</span>}
    </span>
  );
}

export function SiteHeader({ status, connectLabel = "Connect" }: { status?: PublicStatus | null; connectLabel?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          {status !== undefined && (
            <span className="mr-2 max-sm:hidden">
              <StatusDot status={status} />
            </span>
          )}
          <Button variant="ghost" asChild>
            <a href="/guide">Guide</a>
          </Button>
          <Button variant="ghost" asChild className="max-sm:hidden">
            <a href="/docs">Docs</a>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href={REPO} aria-label="GitHub">
              <Icon name="github" />
            </a>
          </Button>
          <Button asChild className="ml-1">
            <a href="/#connect">{connectLabel}</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
