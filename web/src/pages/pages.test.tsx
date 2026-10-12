// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicStatus } from "@atlas/public-status.ts";
import { DEMO, DOMAINS, SHOWCASE } from "@/lib/content";
import { Docs } from "./docs";
import { Guide } from "./guide";
import { Home } from "./home";

const ORIGIN = "https://atlas.test";
const status = (backend: PublicStatus["backend"], extra: Partial<PublicStatus> = {}): PublicStatus => ({
  gateway: "ok", backend, stage: null, stage_text: null, detail: null, wake_started_at: null, updated_at: null, stages: [], last_failure: null, ...extra,
});
const home = (s: PublicStatus | null, lang: "en" | "ha" = "en") =>
  renderToStaticMarkup(<Home origin={ORIGIN} lang={lang} autoplay={false} initialStatus={s} />);

describe("home", () => {
  it("leads with the product, one MCP URL, and every major client", () => {
    const html = home(status("ready"));
    expect(html).toContain("Connect the world to N-ATLaS.");
    expect(html).toContain("MCP server");
    expect(html).toContain(`${ORIGIN}/mcp`);
    for (const c of ["Claude Code", "Codex", "Cursor", "VS Code", "Windsurf", "Gemini CLI"]) expect(html).toContain(c);
    expect(html).toContain("Federal Ministry of Communications");
    expect(html).not.toContain("one instruction away");
    expect(html).not.toContain("Ship in Hausa");
  });

  it("shows only verbatim model output from the real run, with attribution", () => {
    const html = home(status("ready"));
    const text = html.replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
    expect(text).toContain(DEMO.label);
    expect(text).toContain(DEMO.hausa);
    for (const x of SHOWCASE) expect(text).toContain(x.output);
    for (const d of DOMAINS) expect(text).toContain(d.title);
    expect(text).toContain("Replay sped up");
    expect(html).toContain("Powered by Awarri");
    expect(html).not.toMatch(/req_[0-9a-f]{6}/); // no ids or slugs in the demo
  });

  it("states an outage honestly and shows observed wake stages", () => {
    expect(home(status("offline"))).toContain("never a fake answer");
    const waking = home(status("waking", { wake_started_at: new Date().toISOString(), stages: [{ id: "downloading_model", text: "Downloading N-ATLaS weights", done: false, current: true }] }));
    expect(waking).toContain("Downloading N-ATLaS weights");
    expect(home(status("offline", { last_failure: "Kaggle quota" }))).toContain("The last wake-up failed: Kaggle quota");
  });

  it("renders in Hausa", () => {
    expect(home(status("ready"), "ha")).toContain("Haɗa duniya da N-ATLaS.");
  });
});

describe("docs", () => {
  it("documents the API, errors and limits from the enforcing modules", () => {
    const html = renderToStaticMarkup(<Docs origin={ORIGIN} />);
    expect(html).toContain(`${ORIGIN}/v1`);
    for (const code of ["MODEL_OFFLINE", "BACKEND_WARMING", "RATE_LIMITED", "INVALID_KEY"]) expect(html).toContain(code);
    expect(html).toContain("30 per minute, 500 per day");
    expect(html).toContain("1,000 active end users");
    expect(html.match(/href="#[a-z]+"/g)).toHaveLength(5);
    for (const capability of ["Structured output", "Function calling", "response_format", "tool_calls", "does not grade answers"]) {
      expect(html).toContain(capability);
    }
  });
});

describe("beginner's guide", () => {
  it("walks a newcomer through every step, with where-to-paste help for each agent and fixes for common problems", () => {
    const html = renderToStaticMarkup(<Guide origin={ORIGIN} />).replaceAll("&#x27;", "'");
    for (const step of ["Connect once", "Ask your agent", "Confirm your key", "Allow and continue with GitHub", "verified: true", "Keep the receipt", "doesn't grade the answers"]) {
      expect(html).toContain(step);
    }
    expect(html).toContain(`claude mcp add --transport http atlas-one ${ORIGIN}/mcp`);
    expect(html).toContain("Open a terminal in your app's folder");
    expect(html).toContain("It never sees the key");
    expect(html).toContain("It says N-ATLaS is waking up");
    expect(html).toContain('href="/feedback"');
    expect(html).not.toMatch(/invite/i);
    expect(html).toContain("https://github.com/agapemiteu/atlas-one-starter");
    expect(html.match(/through Atlas One\. Keep the key server-side, then test and verify it\./g)).toHaveLength(6);
  });
});
