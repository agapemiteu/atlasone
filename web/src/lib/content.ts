// Page copy and data. Model output shown on the site is verbatim from live runs on 12 Oct 2026, with request
// ids in atlas-one.log; nothing here is invented output.

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
    apiOnly: "No agent? Get an API key and call N-ATLaS directly.",
    steps: [
      ["Add Atlas One to your agent", "Run the command for your agent, or paste the URL into any MCP client."],
      ["Sign in with GitHub", "Your agent opens the browser. Approve, sign in, done. Free during the beta."],
      ["Ask for a feature", "Paste this into your agent, inside your app's folder."],
    ],
    showcase: "Try these first.",
    showcaseSub: "Real N-ATLaS output from live runs, unedited. Copy the prompt into your agent.",
    cases: "What will you build?",
    casesSub: "N-ATLaS reads, writes, extracts and acts in English, Hausa, Igbo and Yoruba. Pick an industry, copy the prompt.",
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
    apiOnly: "Ba wakili? Karɓi maɓallin API ka kira N-ATLaS kai tsaye.",
    steps: [
      ["Ƙara Atlas One ga wakilinka", "Gudanar da umarnin wakilinka, ko liƙa adireshin a kowane MCP client."],
      ["Shiga da GitHub", "Wakilinka zai buɗe burauza. Amince, shiga, shi ke nan. Kyauta a lokacin gwaji."],
      ["Nemi fasali", "Liƙa wannan a wakilinka, a cikin fayil ɗin manhajarka."],
    ],
    showcase: "Gwada waɗannan da farko.",
    showcaseSub: "Ainihin amsoshin N-ATLaS daga gwaje-gwaje kai tsaye, ba a gyara ba. Kwafi umarnin cikin wakilinka.",
    cases: "Me za ka gina?",
    casesSub: "N-ATLaS na karantawa, rubutawa, fitar da bayanai da aiki da Turanci, Hausa, Igbo da Yarbanci. Zaɓi fanni, kwafi umarnin.",
    live: "Ainihin samfuri. Ainihin lambobi.",
  },
} as const;

/** One-click starter app for testers: zero dependencies, a GitHub template. */
export const STARTER_REPO = "https://github.com/agapemiteu/atlas-one-starter";

const VERIFY = "using N-ATLaS through Atlas One. Keep the key server-side, then test and verify it.";

/** Ideas for testers. Each works in the starter shop (shop.json holds its facts) or any app, and ends verified. */

/** First prompt for a new developer: any app, any stack, ends with verification. */
export const STARTER_PROMPT =
  "Use Atlas One to add an N-ATLaS feature to this app: a medicine-label reader that returns the dosing as JSON and explains it in Hausa. Keep the key server-side, then test and verify it."

/** The home-page demo: one real run (req_a6cfb6957a9c428d8605d95b, 9.1 s), output verbatim. */
export const DEMO = {
  instruction: "Build a medicine-label reader: dosing as data, explained in Hausa, with N-ATLaS. Test and verify it.",
  label: "Amoxicillin 500 mg capsules. Take 1 capsule three times daily for 7 days, after food. Complete the full course even if you feel better. Do not use if allergic to penicillin.",
  /** The model's JSON, as returned (structured output), without the hausa field shown below it. */
  data: {"medicine": "amoxicillin", "dose": "500 mg", "times_per_day": 3, "days": 7, "after_food": true, "warning": "do_not_use_if_allergic_to_penicillin"} as Record<string, string | number | boolean>,
  hausa: "Amoxicillin 500 mg capsules. Ka sha kwaya daya sau uku a rana na tsawon kwanaki 7, bayan cin abinci. Kammala dukkanin magani ko da ka ji lafiya. Kar a yi amfani da shi idan kana da rashin lafiyar penicillin.",
  seconds: 9.1,
  steps: [
    ["Read the N-ATLaS guide", "Chose structured output, reply in Hausa"],
    ["Created your project", "You approved the key in your browser"],
    ["Wrote the label route", "JSON schema for the dose, key kept on the server"],
    ["Tested N-ATLaS", "Real answer in 9.1 s"],
    ["Verified your app", "Your route reached genuine N-ATLaS"],
  ] as [string, string][],
};

/** Three to try first: each output is verbatim from a live run (request ids in atlas-one.log, 12 Oct 2026). */
export const SHOWCASE: { title: string; tags: string[]; input: string; output: string; prompt: string }[] = [
  {
    title: "Medicine label reader",
    tags: ["Health", "Structured output", "Hausa"],
    input: "Amoxicillin 500 mg capsules. Take 1 capsule three times daily for 7 days, after food. Complete the full course even if you feel better. Do not use if allergic to penicillin.",
    output: "{\"times_per_day\": 3, \"days\": 7, \"after_food\": true}  Ka sha kwaya daya sau uku a rana na tsawon kwanaki 7, bayan cin abinci.",
    prompt: `Build a medicine-label reader: paste a label, get the dosing as JSON (medicine, dose, times per day, days, after food, warning) and a plain Hausa explanation, with N-ATLaS structured output. Remind users to confirm with a pharmacist. ${VERIFY}`,
  },
  {
    title: "Lesson and quiz",
    tags: ["Education", "Structured output", "Igbo"],
    input: "Topic: why we wash our hands before eating.",
    output: "Gịnị kpatara na ọ dị mkpa ka a saa aka gị tupu iri nri?  Ịsa aka gị tupu iri nri na-enyere aka iwepụ nje bacteria ndị nwere ike ime ka ahụ́ ghara iru ala ma ọ bụ bute ọrịa.",
    prompt: `Build a homework helper: a topic in, a short explanation for a 10-year-old in Igbo plus a quiz as JSON (questions and answers), with N-ATLaS structured output. ${VERIFY}`,
  },
  {
    title: "Order-tracking agent",
    tags: ["Commerce", "Function calling", "Hausa"],
    input: "Ina odar lamba KF-1042 take yanzu?",
    output: 'track_order({"order_id": "KF-1042"})  →  Amsar ta dawo da matsayin odar KF-1042, wanda aka aika.',
    prompt: `Build an order-tracking assistant with a few sample orders: N-ATLaS function calling decides when to call track_order, then replies in the customer's language (Hausa, Igbo or Yoruba). ${VERIFY}`,
  },
];

/** Ideas by industry: what each one uses. Prompts only; no output is claimed here. */
export const DOMAINS: { title: string; line: string; uses: string; prompt: string }[] = [
  { title: "Health", uses: "Structured output", line: "Prescriptions and drug labels explained in the patient's language, with dosing as data.", prompt: `Build a prescription explainer that turns a doctor's prescription into a dosing schedule (JSON) and a plain explanation in Yoruba. ${VERIFY}` },
  { title: "Security", uses: "Structured output", line: "A scam-SMS shield: flags fake BVN and OTP messages and warns the user in Igbo.", prompt: `Build a scam-SMS checker: paste a message, get JSON (is_scam, risk, red_flags) and a warning in Igbo. ${VERIFY}` },
  { title: "Education", uses: "Structured output", line: "Lessons, quizzes and homework help in a child's own language.", prompt: `Build a quiz maker that writes five questions with answers in Hausa for any primary-school topic, as JSON. ${VERIFY}` },
  { title: "Commerce", uses: "Function calling", line: "Agents that check orders and book deliveries, then reply in the customer's language.", prompt: `Build a delivery-booking agent that calls book_delivery and check_stock functions and confirms in Yoruba. ${VERIFY}` },
  { title: "Gaming", uses: "Function calling", line: "Characters that speak Hausa, Igbo or Yoruba and act through your game's functions.", prompt: `Build a market-trader game character who bargains in Yoruba and calls give_item and set_price functions. ${VERIFY}` },
  { title: "Press and news", uses: "Streaming", line: "Hausa radio bulletins from English wire copy, streamed as they are written.", prompt: `Build a newsroom tool that rewrites an English news story as a two-sentence Hausa radio bulletin, streamed. ${VERIFY}` },
  { title: "Sports", uses: "Streaming", line: "Match events turned into live commentary in Yoruba or Hausa.", prompt: `Build a live-commentary feed: match events (JSON) in, one excited commentary line in Hausa out, streamed. ${VERIFY}` },
  { title: "Entertainment", uses: "Structured output", line: "Subtitle files for films and skits, translated line by line.", prompt: `Build a subtitle translator: upload an English .srt file, get it back in Igbo with the timings untouched, using structured output per line. ${VERIFY}` },
  { title: "Daily stories", uses: "Chat", line: "A bedtime story each night in a child's language, with a small lesson.", prompt: `Build a bedtime-story page: pick a language and an animal, get a four-sentence story with a lesson. ${VERIFY}` },
  { title: "Tourism", uses: "Chat", line: "Guides for Kano, Lagos and Enugu that speak the visitor's language.", prompt: `Build a city-guide chat for Kano that answers visitors in Hausa or English from a short list of places you provide. ${VERIFY}` },
  { title: "Finance", uses: "Chat", line: "Bank alerts, fees and loan terms explained simply.", prompt: `Build a bank-alert explainer: paste an alert or loan terms, get a simple explanation in Yoruba. ${VERIFY}` },
  { title: "Farming", uses: "Grounded answers", line: "Advice from your own crop guide, for farmers in Hausa.", prompt: `Build a farmer helpline that answers in Hausa only from a maize guide you add, and says it doesn't know otherwise. ${VERIFY}` },
];

export const IDEAS: { title: string; line: string; prompt: string }[] = [
  ...SHOWCASE.map((x) => ({ title: x.title, line: x.tags.join(" · "), prompt: x.prompt })),
  {
    title: "Customer support in Hausa",
    line: "Grounded answers · Hausa",
    prompt: `Add a customer-support chat to this shop that answers in Hausa only from the facts in shop.json (and says it doesn't know otherwise), ${VERIFY}`,
  },
  ...DOMAINS.filter((d) => ["Security", "Press and news"].includes(d.title)).map((d) => ({ title: d.title, line: `${d.uses} · ${d.line}`, prompt: d.prompt })),
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
