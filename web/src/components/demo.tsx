import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DEMO } from "@/lib/content";
import { Icon } from "./icon";

type StepState = "idle" | "run" | "done";

interface Frame {
  typed: number;
  steps: StepState[];
  app: boolean;
  scanned: number;
  pressed: boolean;
  thinking: boolean;
  fields: number;
  words: number;
  verified: boolean;
}

const FIELDS = Object.entries(DEMO.data);
const WORDS = DEMO.hausa.split(" ");
const START: Frame = { typed: 0, steps: DEMO.steps.map(() => "idle"), app: false, scanned: 0, pressed: false, thinking: false, fields: 0, words: 0, verified: false };
const END: Frame = {
  typed: DEMO.instruction.length,
  steps: DEMO.steps.map(() => "done"),
  app: true,
  scanned: DEMO.label.length,
  pressed: false,
  thinking: false,
  fields: FIELDS.length,
  words: WORDS.length,
  verified: true,
};

/**
 * The agent (left) builds a medicine-label reader; the app (right) turns a real label into dosing data and a
 * Hausa explanation. Output is verbatim from one live run; the replay is sped up and says so below the demo.
 * Plays once when scrolled into view and stays on the final state.
 */
export function Demo({ autoplay = true }: { autoplay?: boolean }) {
  const [f, setF] = useState<Frame>(autoplay ? START : END);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoplay) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setF(END);
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((ok, stop) => setTimeout(() => (cancelled ? stop() : ok()), ms));
    const set = (p: Partial<Frame>) => setF((x) => ({ ...x, ...p }));
    const step = (i: number, s: StepState) => setF((x) => ({ ...x, steps: x.steps.map((v, j) => (j === i ? s : v)) }));

    async function play() {
      await wait(400);
      for (let i = 1; i <= DEMO.instruction.length; i++) set({ typed: i }), await wait(20);
      await wait(400);
      for (const [i, ms] of [[0, 800], [1, 1100], [2, 1400]] as const) step(i, "run"), await wait(ms), step(i, "done");
      set({ app: true });
      await wait(400);
      step(3, "run");
      for (let i = 1; i <= DEMO.label.length; i += 3) set({ scanned: i }), await wait(12);
      set({ scanned: DEMO.label.length });
      await wait(300);
      set({ pressed: true });
      await wait(150);
      set({ pressed: false, thinking: true });
      await wait(1500);
      set({ thinking: false });
      for (let k = 1; k <= FIELDS.length; k++) set({ fields: k }), await wait(170);
      for (let w = 1; w <= WORDS.length; w++) set({ words: w }), await wait(40);
      step(3, "done");
      step(4, "run");
      await wait(700);
      step(4, "done");
      set({ verified: true });
    }

    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          io.disconnect();
          play().catch(() => {});
        }
      },
      { threshold: 0.3 },
    );
    if (root.current) io.observe(root.current);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [autoplay]);

  const typing = f.typed < DEMO.instruction.length;

  return (
    <div
      ref={root}
      className="grid overflow-hidden rounded-2xl border bg-background text-left shadow-[0_1px_2px_rgba(0,0,0,.04),0_32px_64px_-32px_rgba(15,23,42,.25)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
      role="img"
      aria-label="A coding agent builds a medicine-label reader through Atlas One; the app turns a real label into dosing data and a Hausa explanation from genuine N-ATLaS."
    >
      {/* Agent */}
      <div className="flex flex-col border-b bg-muted/30 lg:border-r lg:border-b-0">
        <div className="flex h-10 items-center border-b px-4 text-xs text-muted-foreground">Your coding agent</div>
        <div className="m-4 mb-2 min-h-[84px] rounded-xl border bg-background p-3.5 text-[15px] shadow-xs">
          <div className="mb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">You</div>
          {DEMO.instruction.slice(0, f.typed)}
          {typing && <span className="ml-px inline-block h-[1.1em] w-0.5 translate-y-[3px] animate-pulse bg-foreground" />}
        </div>
        <ol className="grid gap-0.5 px-4 pt-1 pb-5">
          {DEMO.steps.map(([title, detail], i) => {
            const s = f.steps[i];
            return (
              <li key={title} className={cn("flex gap-3 py-2 transition-opacity duration-300", s === "idle" && "opacity-35")}>
                <span
                  className={cn(
                    "relative mt-0.5 size-[18px] shrink-0 rounded-full border-[1.5px] border-muted-foreground/30",
                    s === "run" && "animate-spin border-muted-foreground/20 border-t-success",
                    s === "done" && "border-success bg-success text-white",
                  )}
                >
                  {s === "done" && <Icon name="tick" size={12} className="absolute inset-0 m-auto" />}
                </span>
                <span>
                  <span className="block text-[14.5px] font-medium">{title}</span>
                  <span
                    className={cn(
                      "block overflow-hidden text-[13px] text-muted-foreground transition-[max-height] duration-300",
                      s === "idle" ? "max-h-0" : "max-h-10",
                    )}
                  >
                    {detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* App */}
      <div className="flex flex-col">
        <div className="flex h-10 items-center gap-3 border-b bg-muted/30 px-4">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((k) => (
              <i key={k} className="size-2.5 rounded-full bg-border" />
            ))}
          </span>
          <span className="mx-auto flex h-6 w-full max-w-60 items-center justify-center rounded-md border bg-background font-mono text-xs text-muted-foreground">
            localhost:3000/label
          </span>
          <span className="w-9" />
        </div>
        <div className={cn("relative flex-1 p-5 pb-20 transition-opacity duration-500 sm:p-6 sm:pb-20", f.app ? "opacity-100" : "opacity-40")}>
          <div className="flex items-baseline justify-between border-b pb-3">
            <b className="text-lg tracking-tight">Label reader</b>
            <span className="text-xs text-muted-foreground">Confirm with your pharmacist</span>
          </div>
          <div className="mt-3 rounded-xl border border-dashed bg-muted/40 p-3 font-mono text-[12.5px] leading-relaxed">
            <div className="mb-1 font-sans text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Label</div>
            {DEMO.label.slice(0, f.scanned)}
            {f.scanned === 0 && <span className="text-muted-foreground">Paste or scan a label…</span>}
          </div>
          <div className="mt-3 flex justify-end">
            <span
              className={cn(
                "flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13.5px] font-medium text-primary-foreground transition-transform",
                f.pressed && "scale-95 opacity-80",
              )}
            >
              Karanta da Hausa
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="min-h-24 rounded-xl border bg-background p-3 font-mono text-[12px] leading-relaxed">
              <div className="mb-1 font-sans text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Data</div>
              {f.thinking ? (
                <Dots />
              ) : (
                FIELDS.slice(0, f.fields).map(([k, v]) => (
                  <div key={k} className="animate-in fade-in [overflow-wrap:anywhere]">
                    <span className="text-muted-foreground">{k}:</span> <span className="text-success">{JSON.stringify(v)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="min-h-24 rounded-xl border bg-background p-3 text-[13.5px] leading-relaxed">
              <div className="mb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Hausa</div>
              {WORDS.slice(0, f.words).join(" ")}
              <div className={cn("mt-2 text-xs text-muted-foreground transition-opacity", f.words === WORDS.length ? "opacity-100" : "opacity-0")}>
                Powered by Awarri
              </div>
            </div>
          </div>
          <div
            className={cn(
              "absolute inset-x-5 bottom-5 flex items-center gap-2.5 rounded-xl bg-success-soft px-3.5 py-2.5 text-[13.5px] font-medium text-success transition-all duration-500 sm:inset-x-6",
              f.verified ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
          >
            <Icon name="verified" size={18} />
            Verified: genuine N-ATLaS, data and Hausa in one call
          </div>
        </div>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 150, 300].map((d) => (
        <i key={d} className="size-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
