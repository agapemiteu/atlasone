import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, StatusDot } from "@/components/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStatus } from "@/hooks/use-status";
import { clientSnippets, STARTER_PROMPT } from "@/lib/content";

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
    "It says N-ATLaS is waking up",
    <>That's normal. To save free GPU time, N-ATLaS sleeps when nobody uses it, and your first request wakes it. It takes about 4 minutes; you can watch each stage at the top of this page. Your agent should wait and try again. It must never invent an answer.</>,
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
    <>In a file in your app's folder that is never shared, usually <code>.env.local</code>. The key page shows the two exact lines to paste. Never paste the key into the chat with your agent.</>,
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
        <p className="mt-4 text-lg text-muted-foreground">No AI experience needed. About 15 minutes. Free.</p>

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
              <b className="text-foreground">An app to add a feature to.</b> Any project folder. No app yet? Ask your agent: "Create a simple website for a small shop."
            </li>
          </ul>
        </section>

        <ol className="mt-12 grid gap-12">
          <Step n={1} title="Connect Atlas One to your agent">
            <p>Pick your agent, copy the line, and paste it where the note says. You only do this once.</p>
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
          </Step>

          <Step n={2} title="Sign in with GitHub">
            <p>
              The first time your agent uses Atlas One, your browser opens a page asking whether to allow it. Click <b>Allow and continue with GitHub</b>,
              then sign in. That's all. Anyone with a GitHub account can use it.
            </p>
          </Step>

          <Step n={3} title="Ask your agent for a feature">
            <p>Open your app's folder in the agent, paste this message and send it. You can also describe your own idea in your own words.</p>
            <CopyBox text={STARTER_PROMPT} />
          </Step>

          <Step n={4} title="Confirm your key">
            <p>
              The agent gives you a link. Open it and click <b>Confirm</b>. You'll see two lines starting with <code>ATLAS_ONE_</code>: copy them into the file
              the agent names (usually <code>.env.local</code>). Then tell the agent "done".
            </p>
            <p className="text-sm text-muted-foreground">The key is like a password for your app. Never paste it into the chat.</p>
          </Step>

          <Step n={5} title="Let it finish and check">
            <p>
              The agent writes the code, then tests it on the real N-ATLaS model. You're done when it reports <code>verified: true</code>. If N-ATLaS is
              asleep, the first test wakes it in about 4 minutes.
            </p>
            <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Right now:</span>
              <StatusDot status={status} />
            </div>
          </Step>

          <Step n={6} title="Keep your receipt, tell us how it went">
            <p>
              The agent offers to save a signed receipt, <code>ATLAS_VERIFICATION.jwt</code>, in your app. Say yes. It proves your app really used N-ATLaS,
              and anyone can check it.
            </p>
            <p>
              Then take 2 minutes for the{" "}
              <a className="font-medium underline underline-offset-4" href="/feedback">feedback form</a>. Your result appears on the{" "}
              <a className="underline underline-offset-4" href="/evidence">evidence page</a>.
            </p>
          </Step>
        </ol>

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
