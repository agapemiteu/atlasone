// Minimal server-rendered pages. No scripts except the inline copy button; everything from a client
// or user is escaped (consent pages render attacker-chosen client names).

export const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
:root{--bg:#fff;--fg:#0a0a0a;--muted:#6b6f76;--card:#fff;--line:#e8e8ea;--accent:#16794a;--danger:#c0262d;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 "Geist Variable",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:620px;margin:0 auto;padding:40px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
h1{font-size:1.45rem;letter-spacing:-.02em;margin:0 0 12px}p{margin:10px 0}.muted{color:var(--muted);font-size:.92rem}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;letter-spacing:-.01em;color:inherit;text-decoration:none}
.top nav{display:flex;gap:16px;font-size:.92rem}@media(max-width:480px){.top nav{gap:12px;font-size:.85rem}}.top nav a{color:var(--muted);text-decoration:none}.top nav a:hover{color:var(--fg)}
label.scope{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
label.scope code{font-weight:600}
button{font:inherit;border-radius:8px;border:1px solid var(--line);padding:10px 16px;cursor:pointer;background:var(--card);color:var(--fg)}
button.primary{background:var(--fg);border-color:var(--fg);color:#fff}button.danger{color:var(--danger)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
pre{background:#f7f7f8;border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;font-size:.88rem}
.warn{border-left:3px solid var(--danger);padding-left:10px}
table{width:100%;border-collapse:collapse;font-size:.92rem}td,th{text-align:left;padding:8px 4px;border-top:1px solid var(--line)}
`;

const LOGO = `<a class="brand" href="/"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#0a0a0a"/><path d="M7 17 12 6l5 11M9.2 13h5.6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Atlas One</a>`;

const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export function page(title: string, body: string, init: { status?: number; headers?: Headers } = {}): Response {
  const headers = init.headers ?? new Headers();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Atlas One</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>${CSS}</style></head>
<body><main><div class="top">${LOGO}<nav aria-label="Site"><a href="/guide">Guide</a><a href="/docs">Docs</a><a href="/evidence">Evidence</a><a href="/access">Access</a></nav></div>${body}</main></body></html>`;
  return new Response(html, { status: init.status ?? 200, headers });
}

export function messagePage(title: string, message: string, status = 400): Response {
  return page(title, `<div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p></div>`, { status });
}

/** Copy-to-clipboard for a secret shown once. */
export function secretBlock(id: string, value: string, label = "Copy"): string {
  return `<pre id="${esc(id)}">${esc(value)}</pre><button type="button" class="primary" onclick="navigator.clipboard.writeText(document.getElementById('${esc(id)}').textContent).then(()=>{this.textContent='Copied'})">${esc(label)}</button>`;
}
