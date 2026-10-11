import type { ReactNode } from "react";
import { MAX_BODY_BYTES, MAX_TOKENS_CAP, MODEL_CARD } from "@atlas/chat.ts";
import { ERRORS } from "@atlas/errors.ts";
import { LIMITS } from "@atlas/limits.ts";
import { CodeTabs } from "@/components/code-tabs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { appSnippets, clientSnippets } from "@/lib/content";

// Limits and error codes render from the modules that enforce them, so the docs cannot drift.

const TOC = [
  ["quickstart", "Quickstart"],
  ["tools", "Agent tools"],
  ["api", "App API"],
  ["errors", "Errors and limits"],
  ["licence", "Licence"],
] as const;

const PUBLIC_ERRORS = Object.entries(ERRORS).filter(([code]) => !["NOT_FOUND", "CLAIM_EXPIRED", "INTERNAL"].includes(code));

const C = ({ children }: { children: ReactNode }) => <code className="rounded border bg-muted px-1 py-px font-mono text-[0.85em]">{children}</code>;

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-16 text-2xl font-semibold tracking-[-0.025em] first:mt-0">
      {children}
    </h2>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  const wide = head.length > 2;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className={wide ? "w-full min-w-[520px] text-sm" : "w-full text-sm"}>
        <thead>
          <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b align-top">
              {r.map((c, j) => (
                <td key={j} className="py-2.5 pr-4">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Docs({ origin }: { origin: string }) {
  const mcp = `${origin}/mcp`;
  const api = `${origin}/v1`;
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-12 sm:px-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="sticky top-24 hidden self-start lg:grid lg:gap-1">
          {TOC.map(([id, title]) => (
            <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              {title}
            </a>
          ))}
        </nav>

        <article className="max-w-3xl min-w-0 text-[15px] leading-relaxed [&_li]:mt-2 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_p]:text-foreground/80">
          <h1 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Docs</h1>
          <p className="!mt-4 text-lg !text-muted-foreground">
            Atlas One is an MCP server that lets coding agents add genuine N-ATLaS (English, Hausa, Igbo, Yoruba) to your app, then test and verify it.
          </p>

          <div className="mt-14">
            <H2 id="quickstart">Quickstart</H2>
            <ol>
              <li>
                Add <C>{mcp}</C> to your MCP client.
              </li>
              <li>Approve the permissions on the consent page and sign in with GitHub.</li>
              <li>Ask your agent for a feature, e.g. "Add a Hausa customer-support route powered by N-ATLaS, and test it."</li>
            </ol>
            <CodeTabs items={clientSnippets(mcp)} />

            <H2 id="tools">Agent tools</H2>
            <p>Your agent calls these with the permissions you approved, on your projects only. It never receives your key: the key is shown once, in your browser.</p>
            <Table
              head={["Tool", "What it does"]}
              rows={[
                [<C>atlas_discover</C>, "Backend state, model card and an integration recipe for your stack."],
                [<C>atlas_bind_project</C>, "Creates a project; rotates or revokes its key. Returns a link for you to confirm."],
                [<C>atlas_test</C>, "Runs a real inference, or verifies that your app's route reached N-ATLaS."],
                [<C>atlas_inspect</C>, "Requests, latency, errors and quota for a project."],
              ]}
            />
            <p>
              Verification: <C>atlas_test</C> issues a one-time nonce, your app sends it as <C>x-atlas-verify</C>, and <C>verify_app</C> returns{" "}
              <C>verified: true</C> only if that request reached N-ATLaS through your project.
            </p>

            <H2 id="api">App API</H2>
            <p>
              Standard chat completions, so any SDK or plain HTTP works. Base URL <C>{api}</C>, model <C>n-atlas-8b</C>, header{" "}
              <C>authorization: Bearer &lt;key&gt;</C>. Streaming supported.
            </p>
            <CodeTabs items={appSnippets(api)} />
            <p>
              Set the reply language in a system message. Responses carry <C>x-atlas-request-id</C> and the exact model revision in <C>x-atlas-weights</C>.
              Call from your server; never ship the key to a browser.
            </p>

            <H2 id="errors">Errors and limits</H2>
            <p>
              Errors look like <C>{'{ "error": { "code", "message", "retryable", "retry_after_s", "request_id" } }'}</C>. Retry only when{" "}
              <C>retryable</C> is true. N-ATLaS sleeps after 40 idle minutes; the next request wakes it (about 4 minutes) and gets{" "}
              <C>BACKEND_WARMING</C> until then. Never fall back to another model.
            </p>
            <Table
              head={["Code", "HTTP", "Retry", "Meaning"]}
              rows={PUBLIC_ERRORS.map(([code, e]) => [<C>{code}</C>, e.status, e.retryable ? "Yes" : "No", e.message])}
            />
            <Table
              head={["Limit", "Value"]}
              rows={[
                ["Requests per project", `${LIMITS.min} per minute, ${LIMITS.day} per day`],
                ["Request body", `${MAX_BODY_BYTES / 1024} KB`],
                ["max_tokens", MAX_TOKENS_CAP],
                ["Context per request", `${MODEL_CARD.context_window_per_request} tokens`],
                ["Timeout", "120 s"],
              ]}
            />

            <H2 id="licence">Licence</H2>
            <p>
              Show <strong>{MODEL_CARD.attribution}</strong> next to N-ATLaS output and include the credit line: {MODEL_CARD.credit_line}
            </p>
            <p>{MODEL_CARD.licence}</p>
          </div>
        </article>
      </div>
      <SiteFooter />
    </>
  );
}
