"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { listCloudProjects, type CloudProjectSummary } from "@/lib/studio/projects-supabase";
import { listProjects as listLocalProjects } from "@/lib/studio/persistence";
import { formatOf } from "@/lib/studio/project-model";
import { friendlyError } from "@/lib/studio/errors";

/**
 * « Mes projets » : liste des projets (cloud si connecté, sinon ceux du
 * navigateur) avec ouvrir / dupliquer / supprimer. Le projet ouvert ne peut
 * pas être supprimé ; la suppression demande une confirmation sur la ligne.
 */
export default function ProjectsMenu({
  currentProjectId,
  onOpen,
  onDuplicate,
  onDelete,
  compact = false,
}: {
  currentProjectId: string;
  onOpen: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<boolean>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<(CloudProjectSummary & { local?: boolean })[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    setError(null);
    const cloud = await listCloudProjects().catch(() => null);
    if (cloud) {
      setItems(cloud);
      return;
    }
    setItems(
      listLocalProjects().map((e) => ({ id: e.id, name: e.name, width: 0, height: 0, updatedAt: e.updatedAt, local: true }))
    );
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (id: string, action: () => Promise<unknown>, close = false) => {
    setBusy(id);
    setError(null);
    try {
      await action();
      if (close) setOpen(false);
      else await refresh();
    } catch (e) {
      const f = friendlyError(e, "project");
      setError(`${f.title} — ${f.hint}`);
    } finally {
      setBusy(null);
      setConfirmId(null);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          if (!open) {
            setItems(null);
            void refresh();
          }
          setOpen(!open);
        }}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> {compact ? <span className="sr-only">Projets</span> : "Projets"}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Mes projets"
          className={`z-[200] rounded-2xl border border-line bg-surface p-2 shadow-2xl ${compact ? "fixed inset-x-2 top-14" : "absolute right-0 top-11 w-96"}`}
          data-projects-menu
        >
          <a href="/settings/mcp" className="mb-2 block rounded-xl px-2 py-2 text-sm font-medium text-ink hover:bg-elevated">Connexions MCP</a>
          <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Mes projets{items?.[0]?.local ? " · sur ce navigateur" : ""}
          </p>
          {items === null ? (
            <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Chargement…
            </div>
          ) : items.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted">Aucun projet enregistré.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => {
                const current = item.id === currentProjectId;
                return (
                  <li
                    key={item.id}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${current ? "bg-accent/10" : "hover:bg-elevated"}`}
                    data-project-row={item.id}
                  >
                    <button
                      type="button"
                      disabled={current || busy !== null}
                      onClick={() => void run(item.id, () => onOpen(item.id), true)}
                      className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-default"
                      aria-label={`Ouvrir ${item.name}`}
                    >
                      <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                      <span className="block text-[10px] text-muted">
                        {current ? "Ouvert · " : ""}
                        {item.width ? `${formatOf(item)} · ` : ""}
                        {new Date(item.updatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </button>
                    {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden="true" /> : null}
                    {confirmId === item.id ? (
                      <span className="flex items-center gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            void run(item.id, async () => {
                              if (!(await onDelete(item.id))) throw new Error("Suppression refusée.");
                            })
                          }
                          className="cursor-pointer rounded-md bg-red-500/15 px-2 py-1 font-semibold text-red-300 hover:bg-red-500/25"
                        >
                          Supprimer
                        </button>
                        <button type="button" onClick={() => setConfirmId(null)} className="cursor-pointer px-1 text-muted hover:text-ink">
                          Annuler
                        </button>
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void run(item.id, () => onDuplicate(item.id), true)}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink disabled:opacity-40"
                          aria-label={`Dupliquer ${item.name}`}
                          title="Dupliquer (ouvre la copie)"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={current || busy !== null}
                          onClick={() => setConfirmId(item.id)}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:text-red-300 disabled:opacity-30"
                          aria-label={`Supprimer ${item.name}`}
                          title={current ? "Le projet ouvert ne peut pas être supprimé" : "Supprimer"}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {error ? <p className="px-2 pt-2 text-[11px] text-red-300" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
