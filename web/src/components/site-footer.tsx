import { MODEL_CARD } from "@atlas/chat.ts";
import type { Lang } from "@/lib/content";
import { REPO } from "@/lib/content";

export function SiteFooter({ lang }: { lang?: Lang }) {
  return (
    <footer className="mt-24 border-t sm:mt-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-start md:justify-between">
        <p className="max-w-xl">{MODEL_CARD.credit_line}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {lang && <a className="hover:text-foreground" href={lang === "en" ? "/?lang=ha" : "/"}>{lang === "en" ? "Hausa" : "English"}</a>}
          <a className="hover:text-foreground" href="/guide">Guide</a>
          <a className="hover:text-foreground" href="/docs">Docs</a>
          <a className="hover:text-foreground" href="/evidence">Beta evidence</a>
          <a className="hover:text-foreground" href="/playground">Playground</a>
          <a className="hover:text-foreground" href="/access">Access</a>
          <a className="hover:text-foreground" href="https://huggingface.co/NCAIR1/N-ATLaS">Licence</a>
          <a className="hover:text-foreground" href={REPO}>GitHub</a>
        </div>
      </div>
    </footer>
  );
}
