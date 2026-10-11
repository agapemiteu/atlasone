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
    prompt: `Add a customer-support chat to this shop that answers questions in Hausa from the facts in shop.json, ${VERIFY}`,
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
    title: "Delivery updates in the customer's language",
    line: "Order messages in Hausa, Igbo or Yoruba.",
    prompt: `Add an endpoint that writes a friendly order-delivery message in the customer's language (Hausa, Igbo or Yoruba), ${VERIFY}`,
  },
  {
    title: "Farm advice in Hausa",
    line: "A chat that answers farmers from a short crop guide.",
    prompt: `Add a short maize-farming guide to this project and a Hausa chat that answers farmers' questions from it, ${VERIFY}`,
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

export const USE_CASES: { icon: "chat" | "translate" | "plant"; title: string; line: string; ask: string }[] = [
  {
    icon: "chat",
    title: "Support in Hausa",
    line: "Answers from your own FAQ. Built and verified live, as above.",
    ask: DEMO.instruction,
  },
  {
    icon: "translate",
    title: "Order updates in Yoruba and Igbo",
    line: "Notifications in each customer's language.",
    ask: "Rewrite our order-status messages in Yoruba or Igbo with N-ATLaS, based on the customer's language setting, and test it.",
  },
  {
    icon: "plant",
    title: "Farm advice in Igbo",
    line: "A chat that explains your guides.",
    ask: "Add an Igbo chat endpoint that answers farmers' questions from our crop guide, powered by N-ATLaS, and verify it.",
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
