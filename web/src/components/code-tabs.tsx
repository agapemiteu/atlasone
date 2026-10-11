import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "./copy-button";

/** Segmented tabs over code blocks; scrolls sideways on phones instead of wrapping. */
export function CodeTabs({ items }: { items: [string, string][] }) {
  return (
    <Tabs defaultValue={items[0]![0]} className="mt-4 min-w-0">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        <TabsList>
          {items.map(([name]) => (
            <TabsTrigger key={name} value={name}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {items.map(([name, code]) => (
        <TabsContent key={name} value={name} className="relative mt-1 rounded-xl border bg-muted/50">
          <div className="absolute top-2 right-2">
            <CopyButton text={code} />
          </div>
          <pre className="p-4 pr-12 font-mono text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{code}</pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}
