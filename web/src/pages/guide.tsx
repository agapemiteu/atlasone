import type { ReactNode } from "react";
import { AVAILABILITY } from "@atlas/limits.ts";
import { CopyButton } from "@/components/copy-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, StatusDot } from "@/components/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStatus } from "@/hooks/use-status";
import { clientSnippets, IDEAS, STARTER_REPO } from "@/lib/content";

// The beginner's guide: plain language, one action per step, and what to do when something goes wrong.

/** Where each client's snippet goes, in plain words. Same order as clientSnippets(). */
const WHERE: Record<string, string> = {
  "Claude Code": "Open a terminal in your app's folder, paste this and press Enter. Then type claude to start.",
  Codex: "Open a terminal, paste this and press Enter. Then type codex in your app's folder.",
  Cursor: "In Cursor: Settings, then MCP, then Add new MCP server. Paste this into the file that opens and save.",
  "VS Code": "In your app's folder, create a file named .vscode/mcp.json, paste this and save. Use Copilot Chat in Agent mode.",
  Windsurf: "In Windsurf: Settings, then MCP servers, then View raw config. Paste this and save.",
  "Gemini CLI": "Open the file .gemini/settings.json in your home folder, paste this and save. Then type gemini.",
  Other: "In your tool's MCP settings, add a remote server and paste this address.",
};

const AGENTS = [
  ["Claude Code", "https://www.anthropic.com/claude-code"],
  ["Codex", "https://github.com/openai/codex"],
  ["Cursor", "https://cursor.com"],
  ["VS Code", "https://code.visualstudio.com"],
] as const;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">{n}</span>
      <div className="min-w-0 pt-0.5">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-foreground/80">{children}</div>
      </div>
    </li>
  );
}

function CopyBox({ text, mono = true }: { text: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border bg-muted/50 p-1.5 pl-4">
      <p className={`min-w-0 flex-1 py-1.5 text-[13px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap ${mono ? "font-mono" : ""}`}>{text}</p>
      <CopyButton text={text} label="Copy" variant="default" />
    </div>
  );
}

const FAQ: [string, ReactNode][] = [
  [
    "My browser didn't open to sign in",
    <>Ask your agent to use Atlas One again; it opens the sign-in when needed. In Claude Code you can also type <code>/mcp</code>, pick atlas-one and choose Authenticate.</>,
  ],
  [
    "How do I sign in again, or sign out?",
    <>
      Every agent can: <b>Codex</b> <code>codex mcp login atlas-one</code> and <code>codex mcp logout atlas-one</code>. <b>Claude Code</b>: type{" "}
      <code>/mcp</code>, pick atlas-one, then Authenticate or Clear authentication. <b>Gemini CLI</b>: <code>/mcp auth atlas-one</code>. Cursor, VS Code
      and others: in their MCP settings. For any agent, you can also see and sign out everything connected to your account on the{" "}
      <a className="underline underline-offset-4" href="/access">Access</a> page.
    </>,
  ],
  [
    "Codex says \"missing required issuer\" after signing in",
    <>Fixed on our side on 12 Oct 2026. Sign in again: run <code>codex mcp logout atlas-one</code>, then <code>codex mcp login atlas-one</code>. Updating Codex (<code>npm i -g @openai/codex</code>) also helps.</>,
  ],
  [
    "It says N-ATLaS is waking up",
    <>That's normal. To save GPU costs, N-ATLaS sleeps when nobody uses it and wakes as soon as your agent connects. It takes {AVAILABILITY.coldStart}; you can watch each stage at the top of this page. Your agent should wait and try again. It must never invent an answer.</>,
  ],
  [
    "It says MODEL_OFFLINE or another error",
    <>Wait a minute and ask your agent to try again. If it keeps happening, tell us in the feedback form what you saw. Errors are recorded so we can fix them.</>,
  ],
  [
    "I closed the key page before copying the key",
    <>The key is shown only once, for safety. Ask your agent: "Rotate my Atlas One key." It gives you a new link to confirm.</>,
  ],
  [
    "Where exactly does the key go?",
    <>In your app's folder, in a file named <code>.env.local</code> (with the dot at the start; your agent tells you the full path). Paste the two lines from the key page, save, and tell the agent "done": it restarts your app. Never paste the key into the chat.</>,
  ],
  [
    "Is my code or my chat shared with anyone?",
    <>No. Atlas One records only metadata as test evidence: your GitHub username, your agent's name, which steps ran, timings, and request ids. Never your prompts, code, answers or keys. You can appear as anonymous.</>,
  ],
];

export function Guide({ origin }: { origin: string }) {
  const status = useStatus();
  const mcp = `${origin}/mcp`;
  const snippets = clientSnippets(mcp);
  return (
    <>
      <SiteHeader status={status} />
      <main className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 sm:pt-16">
        <p className="text-sm font-medium text-success">Beginner's guide</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">Your first N-ATLaS feature, step by step.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Three steps, no AI experience needed. Free. Steps are recorded as test evidence, never your code or prompts.</p>

        <section className="mt-10 rounded-2xl border p-5 sm:p-6">
          <h2 className="font-semibold">What you need</h2>
          <ul className="mt-3 grid gap-3 text-[15px] text-foreground/80">
            <li>
              <b className="text-foreground">A GitHub account.</b> It's how you sign in. Free at{" "}
              <a className="underline underline-offset-4" href="https://github.com/signup">github.com/signup</a>.
            </li>
            <li>
              <b className="text-foreground">A coding agent:</b> an AI assistant that can read and change code on your computer. Any of these works:{" "}
              {AGENTS.map(([name, href], i) => (
                <span key={name}>
                  <a className="underline underline-offset-4" href={href}>{name}</a>
                  {i < AGENTS.length - 1 ? ", " : "."}
                </span>
              ))}
            </li>
            <li>
              <b className="text-foreground">An app,</b> or our ready-made shop (step 2).
            </li>
          </ul>
        </section>

        <ol className="mt-12 grid gap-12">
          <Step n={1} title="Connect once">
            <p>Pick your agent, copy the line and paste it where the note says. You do this once, for every project after.</p>
            <Tabs defaultValue={snippets[0]![0]} className="mt-1 min-w-0">
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
                <TabsList>
                  {snippets.map(([name]) => (
                    <TabsTrigger key={name} value={name}>{name}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {snippets.map(([name, code]) => (
                <TabsContent key={name} value={name} className="mt-2 space-y-2">
                  <p className="text-sm text-muted-foreground">{WHERE[name]}</p>
                  <CopyBox text={code} />
                </TabsContent>
              ))}
            </Tabs>
            <p className="text-sm text-muted-foreground">
              The first time your agent uses Atlas One, your browser asks you to allow it: click <b>Allow and continue with GitHub</b>. That's
              your only sign-in. N-ATLaS starts waking up at the same moment, so it's ready by the time your code is.
            </p>
          </Step>

          <Step n={2} title="Ask your agent">
            <p>Open your app's folder in your agent, copy one idea and send it, or describe your own.</p>
            <p className="text-sm text-muted-foreground">
              No app? Use the ready-made shop (needs <a className="underline underline-offset-4" href="https://nodejs.org">Node.js</a>):{" "}
              <code>git clone {STARTER_REPO}</code>, then <code>npm start</code> in its folder.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {IDEAS.map((idea) => (
                <div key={idea.title} className="flex flex-col gap-2 rounded-xl border p-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{idea.title}</h3>
                    <p className="text-sm text-muted-foreground">{idea.line}</p>
                  </div>
                  <div className="mt-auto flex items-start gap-2 rounded-lg bg-muted/60 p-1.5 pl-3">
                    <p className="min-w-0 flex-1 py-1 font-mono text-[12px] leading-relaxed">{idea.prompt}</p>
                    <CopyButton text={idea.prompt} />
                  </div>
                </div>
              ))}
            </div>
          </Step>

          <Step n={3} title="Confirm your key">
            <p>
              Your agent opens a page in your browser (or gives you the link). Click <b>Confirm</b>. Copy the two lines it shows into the file your agent names, usually{" "}
              <code>.env.local</code> in your app's folder (the dot at the start matters), and tell the agent "done". It never sees the key.
            </p>
            <p>
              The agent then finishes on its own: it tests on the real N-ATLaS model and checks your app. You're done when it says{" "}
              <code>verified: true</code>.
            </p>
            <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
              <span className="text-muted-foreground">N-ATLaS right now:</span>
              <StatusDot status={status} />
            </div>
          </Step>
        </ol>

        <section className="mt-12 rounded-2xl border p-5 sm:p-6">
          <h2 className="font-semibold">Then, 2 minutes</h2>
          <ul className="mt-3 grid gap-3 text-[15px] leading-relaxed text-foreground/80">
            <li>
              <b className="text-foreground">Try your own questions.</b> <code>verified: true</code> proves your app really used N-ATLaS. It
              doesn't grade the answers, so ask a few real questions and check them.
            </li>
            <li>
              <b className="text-foreground">Keep the receipt.</b> Say yes when the agent offers to save <code>ATLAS_VERIFICATION.jwt</code>, then
              push. Anyone can check it.
            </li>
            <li>
              <b className="text-foreground">Tell us how it went</b> in the{" "}
              <a className="font-medium underline underline-offset-4" href="/feedback">feedback form</a>. Your result appears on the{" "}
              <a className="underline underline-offset-4" href="/evidence">evidence page</a>.
            </li>
          </ul>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">If something goes wrong</h2>
          <div className="mt-4 divide-y rounded-2xl border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="mt-2 text-[15px] leading-relaxed text-foreground/80">{a}</div>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Developer? The full reference is in the <a className="underline underline-offset-4" href="/docs">docs</a>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
