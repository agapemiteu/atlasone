import type { PublicStatus } from "@atlas/public-status.ts";
import { CodeTabs } from "@/components/code-tabs";
import { CopyButton } from "@/components/copy-button";
import { Demo } from "@/components/demo";
import { Icon } from "@/components/icon";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, StatusDot } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStatus } from "@/hooks/use-status";
import { CLIENTS, clientSnippets, COPY, type Lang, USE_CASES } from "@/lib/content";

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
          <h1 className="mx-auto mt-4 max-w-[16ch] text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
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
            From a real run on 11 Oct 2026. The question and the Hausa answer are verbatim.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm font-medium text-muted-foreground">
            {CLIENTS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </section>

        <section id="connect" className="pt-24 sm:pt-32">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t.setup}</h2>
          <div className="mt-6 flex max-w-2xl items-center gap-2 rounded-xl border bg-muted/50 p-1.5 pl-4">
            <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] whitespace-nowrap sm:text-[15px] [scrollbar-width:none]">{mcp}</code>
            <CopyButton text={mcp} label="Copy" variant="default" />
          </div>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{t.setupNote}</p>
          <div className="mt-8 max-w-3xl">
            <p className="text-sm font-medium">{t.perClient}</p>
            <CodeTabs items={clientSnippets(mcp)} />
          </div>
        </section>

        <section className="pt-24 sm:pt-32">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t.cases}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {USE_CASES.map((u) => (
              <Card key={u.title} className="gap-3">
                <CardHeader>
                  <Icon name={u.icon} size={22} className="text-success" />
                  <CardTitle className="mt-3 text-base">{u.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{u.line}</p>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex items-start gap-2 rounded-lg border bg-muted/50 py-2 pr-1 pl-3 font-mono text-[12.5px] leading-relaxed">
                    <span className="flex-1">{u.ask}</span>
                    <CopyButton text={u.ask} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="pt-24 sm:pt-32">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t.live}</h2>
            <StatusDot status={status} />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-y-8 border-t pt-8 md:grid-cols-4">
            {[
              ["~4 min", "asleep to online, on demand"],
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
          : "Asleep to save GPU hours. It wakes automatically on the first request and shows each stage here. Until then, callers get a clear error, never a fake answer."}
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
      {started !== null && <p className="mt-3 text-xs text-muted-foreground">Started {started}s ago. Cold starts take about 4 minutes.</p>}
    </div>
  );
}
