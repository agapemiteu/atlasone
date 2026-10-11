// Minimal server-rendered pages. No scripts except the inline copy button; everything from a client
// or user is escaped (consent pages render attacker-chosen client names).

export const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
:root{--bg:#fbfaf7;--fg:#1c1b19;--muted:#6b675f;--card:#fff;--line:#e6e2d8;--accent:#0b6b3a;--danger:#a32121}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--muted:#a19d93;--card:#1d1c1a;--line:#33312c;--accent:#4cc38a;--danger:#ff7b7b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:620px;margin:0 auto;padding:40px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px}
h1{font-size:1.4rem;margin:0 0 12px}p{margin:10px 0}.muted{color:var(--muted);font-size:.92rem}
.brand{font-weight:600;letter-spacing:.2px;margin-bottom:18px}.brand span{color:var(--accent)}
label.scope{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
label.scope code{font-weight:600}
button{font:inherit;border-radius:8px;border:1px solid var(--line);padding:10px 16px;cursor:pointer;background:var(--card);color:var(--fg)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button.danger{color:var(--danger)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;font-size:.88rem}
.warn{border-left:3px solid var(--danger);padding-left:10px}
table{width:100%;border-collapse:collapse;font-size:.92rem}td,th{text-align:left;padding:8px 4px;border-top:1px solid var(--line)}
`;

const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export function page(title: string, body: string, init: { status?: number; headers?: Headers } = {}): Response {
  const headers = init.headers ?? new Headers();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Atlas One</title><style>${CSS}</style></head>
<body><main><div class="brand">Atlas <span>One</span> <span class="muted">· N-ATLaS, one instruction away</span></div>${body}</main></body></html>`;
  return new Response(html, { status: init.status ?? 200, headers });
}

export function messagePage(title: string, message: string, status = 400): Response {
  return page(title, `<div class="card"><h1>${esc(title)}</h1><p>${esc(message)}</p></div>`, { status });
}

/** Copy-to-clipboard for a secret shown once. */
export function secretBlock(id: string, value: string): string {
  return `<pre id="${esc(id)}">${esc(value)}</pre><button type="button" onclick="navigator.clipboard.writeText(document.getElementById('${esc(id)}').textContent)">Copy</button>`;
}
