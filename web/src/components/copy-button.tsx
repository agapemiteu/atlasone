import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "./icon";

export function CopyButton({ text, label, variant = "ghost" }: { text: string; label?: string; variant?: "ghost" | "default" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      /* clipboard blocked: the text stays selectable */
    }
  };
  return (
    <Button variant={variant} size={label ? "default" : "icon-sm"} onClick={copy} aria-label={label ?? "Copy"}>
      <Icon name={done ? "tick" : "copy"} size={16} />
      {label && <span className="max-sm:hidden">{done ? "Copied" : label}</span>}
    </Button>
  );
}
