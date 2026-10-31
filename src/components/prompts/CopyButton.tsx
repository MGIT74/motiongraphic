"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface CopyButtonProps {
  text: string;
  label?: string;
  variant?: "primary" | "outline" | "ghost";
  className?: string;
  animationId?: string;
  promptType?: "web" | "after_effects";
}

/**
 * Bouton de copie avec confirmation visuelle et gestion des erreurs
 * (Clipboard API + fallback, voir src/lib/clipboard.ts).
 */
export default function CopyButton({
  text,
  label = "Copier",
  variant = "primary",
  className = "",
  animationId,
  promptType,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  const handleClick = async () => {
    const ok = await copyToClipboard(text);
    setState(ok ? "done" : "error");
    if (ok && animationId && promptType) {
      const client = createSupabaseBrowserClient();
      if (client) void client.from("template_events").insert({ animation_id: animationId, event_type: "prompt_copy", prompt_type: promptType });
    }
    setTimeout(() => setState("idle"), 2200);
  };

  const base =
    "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-accent cursor-pointer disabled:opacity-60";
  const style =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent/85 hover:shadow-[0_8px_30px_-10px_rgba(10,132,255,0.5)]"
      : variant === "outline"
        ? "border border-line bg-surface/40 text-ink hover:border-accent/60 hover:bg-surface"
        : "text-muted hover:text-ink";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${base} ${style} ${className}`}
      aria-live="polite"
    >
      {state === "done" ? (
        <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
      ) : state === "error" ? (
        <TriangleAlert className="h-4 w-4 text-red-400" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      <span>
        {state === "done"
          ? "Prompt copié !"
          : state === "error"
            ? "Échec de la copie"
            : label}
      </span>
    </button>
  );
}