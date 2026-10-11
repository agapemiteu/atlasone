# Atlas One recipe: N-ATLaS in a Next.js (App Router) app

Goal: add a server-side route that calls genuine N-ATLaS through Atlas One, then prove it works.
Follow the steps in order. Ask the developer before editing env files or installing packages.

## Rules (do not skip)

- Server-side only. The key must never reach the browser: no `NEXT_PUBLIC_` prefix, no client
  components importing the client, no key in committed files.
- Never invent or simulate N-ATLaS output. If a call fails, report the error code and request id.
- Show the attribution "Powered by Awarri" wherever N-ATLaS output appears in the UI.
- Always set a system message naming the reply language. N-ATLaS answers in the language you ask
  for; without it, it may reply in English or misjudge the language.

## 1. Environment

Add to `.env.local` (create it if missing; confirm it is in `.gitignore`):

```
ATLAS_ONE_BASE_URL={{BASE_URL}}
ATLAS_ONE_API_KEY=<project key from atlas_bind_project's claim link>
```

Add the same names with empty values to `.env.example` so teammates know they exist. Projects made
with `create-next-app` ignore every `.env*` file, so also add `!.env.example` to `.gitignore`, then
check `git check-ignore .env.local` still reports it as ignored.

## 2. Dependency

```
npm install openai
```

## 3. Server client: `lib/atlas.ts`

```ts
import "server-only";
import OpenAI from "openai";

export const atlas = new OpenAI({
  baseURL: process.env.ATLAS_ONE_BASE_URL,
  apiKey: process.env.ATLAS_ONE_API_KEY,
  maxRetries: 1,
  timeout: 60_000,
});

export const N_ATLAS = "n-atlas-8b";
```

If `server-only` is not installed, run `npm install server-only` (it makes a client import fail at build time).

## 4. Route: `app/api/<feature>/route.ts`

Adapt the system prompt and input to the feature you were asked to build. Keep the header
forwarding: it lets `atlas_test` prove this exact route reached N-ATLaS.

```ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { atlas, N_ATLAS } from "@/lib/atlas";

const SYSTEM = "You are a helpful customer-support assistant. Reply in Hausa.";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 4000) {
    return NextResponse.json({ error: "question must be 1-4000 characters" }, { status: 400 });
  }

  const verify = req.headers.get("x-atlas-verify");
  try {
    const { data, response } = await atlas.chat.completions
      .create(
        {
          model: N_ATLAS,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: question },
          ],
          max_tokens: 400,
          temperature: 0.3,
        },
        verify ? { headers: { "x-atlas-verify": verify } } : undefined,
      )
      .withResponse();

    return NextResponse.json({
      answer: data.choices[0]?.message?.content ?? "",
      attribution: "Powered by Awarri",
      request_id: response.headers.get("x-atlas-request-id"),
    });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const code = (err.error as { code?: string } | undefined)?.code ?? "UPSTREAM_ERROR";
      const status = err.status && err.status >= 500 ? 503 : (err.status ?? 502);
      return NextResponse.json({ error: code, request_id: err.headers?.get?.("x-atlas-request-id") }, { status });
    }
    throw err;
  }
}
```

Streaming is supported (`stream: true`); add it only if the feature needs incremental output.

## 5. Verify (required before reporting success)

1. `atlas_test` with `action: "inference"`: confirms the project key path reaches genuine N-ATLaS.
2. `atlas_test` with `action: "issue_app_nonce"`: returns a one-time nonce.
3. Start the app (`npm run dev`) and call the new route with the nonce:
   ```
   curl -s -X POST http://localhost:3000/api/<feature> \
     -H "content-type: application/json" -H "x-atlas-verify: <nonce>" \
     -d '{"question":"<a real question in the target language>"}'
   ```
   Check the JSON has a non-empty `answer`.
4. `atlas_test` with `action: "verify_app"` and the nonce: must return `verified: true`.

Only if all four pass, report: files changed, model `n-atlas-8b` with its weights revision, request
ids, latency, and the answer excerpt. If any step fails, report the failure and do not claim success.

## Errors you may see

| Code | Meaning | What to do |
|---|---|---|
| MODEL_OFFLINE | No N-ATLaS backend is running (free GPU outside its window) | Tell the developer; retry later. Do not fake output. |
| BACKEND_WARMING | Backend is loading the model | Retry after `retry_after_s` |
| BACKEND_BUSY / RATE_LIMITED | Capacity or project quota reached | Retry after `retry_after_s` |
| INVALID_KEY / KEY_REVOKED | Wrong or revoked project key | Get a new key via `atlas_bind_project` |
| VALIDATION_FAILED | Request rejected (e.g. too long, wrong model name) | Fix the request |
