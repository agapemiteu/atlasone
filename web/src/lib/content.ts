// Page copy and data. Model output shown on the site is verbatim from the live run of 11 Oct 2026
// (atlas-one.log, docs/NATLAS-INTEGRATION.md); nothing here is invented output.

export type Lang = "en" | "ha";

export const REPO = "https://github.com/agapemiteu/atlasone";

export const COPY = {
  en: {
    eyebrow: "The MCP server for N-ATLaS",
    title: "Give your agent Nigerian languages.",
    sub: "Connect Claude Code, Codex, Cursor or any agent. Ask for a Hausa, Igbo or Yoruba feature. It ships tested and verified on genuine N-ATLaS.",
    connect: "Connect your agent",
    docs: "Docs",
    setup: "One URL. Your agent does the rest.",
    setupNote: "Your client opens a sign-in: approve the permissions, sign in with GitHub. Invite-only during the NAIC 2026 beta.",
    perClient: "Command for your client",
    cases: "Ask for features like these",
    live: "Live",
  },
  ha: {
    eyebrow: "Sabar MCP ta N-ATLaS",
    title: "Ba wakilinka harsunan Najeriya.",
    sub: "Haɗa Claude Code, Codex, Cursor ko kowane wakili. Nemi fasali da Hausa, Igbo ko Yarbanci. Za a kawo shi an gwada, an tabbatar da shi da N-ATLaS na gaske.",
    connect: "Haɗa wakilinka",
    docs: "Bayani",
    setup: "Adireshi ɗaya. Wakilinka zai yi sauran.",
    setupNote: "Manhajarka za ta buɗe shiga: amince da izini, shiga da GitHub. Gayyata kawai a lokacin gwajin NAIC 2026.",
    perClient: "Umarni don manhajarka",
    cases: "Nemi fasali kamar waɗannan",
    live: "Kai tsaye",
  },
} as const;

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
