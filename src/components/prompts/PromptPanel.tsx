"use client";

import { useState } from "react";
import { Braces, Film, Info } from "lucide-react";
import type { TemplatePrompt } from "@/types/template";
import CopyButton from "./CopyButton";

interface PromptPanelProps {
  prompts: TemplatePrompt[];
}

/**
 * Aperçu + copie des prompts (onglets Web / After Effects).
 */
export default function PromptPanel({ prompts }: PromptPanelProps) {
  const web = prompts.find((p) => p.type === "web");
  const ae = prompts.find((p) => p.type === "after_effects");
  const [tab, setTab] = useState<"web" | "after_effects">(web ? "web" : "after_effects");

  if (!web && !ae) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm text-muted">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        Aucun prompt disponible pour ce template pour le moment.
      </div>
    );
  }

  const active = tab === "web" ? web : ae;

  return (
    <section aria-label="Prompts du template">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line bg-surface/60 p-1" role="tablist" aria-label="Type de prompt">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "web"}
            onClick={() => setTab("web")}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors cursor-pointer ${
              tab === "web" ? "bg-elevated text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Braces className="h-4 w-4" aria-hidden="true" /> Prompt Web
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "after_effects"}
            onClick={() => setTab("after_effects")}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors cursor-pointer ${
              tab === "after_effects" ? "bg-elevated text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <Film className="h-4 w-4" aria-hidden="true" /> Prompt After Effects
          </button>
        </div>
        {active && (
          <CopyButton
            text={active.content}
            label={active.type === "web" ? "Copy Prompt Web" : "Copy Prompt After Effects"}
            variant={active.type === "web" ? "primary" : "outline"}
          />
        )}
      </div>

      <div className="max-h-96 overflow-auto rounded-2xl border border-line bg-surface/60">
        <pre className="px-5 py-4 text-[13px] leading-relaxed text-muted whitespace-pre-wrap">
          {active?.content}
        </pre>
      </div>
      <p className="mt-2 text-xs text-muted">
        Astuce : collez ce prompt dans ChatGPT ou Claude pour générer l’animation complète.
      </p>
    </section>
  );
}