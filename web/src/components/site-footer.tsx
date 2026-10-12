import { MODEL_CARD } from "@atlas/chat.ts";
import type { Lang } from "@/lib/content";
import { REPO } from "@/lib/content";
import { Logo } from "./site-header";

const COLUMNS: [string, [string, string][]][] = [
  ["Build", [["Guide", "/guide"], ["Docs", "/docs"], ["Playground", "/playground"]]],
  ["Account", [["Connect an agent", "/#connect"], ["Access", "/access"], ["Feedback", "/feedback"]]],
  ["Trust", [["Beta evidence", "/evidence"], ["N-ATLaS licence", "https://huggingface.co/NCAIR1/N-ATLaS"], ["Source code", REPO]]],
];

export function SiteFooter({ lang }: { lang?: Lang }) {
  return (
    <footer className="mt-24 border-t sm:mt-32">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-muted-foreground">{MODEL_CARD.credit_line}</p>
          {lang && (
            <a className="mt-4 inline-block text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={lang === "en" ? "/?lang=ha" : "/"}>
              {lang === "en" ? "Karanta da Hausa" : "Read in English"}
            </a>
          )}
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="font-medium">{title}</h2>
            <ul className="mt-3 grid gap-2 text-muted-foreground">
              {links.map(([label, href]) => (
                <li key={href}>
                  <a className="hover:text-foreground" href={href}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
