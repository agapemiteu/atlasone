// Page copy and data. Model output shown on the site is verbatim from the live run of 11 Oct 2026
// (atlas-one.log, docs/EVIDENCE.md); nothing here is invented output.

export type Lang = "en" | "ha";

export const REPO = "https://github.com/agapemiteu/atlasone";

export const COPY = {
  en: {
    eyebrow: "The gateway to Nigeria's AI",
    title: "Connect the world to N-ATLaS.",
    sub: "Atlas One is the MCP server that lets every agent build with N-ATLaS: one URL, real model, verified results.",
    connect: "Start building",
    docs: "Read the docs",
    setup: "Start in 60 seconds.",
    newbie: "New to coding agents?",
    guide: "Follow the beginner's guide",
    steps: [
      ["Add Atlas One to your agent", "Run the command for your agent, or paste the URL into any MCP client."],
      ["Sign in with GitHub", "Your agent opens the browser. Approve, sign in, done. Free during the beta."],
      ["Ask for a feature", "Paste this into your agent, inside your app's folder."],
    ],
    cases: "What will you ship?",
    live: "Real model. Real numbers.",
  },
  ha: {
    eyebrow: "Ƙofar AI na Najeriya",
    title: "Haɗa duniya da N-ATLaS.",
    sub: "Atlas One sabar MCP ce da ke bai wa kowane wakili damar gina da N-ATLaS: adireshi ɗaya, ainihin samfuri, sakamakon da aka tabbatar.",
    connect: "Fara ginawa",
    docs: "Karanta bayani",
    setup: "Fara cikin daƙiƙa 60.",
    newbie: "Sabo ga wakilan coding?",
    guide: "Bi jagorar farawa",
    steps: [
      ["Ƙara Atlas One ga wakilinka", "Gudanar da umarnin wakilinka, ko liƙa adireshin a kowane MCP client."],
      ["Shiga da GitHub", "Wakilinka zai buɗe burauza. Amince, shiga, shi ke nan. Kyauta a lokacin gwaji."],
      ["Nemi fasali", "Liƙa wannan a wakilinka, a cikin fayil ɗin manhajarka."],
    ],
    cases: "Me za ka gina?",
    live: "Ainihin samfuri. Ainihin lambobi.",
  },
} as const;

/** One-click starter app for testers: zero dependencies, a GitHub template. */
export const STARTER_REPO = "https://github.com/agapemiteu/atlas-one-starter";

const VERIFY = "using N-ATLaS through Atlas One. Keep the key server-side, then test and verify it.";

/** Ideas for testers. Each works in the starter shop (shop.json holds its facts) or any app, and ends verified. */
export const IDEAS: { title: string; line: string; prompt: string }[] = [
  {
    title: "Customer support in Hausa",
    line: "Answers shoppers' questions from the shop's own facts.",
    prompt: `Add a customer-support chat to this shop that answers in Hausa only from the facts in shop.json (and says it doesn't know otherwise), ${VERIFY}`,
  },
  {
    title: "One page, three languages",
    line: "A language switch for the shop's questions and answers.",
    prompt: `Add a language switch (Hausa, Igbo, Yoruba) that shows the shop's delivery, payment and returns information in the chosen language, ${VERIFY}`,
  },
  {
    title: "Yoruba product descriptions",
    line: "Warm, short descriptions for every product.",
    prompt: `Add a button that writes a short, warm Yoruba description for each product in shop.json, ${VERIFY}`,
  },
  {
    title: "Explain it in Igbo",
    line: "Turns a confusing English message into simple Igbo.",
    prompt: `Add a page where someone pastes an English message, like a bank alert or an official notice, and gets a simple explanation in Igbo, ${VERIFY}`,
  },
  {
    title: "An order-tracking agent",
    line: "Function calling: N-ATLaS calls your code, then answers.",
    prompt: `Add a few sample orders and an order-tracking assistant that uses N-ATLaS function calling to look an order up, then replies in the customer's language (Hausa, Igbo or Yoruba), ${VERIFY}`,
  },
  {
    title: "Reviews to data",
    line: "Structured output: any of four languages in, JSON out.",
    prompt: `Add an endpoint that turns a customer review in Hausa, Igbo or Yoruba into JSON (sentiment, product, English summary) with N-ATLaS structured output, ${VERIFY}`,
  },
];

/** First prompt for a new developer: works in any app, any stack, and ends with verification. */
export const STARTER_PROMPT =
  "Use Atlas One to add an N-ATLaS feature to this app: an endpoint that answers customer questions in Hausa. Keep the key server-side, then test and verify it.";

export const DEMO = {
  instruction: "Add a Hausa customer-support route powered by N-ATLaS, and test it.",
  question: "Kuna kai kaya zuwa Abuja? Kuma za a iya biya idan an kawo?",
  answer:
    "Eh, muna bayar da isarwa ga dukkan jihohi 36 cikin sa'o'i uku zuwa biyar na aiki. Don biyan kuɗi akan isarwa, " +
    'don Allah a tabbata kun zaɓi "Biya Lokacin Karɓa" a matsayin hanyar biyan kuɗi lokacin yin odar ku ta kan layi.',
  steps: [
    ["Read the N-ATLaS guide", "Picked the Next.js recipe"],
    ["Created your project", "You approved the key in your browser"],
    ["Wrote the support route", "5 files, key kept on the server"],
    ["Tested N-ATLaS", "Answered in Hausa in 1.1 s"],
    ["Verified your app", "Your route reached genuine N-ATLaS"],
  ] as [string, string][],
};

export const USE_CASES: { icon: "chat" | "agent" | "data"; title: string; line: string; ask: string }[] = [
  {
    icon: "chat",
    title: "Support in Hausa",
    line: "Answers from your own FAQ. Built and verified live, as above.",
    ask: DEMO.instruction,
  },
  {
    icon: "agent",
    title: "Agents that act",
    line: "Function calling: N-ATLaS calls your code to check orders or book deliveries, then replies in the customer's language.",
    ask: "Add an order-tracking assistant that uses N-ATLaS function calling to call our order lookup, replies in Yoruba or Igbo, and verify it.",
  },
  {
    icon: "data",
    title: "Text to data",
    line: "Structured output: reviews and messages in four languages become JSON your code can trust.",
    ask: "Classify incoming Hausa, Igbo and Yoruba reviews into JSON (sentiment, topic, English summary) with N-ATLaS structured output, and verify it.",
  },
];

export const CLIENTS = ["Claude Code", "Codex", "Cursor", "VS Code", "Windsurf", "Gemini CLI", "Any MCP client"] as const;

export function clientSnippets(mcp: string): [string, string][] {
  return [
    ["Claude Code", `claude mcp add --transport http atlas-one ${mcp}`],
    ["Codex", `codex mcp add atlas-one --url ${mcp}`],
    ["Cursor", `{ "mcpServers": { "atlas-one": { "url": "${mcp}" } } }`],
    ["VS Code", `{ "servers": { "atlas-one": { "type": "http", "url": "${mcp}" } } }`],
    ["Windsurf", `{ "mcpServers": { "atlas-one": { "serverUrl": "${mcp}" } } }`],
    ["Gemini CLI", `{ "mcpServers": { "atlas-one": { "httpUrl": "${mcp}" } } }`],
    ["Other", `Add a remote (Streamable HTTP) MCP server:\n${mcp}`],
  ];
}

export function appSnippets(api: string): [string, string][] {
  return [
    [
      "curl",
      `curl ${api}/chat/completions \\
  -H "authorization: Bearer $ATLAS_ONE_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"model":"n-atlas-8b","messages":[
        {"role":"system","content":"Reply in Hausa."},
        {"role":"user","content":"Menene babban birnin Najeriya?"}]}'`,
    ],
    [
      "TypeScript",
      `import OpenAI from "openai";

const atlas = new OpenAI({ baseURL: "${api}", apiKey: process.env.ATLAS_ONE_API_KEY });
const r = await atlas.chat.completions.create({
  model: "n-atlas-8b",
  messages: [{ role: "system", content: "Reply in Yoruba." }, { role: "user", content: question }],
});`,
    ],
    [
      "Python",
      `import os
from openai import OpenAI

atlas = OpenAI(base_url="${api}", api_key=os.environ["ATLAS_ONE_API_KEY"])
r = atlas.chat.completions.create(
    model="n-atlas-8b",
    messages=[{"role": "system", "content": "Reply in Igbo."}, {"role": "user", "content": question}],
)`,
    ],
  ];
}

export function langFromSearch(search: string): Lang {
  return new URLSearchParams(search).get("lang") === "ha" ? "ha" : "en";
}

/** Structured output and function calling, both checked on the live model (atlas-one.log, 2026-10-12). */
export function capabilitySnippets(api: string): [string, string][] {
  return [
    [
      "Structured output",
      `const res = await fetch("${api}/chat/completions", {
  method: "POST",
  headers: { authorization: \`Bearer \${process.env.ATLAS_ONE_API_KEY}\`, "content-type": "application/json" },
  body: JSON.stringify({
    model: "n-atlas-8b",
    messages: [
      { role: "system", content: "Classify the customer review." },
      { role: "user", content: "Kayan nan ba su da kyau ko kadan." },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "review",
        schema: {
          type: "object",
          properties: { sentiment: { enum: ["positive", "negative", "neutral"] }, english: { type: "string" } },
          required: ["sentiment", "english"],
        },
      },
    },
  }),
});
const review = JSON.parse((await res.json()).choices[0].message.content);`,
    ],
    [
      "Function calling",
      `const tools = [{
  type: "function",
  function: {
    name: "track_order",
    description: "Look up an order by id",
    parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
  },
}];
// 1. The model asks for a tool: message.tool_calls = [{ id, function: { name: "track_order", arguments } }]
// 2. Run it yourself, then send the result back:
messages.push(message, { role: "tool", tool_call_id: message.tool_calls[0].id, content: JSON.stringify(order) });
// 3. Call again with the same tools: the model answers in the user's language.`,
    ],
  ];
}
