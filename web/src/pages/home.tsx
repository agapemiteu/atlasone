import type { PublicStatus } from "@atlas/public-status.ts";
import { CodeTabs } from "@/components/code-tabs";
import { CopyButton } from "@/components/copy-button";
import { Demo } from "@/components/demo";
import { Icon } from "@/components/icon";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, StatusDot } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useStatus } from "@/hooks/use-status";
import { AVAILABILITY } from "@atlas/limits.ts";
import { CLIENTS, clientSnippets, COPY, DEMO, DOMAINS, type Lang, SHOWCASE, STARTER_PROMPT } from "@/lib/content";

export function Home({ origin, lang, autoplay = true, initialStatus }: { origin: string; lang: Lang; autoplay?: boolean; initialStatus?: PublicStatus | null }) {
  const live = useStatus();
  const status = live ?? initialStatus ?? null;
  const t = COPY[lang];
  const mcp = `${origin}/mcp`;

  return (
    <>
      <SiteHeader status={status} connectLabel={lang === "en" ? "Connect" : "Haɗa"} />
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="pt-16 text-center sm:pt-24">
          <p className="text-sm font-medium text-success">{t.eyebrow}</p>
          <h1 className="mx-auto mt-4 max-w-[13ch] text-[2.75rem] leading-[1.03] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            {t.title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">{t.sub}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" className="h-11 px-5 text-[15px]" asChild>
              <a href="#connect">
                {t.connect} <Icon name="arrow" size={16} />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="h-11 px-5 text-[15px]" asChild>
              <a href="/docs">{t.docs}</a>
            </Button>
          </div>
        </section>

        <section className="mt-14 sm:mt-20">
          <Demo autoplay={autoplay} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Real N-ATLaS output from a live run on 12 Oct 2026, unedited. Replay sped up: the real answer took {DEMO.seconds} s.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm font-medium text-muted-foreground">
            {CLIENTS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </section>

        <section className="pt-24 sm:pt-32">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t.showcase}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t.showcaseSub}</p>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {SHOWCASE.map((x) => (
              <article key={x.title} className="flex min-w-0 flex-col rounded-2xl border p-5">
                <div className="flex flex-wrap gap-1.5">
                  {x.tags.map((tag, i) => (
                    <span key={tag} className={i === 1 ? "rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success" : "rounded-full border px-2 py-0.5 text-xs text-muted-foreground"}>
                      {tag}
                    </span>
                  ))}
                </div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">{x.title}</h3>
                <p className="mt-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">In</p>
                <p className="mt-1 text-sm text-foreground/80">{x.input}</p>
                <p className="mt-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">N-ATLaS</p>
                <p className="mt-1 rounded-lg bg-muted/60 p-2.5 font-mono text-[12.5px] leading-relaxed [overflow-wrap:anywhere]">{x.output}</p>
                <div className="mt-auto pt-4">
                  <CopyButton text={x.prompt} label="Copy prompt" variant="default" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="pt-24 sm:pt-32">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t.cases}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t.casesSub}</p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map((d) => (
              <div key={d.title} className="flex min-w-0 flex-col gap-2 bg-background p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{d.title}</h3>
                  <span className="text-xs whitespace-nowrap text-success">{d.uses}</span>
                </div>
                <p className="text-sm text-muted-foreground">{d.line}</p>
                <div className="mt-auto pt-1">
                  <CopyButton text={d.prompt} label="Copy prompt" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="connect" className="pt-24 sm:pt-32">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t.setup}</h2>
          <p className="mt-3 text-muted-foreground">
            {t.newbie}{" "}
            <a className="font-medium text-foreground underline underline-offset-4" href="/guide">
              {t.guide}
            </a>
          </p>
          <ol className="mt-10 grid max-w-3xl gap-10">
            {t.steps.map(([title, line], i) => (
              <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
                <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="pt-1 text-lg font-semibold tracking-tight">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{line}</p>
                  {i === 0 && (
                    <>
                      <CodeTabs items={clientSnippets(mcp)} />
                      <div className="mt-3 flex items-center gap-2 rounded-xl border bg-muted/50 p-1.5 pl-4">
                        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] whitespace-nowrap [scrollbar-width:none]">{mcp}</code>
                        <CopyButton text={mcp} label="Copy URL" />
                      </div>
                    </>
                  )}
                  {i === 2 && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border bg-muted/50 p-1.5 pl-4">
                      <p className="min-w-0 flex-1 py-1.5 font-mono text-[13px] leading-relaxed">{STARTER_PROMPT}</p>
                      <CopyButton text={STARTER_PROMPT} label="Copy" variant="default" />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="pt-24 sm:pt-32">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t.live}</h2>
            <StatusDot status={status} />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-y-8 border-t pt-8 md:grid-cols-4">
            {[
              ["~30 s", "asleep to online, on demand"],
              ["1.1 s", "Hausa answer, warm"],
              ["4", "languages: en, ha, ig, yo"],
              ["true", "verify_app on a real route"],
            ].map(([v, k]) => (
              <div key={k}>
                <dd className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{v}</dd>
                <dt className="mt-1 text-sm text-muted-foreground">{k}</dt>
              </div>
            ))}
          </dl>
          <WakeProgress status={status} />
        </section>
      </main>
      <SiteFooter lang={lang} />
    </>
  );
}

/** Only while N-ATLaS is starting or asleep: observed stages from /api/status, never simulated. */
function WakeProgress({ status }: { status: PublicStatus | null }) {
  if (!status || status.backend === "ready") return null;
  if (status.backend === "offline")
    return (
      <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
        {status.last_failure
          ? `The last wake-up failed: ${status.last_failure}. The next request tries again.`
          : `Asleep to save GPU costs. It wakes automatically on the first request, in ${AVAILABILITY.coldStart}, and shows each stage here. Until then, callers get a clear error, never a fake answer.`}
      </p>
    );
  const started = status.wake_started_at ? Math.max(0, Math.round((Date.now() - Date.parse(status.wake_started_at)) / 1000)) : null;
  return (
    <div className="mt-8 rounded-xl border p-5">
      <ol className="grid gap-2 text-sm">
        {status.stages.map((s) => (
          <li key={s.id} className={s.done || s.current ? "flex items-center gap-2.5" : "flex items-center gap-2.5 text-muted-foreground"}>
            <span
              className={
                s.done ? "size-2 rounded-full bg-success" : s.current ? "size-2 animate-pulse rounded-full bg-warning" : "size-2 rounded-full border border-muted-foreground/50"
              }
            />
            <span className={s.current ? "font-medium" : undefined}>{s.text}</span>
          </li>
        ))}
      </ol>
      {started !== null && <p className="mt-3 text-xs text-muted-foreground">Started {started}s ago. Cold starts take {AVAILABILITY.coldStart}.</p>}
    </div>
  );
}
