# Atlas One recipe: N-ATLaS from any stack

Atlas One speaks the OpenAI Chat Completions API. Any server-side code with an OpenAI client or an
HTTP library can call genuine N-ATLaS. For Next.js, use the `nextjs` recipe instead.

## Rules

- Call from server-side code only; keep the key in server environment variables, never in a browser
  bundle or a committed file.
- Never invent or simulate N-ATLaS output. On failure, surface the error code and request id.
- Show "Powered by Awarri" wherever N-ATLaS output appears.
- Always set a system message naming the reply language (English, Hausa, Igbo or Yoruba).

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
