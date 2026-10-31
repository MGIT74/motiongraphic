"use client";

import { useState } from "react";
import { Film, FolderOpen, Image as ImageIcon, Layers3, Plus, Trash2 } from "lucide-react";
import type { StudioProject } from "@/lib/studio/project-model";
import { STUDIO_CATEGORIES, STUDIO_TEMPLATES } from "@/lib/studio/template-registry";

/**
 * Panneau gauche du Studio : scènes + bibliothèque de templates + médias
 * (l'import de médias arrive en Phase 3 — indication honnête).
 */
export default function StudioLeftPanel({
  project,
  currentSceneIndex,
  onJumpToScene,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onUpdateSceneDuration,
  onAddElement,
}: {
  project: StudioProject;
  currentSceneIndex: number;
  onJumpToScene: (index: number) => void;
  onAddScene: () => void;
  onDeleteScene: (index: number) => void;
  onRenameScene: (index: number, name: string) => void;
  onUpdateSceneDuration: (index: number, duration: number) => void;
  onAddElement: (templateKey: string) => void;
}) {
  const [tab, setTab] = useState<"scenes" | "library" | "media">("scenes");

  const tabs = [
    { id: "scenes" as const, label: "Scènes", icon: Layers3 },
    { id: "library" as const, label: "Templates", icon: Film },
    { id: "media" as const, label: "Médias", icon: ImageIcon },
  ];

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface/40 lg:w-72">
      <div className="flex border-b border-line p-2">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === tb.id ? "bg-elevated text-ink" : "text-muted hover:text-ink"
            }`}
          >
            <tb.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tb.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "scenes" ? (
          <div className="flex flex-col gap-2">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {project.scenes.length} scène{project.scenes.length > 1 ? "s" : ""}
            </p>
            {project.scenes.map((scene, i) => (
              <div
                key={scene.id}
                className={`group rounded-xl border p-2.5 transition-colors ${
                  i === currentSceneIndex ? "border-accent/60 bg-accent/5" : "border-line bg-background/60 hover:border-muted/40"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onJumpToScene(i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
                >
                  <span className="truncate text-sm font-medium text-ink">{scene.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">{scene.duration.toFixed(1)}s</span>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={scene.name}
                    onChange={(e) => onRenameScene(i, e.target.value)}
                    className="h-7 min-w-0 flex-1 rounded-md border border-line bg-background px-2 text-xs text-ink focus:border-accent/60 focus:outline-none"
                    aria-label={`Nom de la scène ${i + 1}`}
                  />
                  <input
                    type="number"
                    min={1}
                    max={600}
                    step={0.5}
                    value={scene.duration}
                    onChange={(e) => onUpdateSceneDuration(i, Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                    className="h-7 w-16 rounded-md border border-line bg-background px-2 text-xs text-ink focus:border-accent/60 focus:outline-none"
                    aria-label={`Durée de la scène ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onDeleteScene(i)}
                    disabled={project.scenes.length <= 1}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
                    aria-label={`Supprimer la scène ${scene.name}`}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={onAddScene}
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une scène
            </button>
          </div>
        ) : tab === "library" ? (
          <div className="flex flex-col gap-4">
            <p className="px-1 text-[11px] leading-relaxed text-muted">
              Cliquez sur un template pour l’ajouter à la scène courante.
            </p>
            {STUDIO_CATEGORIES.map((category) => {
              const templates = Object.entries(STUDIO_TEMPLATES).filter(
                ([, t]) => t.studioCategory === category.id
              );
              if (templates.length === 0) return null;
              return (
                <div key={category.id}>
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {category.label}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {templates.map(([key, template]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onAddElement(key)}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-line bg-background/60 px-3 py-2.5 text-left transition-colors hover:border-accent/50"
                      >
                        <span>
                          <span className="block text-xs font-semibold text-ink">{template.name}</span>
                          <span className="block font-mono text-[10px] text-muted">{key}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                          {template.timelineDuration}s
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-1 pt-2">
            <div className="rounded-xl border border-dashed border-line px-3 py-8 text-center">
              <ImageIcon className="mx-auto h-5 w-5 text-muted" aria-hidden="true" />
              <p className="mt-2 text-xs font-medium text-ink">Import de médias</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Rushs, captures d’écran et logos — arrivent en Phase 3, avec
                découpage virtuel (In/Out sans réencodage).
              </p>
            </div>
            <div className="rounded-xl border border-line bg-background/60 px-3 py-3 text-[11px] leading-relaxed text-muted">
              <FolderOpen className="mb-1.5 inline-block h-4 w-4" aria-hidden="true" />
              <p>Les médias importés seront stockés dans Supabase Storage et découpés
              virtuellement (in/out) sans réencoder les fichiers.</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}