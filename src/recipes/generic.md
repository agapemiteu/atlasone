# Atlas One recipe: N-ATLaS from any stack

Atlas One speaks the industry-standard Chat Completions API (the OpenAI-compatible format that most
model servers and AI frameworks use). Any server-side code with an HTTP library, an OpenAI-compatible
client, or an AI framework can call genuine N-ATLaS; nothing is tied to OpenAI the company. For Next.js,
use the `nextjs` recipe instead.

## Rules

- Call from server-side code only; keep the key in server environment variables, never in a browser
  bundle or a committed file.
- Never invent or simulate N-ATLaS output. On failure, surface the error code and request id.
- Show "Powered by Awarri" wherever N-ATLaS output appears, and in public apps the credit line
  "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy,
  and powered by Awarri Technologies." N-ATLaS terms: at most 1,000 active end users per 30 days;
  commercial or large-scale use needs a licence from Awarri.
- Atlas One already applies the model-card settings (repetition penalty, low default temperature,
  current date); you only choose the language in the system message.
- Always set a system message naming the reply language (English, Hausa, Igbo or Yoruba).
- Answering from your own facts (support, FAQs): put the facts in the system message, keep each answer to one
  question, and add "If the facts do not answer it, say you do not know and give the contact." Re-state the reply
  language at the end of the system message; a user asking for another language can otherwise switch it.
  Check a few real questions yourself: `verified: true` proves genuine N-ATLaS use, not that answers are right.

Environment:

```
ATLAS_ONE_BASE_URL={{BASE_URL}}
ATLAS_ONE_API_KEY=<project key from atlas_bind_project's claim link>
```

Model id: `n-atlas-8b`. Limits: max_tokens up to 1024, 4096 tokens of context per request, 64 KB body.

## Node.js / TypeScript (Express, Hono, Fastify, ...)

```ts
import OpenAI from "openai";

const atlas = new OpenAI({ baseURL: process.env.ATLAS_ONE_BASE_URL, apiKey: process.env.ATLAS_ONE_API_KEY });

export async function askHausa(question: string, verify?: string) {
  const { data, response } = await atlas.chat.completions
    .create(
      {
        model: "n-atlas-8b",
        messages: [
          { role: "system", content: "Reply in Hausa." },
          { role: "user", content: question },
        ],
        max_tokens: 400,
      },
      verify ? { headers: { "x-atlas-verify": verify } } : undefined,
    )
    .withResponse();
  return { answer: data.choices[0]?.message?.content ?? "", requestId: response.headers.get("x-atlas-request-id") };
}
```

## Python (FastAPI, Django, Flask, ...)

```python
import os
from openai import OpenAI

atlas = OpenAI(base_url=os.environ["ATLAS_ONE_BASE_URL"], api_key=os.environ["ATLAS_ONE_API_KEY"])

def ask_yoruba(question: str, verify: str | None = None) -> str:
    completion = atlas.chat.completions.create(
        model="n-atlas-8b",
        messages=[{"role": "system", "content": "Reply in Yoruba."}, {"role": "user", "content": question}],
        max_tokens=400,
        extra_headers={"x-atlas-verify": verify} if verify else None,
    )
    return completion.choices[0].message.content
```

`requests` and `httpx` also work. If you use Python's built-in `urllib`, set a `User-Agent` header:
Cloudflare rejects urllib's default one (error 1010).

## AI frameworks

Vercel AI SDK (any JS runtime):

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const atlas = createOpenAICompatible({
  name: "atlas-one",
  baseURL: process.env.ATLAS_ONE_BASE_URL!,
  apiKey: process.env.ATLAS_ONE_API_KEY,
});
const { text } = await generateText({ model: atlas("n-atlas-8b"), system: "Reply in Igbo.", prompt: "Kedu ka i mere?" });
```

LangChain (Python):

```python
from langchain_openai import ChatOpenAI
llm = ChatOpenAI(model="n-atlas-8b", base_url=os.environ["ATLAS_ONE_BASE_URL"], api_key=os.environ["ATLAS_ONE_API_KEY"])
```

## curl

```
curl -s "$ATLAS_ONE_BASE_URL/chat/completions" \
  -H "authorization: Bearer $ATLAS_ONE_API_KEY" -H "content-type: application/json" \
  -d '{"model":"n-atlas-8b","messages":[{"role":"system","content":"Reply in Igbo."},{"role":"user","content":"Kedu isi obodo Naijiria?"}],"max_tokens":100}'
```

## Verify

Same as the Next.js recipe: `atlas_test` (inference), `atlas_test` (issue_app_nonce), call your new
endpoint with header `x-atlas-verify: <nonce>` forwarded to Atlas One, then `atlas_test` (verify_app).
Report success only when `verified: true`.

Errors use the OpenAI envelope `{ "error": { "code", "message", "retryable", "retry_after_s", "request_id" } }`.
Retry only when `retryable` is true, after `retry_after_s`.

## Deploy

The same base URL and key work in production; nothing changes but where the two variables live.

1. Add `ATLAS_ONE_BASE_URL` and `ATLAS_ONE_API_KEY` as server-side environment variables on the host (Vercel,
   Netlify, Render, Railway, Fly.io, Cloudflare, a VPS). Never prefix them for the browser (`NEXT_PUBLIC_`, `VITE_`).
2. Deploy, then verify the live URL the same way: `issue_app_nonce`, call the deployed route with `x-atlas-verify`,
   `verify_app`. `verified: true` now proves production reaches genuine N-ATLaS.
3. Handle `BACKEND_WARMING` and `RATE_LIMITED` in the product: show "starting up, try again shortly" using
   `retry_after_s`; never substitute another model's answer.
4. Keep the attribution and credit line visible. Rotate a leaked key with `atlas_bind_project` (`rotate_key`) and
   watch errors and latency with `atlas_inspect`.
