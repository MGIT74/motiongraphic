"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Wand2 } from "lucide-react";
import type { AnimationConfig } from "@/types/animation";
import AnimationPlayer from "@/components/animations/AnimationPlayer";
import type { ComponentKey } from "@/types/animation";
import SandboxPreview, { type AnimationConfigLite } from "./SandboxPreview";

/**
 * Contrôles visiteur d'une fiche template : modification du texte,
 * couleurs, vitesse / durée, relance, restauration par défaut.
 * - Templates « composant » : l'aperçu React se re-rend instantanément.
 * - Templates « code » : la config est envoyée au bac à sable isolé
 *   (postMessage, aucune modification du code possible par le visiteur).
 */
export default function TemplateDemoControls({
  templateKey,
  defaultConfig,
  sourceCode,
  configFromTemplate,
}: {
  /** Clé du composant approuvé (undefined pour les templates « code »). */
  templateKey?: ComponentKey;
  defaultConfig: AnimationConfig;
  /** Code source (template « code ») : prévisualisation sandboxée au lieu du composant React. */
  sourceCode?: string;
  /** Départ depuis la config du template (custom) plutôt que les défauts du registre. */
  configFromTemplate?: AnimationConfig;
}) {
  const [config, setConfig] = useState<AnimationConfig>(configFromTemplate ?? defaultConfig);
  const [rerunKey, setRerunKey] = useState(0);

  const inputCls =
    "h-10 w-full rounded-xl border border-line bg-background px-3 text-sm text-ink transition-colors focus:border-accent/60 focus:outline-none";
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted";

  const hasChanges = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(configFromTemplate ?? defaultConfig),
    [config, defaultConfig, configFromTemplate]
  );

  const patch = (partial: Partial<AnimationConfig>) => setConfig((c) => ({ ...c, ...partial }));

  return (
    <section aria-label="Aperçu interactif personalisable" className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative aspect-video w-full">
          {sourceCode ? (
            <SandboxPreview
              code={sourceCode}
              rerunKey={rerunKey}
              config={config as AnimationConfigLite}
              ariaLabel="Aperçu isolé de l'animation"
            />
          ) : templateKey ? (
            <AnimationPlayer
              key={rerunKey}
              componentKey={templateKey}
              config={config}
              className="absolute inset-0"
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRerunKey((k) => k + 1)}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
        >
          <Wand2 className="h-4 w-4" aria-hidden="true" /> Relancer l’animation
        </button>
        <button
          type="button"
          onClick={() => setConfig(configFromTemplate ?? defaultConfig)}
          disabled={!hasChanges}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restaurer
        </button>
        {hasChanges && !sourceCode ? (
          <span className="text-[11px] text-accent">Aperçu à jour en direct</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface/60 p-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <label htmlFor="demo-text" className={labelCls}>Texte</label>
          <input
            id="demo-text"
            value={config.text}
            onChange={(e) => patch({ text: e.target.value.slice(0, 120) })}
            className={inputCls}
          />
        </div>
        {(
          [
            ["Principale", "primaryColor"],
            ["Accent", "accentColor"],
            ["Fond", "backgroundColor"],
          ] as const
        ).map(([label, key]) => (
          <label key={key} className="flex cursor-pointer flex-col gap-1">
            <span className={labelCls}>
              {label === "Principale" ? "Texte" : label === "Accent" ? "Accent" : "Fond"}
            </span>
            <span className="relative flex h-10 items-center overflow-hidden rounded-xl border border-line">
              <input
                type="color"
                value={toValidHex(config[key])}
                onChange={(e) => patch({ [key]: e.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer"
                aria-label={`Couleur ${label}`}
              />
            </span>
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Durée (s)</span>
          <input
            type="number"
            min={1}
            max={30}
            step={0.1}
            value={config.duration}
            onChange={(e) => patch({ duration: Number(e.target.value) || 1 })}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Vitesse</span>
          <input
            type="number"
            min={0.25}
            max={3}
            step={0.05}
            value={config.speed}
            onChange={(e) => patch({ speed: Number(e.target.value) || 1 })}
            className={inputCls}
          />
        </label>
      </div>
      <p className="text-[11px] text-muted">
        {sourceCode
          ? "Aperçu exécuté dans un bac à sable isolé (iframe sandbox, origine nulle) : le code du template ne peut pas toucher au reste du site."
          : "L'aperçu se met à jour instantanément avec vos réglages — la galerie publique reste inchangée."}
      </p>
    </section>
  );
}

function toValidHex(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000";
}