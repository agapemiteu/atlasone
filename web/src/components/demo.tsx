import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DEMO } from "@/lib/content";
import { Icon } from "./icon";

type StepState = "idle" | "run" | "done";

interface Frame {
  typed: number;
  steps: StepState[];
  ask: boolean;
  q: number;
  pressed: boolean;
  thinking: boolean;
  words: number;
  verified: boolean;
}

const WORDS = DEMO.answer.split(" ");
const START: Frame = { typed: 0, steps: DEMO.steps.map(() => "idle"), ask: false, q: 0, pressed: false, thinking: false, words: 0, verified: false };
const END: Frame = {
  typed: DEMO.instruction.length,
  steps: DEMO.steps.map(() => "done"),
  ask: true,
  q: DEMO.question.length,
  pressed: false,
  thinking: false,
  words: WORDS.length,
  verified: true,
};

/**
 * The agent (left) builds the feature; the app (right) then answers a customer in Hausa. Plays once when
 * scrolled into view and stays on the final state. The test step waits the real 1.1 s inference time.
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
      for (let i = 1; i <= DEMO.instruction.length; i++) set({ typed: i }), await wait(24);
      await wait(400);
      for (const [i, ms] of [[0, 900], [1, 1300], [2, 1600]] as const) step(i, "run"), await wait(ms), step(i, "done");
      set({ ask: true });
      await wait(500);
      step(3, "run");
      await wait(1110);
      step(3, "done");
      step(4, "run");
      await wait(300);
      for (let i = 1; i <= DEMO.question.length; i++) set({ q: i }), await wait(28);
      await wait(250);
      set({ pressed: true });
      await wait(150);
      set({ pressed: false, thinking: true });
      await wait(1300);
      set({ thinking: false });
      for (let w = 1; w <= WORDS.length; w++) set({ words: w }), await wait(45);
      await wait(400);
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
      className="grid overflow-hidden rounded-2xl border bg-background text-left shadow-[0_1px_2px_rgba(0,0,0,.04),0_32px_64px_-32px_rgba(15,23,42,.25)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
      role="img"
      aria-label="A coding agent adds a Hausa support route through Atlas One; the app then answers a customer in Hausa and is verified on N-ATLaS."
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
            localhost:3000
          </span>
          <span className="w-9" />
        </div>
        <div className="relative flex-1 p-5 pb-20 sm:p-7 sm:pb-20">
          <div className="flex items-baseline justify-between border-b pb-3">
            <b className="text-lg tracking-tight">Kano Fabrics</b>
            <span className="text-xs text-muted-foreground">Customer support</span>
          </div>
          <div className="mt-3 grid gap-2.5 text-[13.5px] text-muted-foreground">
            <p>
              <b className="block font-medium text-foreground">Do you deliver outside Kano?</b>Yes. We deliver to all 36 states within 3 to 5 working days.
            </p>
            <p>
              <b className="block font-medium text-foreground">Can I pay on delivery?</b>Pay on delivery is available in Kano, Abuja and Lagos.
            </p>
          </div>
          <div
            className={cn(
              "mt-4 rounded-xl border p-4 shadow-[0_8px_24px_-16px_rgba(0,0,0,.25)] transition-all duration-500",
              f.ask ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
          >
            <div className="text-[13px] font-medium">Tambayi mataimakinmu</div>
            <div className="mt-2.5 flex gap-2">
              <div className="min-h-10 flex-1 rounded-lg border bg-muted/50 px-3 py-2 text-[13.5px]">{DEMO.question.slice(0, f.q)}</div>
              <span
                className={cn(
                  "flex h-10 items-center rounded-lg bg-primary px-3.5 text-[13.5px] font-medium text-primary-foreground transition-transform",
                  f.pressed && "scale-95 opacity-80",
                )}
              >
                Tambaya
              </span>
            </div>
            <div className="mt-3 min-h-6 text-[14px] leading-relaxed">
              {f.thinking ? (
                <span className="inline-flex gap-1">
                  {[0, 150, 300].map((d) => (
                    <i key={d} className="size-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              ) : (
                WORDS.slice(0, f.words).join(" ")
              )}
            </div>
            <div className={cn("mt-2 text-xs text-muted-foreground transition-opacity", f.words === WORDS.length ? "opacity-100" : "opacity-0")}>
              Powered by Awarri
            </div>
          </div>
          <div
            className={cn(
              "absolute inset-x-5 bottom-5 flex items-center gap-2.5 rounded-xl bg-success-soft px-3.5 py-2.5 text-[13.5px] font-medium text-success transition-all duration-500 sm:inset-x-7",
              f.verified ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            )}
          >
            <Icon name="verified" size={18} />
            Verified: this answer came from genuine N-ATLaS
          </div>
        </div>
      </div>
    </div>
  );
}
