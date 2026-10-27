"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ANIMATION_SELECT, type AnimationRowLike } from "@/lib/template-mappers";
import { COMPONENT_KEYS } from "@/lib/animations/registry";
import type { AnimationConfig, ComponentKey } from "@/types/animation";
import type { Category, TemplatePrompt } from "@/types/template";

interface AnimationRowMapped extends AnimationRowLike {
  prompts?: TemplatePrompt[];
  category?: { id?: string; name: string; slug: string } | null;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DEFAULT_NEW_CONFIG: AnimationConfig = {
  text: "MOTION",
  primaryColor: "#F5F5F7",
  accentColor: "#0A84FF",
  backgroundColor: "#000000",
  duration: 4,
  speed: 1,
};

interface EditorState {
  id: string | null;
  title: string;
  slug: string;
  description: string;
  categoryId: string;
  componentKey: ComponentKey;
  duration: string;
  isPublished: boolean;
  isFeatured: boolean;
  configText: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  speed: string;
  promptWeb: string;
  promptAe: string;
}

function emptyEditor(categories: Category[]): EditorState {
  return {
    id: null,
    title: "",
    slug: "",
    description: "",
    categoryId: categories[0]?.id ?? "",
    componentKey: COMPONENT_KEYS[0],
    duration: "4",
    isPublished: false,
    isFeatured: false,
    configText: DEFAULT_NEW_CONFIG.text,
    primaryColor: DEFAULT_NEW_CONFIG.primaryColor,
    accentColor: DEFAULT_NEW_CONFIG.accentColor,
    backgroundColor: DEFAULT_NEW_CONFIG.backgroundColor,
    speed: "1",
    promptWeb: "",
    promptAe: "",
  };
}

function editorFromRow(row: AnimationRowMapped): EditorState {
  const cfg = (row.default_config ?? {}) as Partial<AnimationConfig>;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    categoryId: row.category?.id ?? "",
    componentKey: row.component_key as ComponentKey,
    duration: String(row.duration ?? "4"),
    isPublished: row.is_published,
    isFeatured: row.is_featured,
    configText: typeof cfg.text === "string" ? cfg.text : "",
    primaryColor: typeof cfg.primaryColor === "string" ? cfg.primaryColor : "#F5F5F7",
    accentColor: typeof cfg.accentColor === "string" ? cfg.accentColor : "#0A84FF",
    backgroundColor: typeof cfg.backgroundColor === "string" ? cfg.backgroundColor : "#000000",
    speed: String(cfg.speed ?? 1),
    promptWeb: row.prompts?.find((p) => p.type === "web")?.content ?? "",
    promptAe: row.prompts?.find((p) => p.type === "after_effects")?.content ?? "",
  };
}

/** Tableau de bord admin : opérations via le client navigateur "anon" —
 * les autorisations réelles sont appliquées par les politiques RLS
 * (voir supabase/migrations/0001_init.sql). */
export default function AdminDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [rows, setRows] = useState<AnimationRowMapped[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<"templates" | "categories">("templates");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await null;
    const client = createSupabaseBrowserClient();
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [animRes, catRes] = await Promise.all([
      client.from("animations").select(`${ANIMATION_SELECT}, prompts)id, animation_id, type, content, version)`),
      client.from("categories").select("id, name, slug, description, created_at").order("name"),
    ]);
    if (animRes.error) {
      setMessage({ kind: "error", text: `Chargement des templates : ${animRes.error.message}` });
    } else {
      setRows(((animRes.data ?? []) as unknown as AnimationRowMapped[]) ?? []);
    }
    if (catRes.error) {
      setMessage({ kind: "error", text: `Chargement des catégories : ${catRes.error.message}` });
    } else {
      setCategories(((catRes.data ?? []) as unknown as Category[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Chargement des données via le client navigateur (setState async).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const notify = (kind: "ok" | "error", text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const togglePublish = async (row: AnimationRowMapped) => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client
      .from("animations")
      .update({ is_published: !row.is_published })
      .eq("id", row.id);
    if (error) notify("error", `Publication : ${error.message}`);
    else {
      notify("ok", row.is_published ? "Template dépublié." : "Template publié.");
      void load();
    }
  };

  const validate = (e: EditorState): string | null => {
    if (!e.title.trim()) return "Le titre est requis.";
    const slug = e.slug.trim();
    if (!SLUG_RE.test(slug)) return "Slug invalide (minuscules, chiffres et tirets uniquement).";
    if (!COMPONENT_KEYS.includes(e.componentKey)) return "Composant inconnu.";
    for (const [name, value] of [
      ["primaryColor", e.primaryColor],
      ["accentColor", e.accentColor],
      ["backgroundColor", e.backgroundColor],
    ] as const) {
      if (!/^#[0-9a-fA-F]{6}$/.test(value.trim())) return `${name} doit être un hex #RRGGBB.`;
    }
    const duration = Number(e.duration);
    if (!Number.isFinite(duration) || duration < 1 || duration > 30) return "Durée entre 1 et 30 s.";
    const speed = Number(e.speed);
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 3) return "Vitesse entre 0.25 et 3.";
    return null;
  };

  const saveTemplate = async () => {
    const e = editor;
    if (!e) return;
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const invalid = validate(e);
    if (invalid) {
      notify("error", invalid);
      return;
    }
    setSaving(true);
    const duration = Number(e.duration);
    const config: AnimationConfig = {
      text: e.configText.trim() || e.title.trim(),
      primaryColor: e.primaryColor.trim(),
      accentColor: e.accentColor.trim(),
      backgroundColor: e.backgroundColor.trim(),
      duration,
      speed: Number(e.speed),
    };
    const payload = {
      title: e.title.trim(),
      slug: e.slug.trim(),
      description: e.description.trim(),
      category_id: e.categoryId,
      component_key: e.componentKey,
      default_config: config,
      duration,
      is_published: e.isPublished,
      is_featured: e.isFeatured,
    };

    let animationId = e.id;
    try {
      if (e.id) {
        const { error } = await client.from("animations").update(payload).eq("id", e.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await client
          .from("animations")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        animationId = (data as { id: string }).id;
      }

      // Prompts : upsert par type, suppression si vidé (idempotent)
      for (const [type, content] of [
        ["web", e.promptWeb.trim()],
        ["after_effects", e.promptAe.trim()],
      ] as const) {
        if (!animationId) continue;
        const existing = e.id ? rows.find((r) => r.id === e.id)?.prompts : undefined;
        const row = existing?.find((p) => p.type === type);
        if (content) {
          if (row) {
            await client.from("prompts").update({ content, version: row.version + 1 }).eq("id", row.id);
          } else {
            await client.from("prompts").insert({ animation_id: animationId, type, content, version: 1 });
          }
        } else if (row) {
          await client.from("prompts").delete().eq("id", row.id);
        }
      }

      notify("ok", e.id ? "Template mis à jour." : "Template cr��.");
      setEditor(null);
      await load();
    } catch (err) {
      notify("error", `Enregistrement : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  /* ----------------------------- catégories ----------------------------- */
  const [catName, setCatName] = useState("");
  const [catSlug, setCatSlug] = useState("");

  const addCategory = async () => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const slug = catSlug.trim() || catName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!catName.trim() || !SLUG_RE.test(slug)) {
      notify("error", "Nom de catégorie requis et slug valide.");
      return;
    }
    const { error } = await client.from("categories").insert({ name: catName.trim(), slug });
    if (error) notify("error", `Catégorie : ${error.message}`);
    else {
      notify("ok", "Catégorie ajoutée.");
      setCatName("");
      setCatSlug("");
      await load();
    }
  };

  const deleteCategory = async (cat: Category) => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.from("categories").delete().eq("id", cat.id);
    if (error)
      notify(
        "error",
        error.code === "23503"
          ? "Impossible : des templates utilisent encore cette catégorie."
          : `Suppression : ${error.message}`
      );
    else {
      notify("ok", "Catégorie supprimée.");
      await load();
    }
  };

  if (!isAdmin) return null;

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement de l’administration…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {message ? (
        <p
          className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
          role="status"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {message.text}
        </p>
      ) : null}

      <div className="inline-flex w-fit rounded-full border border-line bg-surface/60 p-1">
        <button
          type="button"
          onClick={() => setTab("templates")}
          className={`h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors ${tab === "templates" ? "bg-elevated text-ink" : "text-muted hover:text-ink"}`}
        >
          Templates ({rows.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("categories")}
          className={`h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors ${tab === "categories" ? "bg-elevated text-ink" : "text-muted hover:text-ink"}`}
        >
          Catégories ({categories.length})
        </button>
      </div>

      {tab === "templates" ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Templates</h2>
            <button
              type="button"
              onClick={() => setEditor(emptyEditor(categories))}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter un template
            </button>
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-2xl border border-line bg-surface/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink">{row.title}</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          row.is_published ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {row.is_published ? "Publié" : "Brouillon"}
                      </span>
                      {row.is_featured ? (
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent">À la une</span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted">
                      /templates/{row.slug} · composant: {row.component_key}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePublish(row)}
                      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
                    >
                      <Power className="h-3.5 w-3.5" aria-hidden="true" />
                      {row.is_published ? "Dépublier" : "Publier"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditor(editorFromRow(row))}
                      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Modifier
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Catégories</h2>
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface/60 p-4">
            <div className="flex-1 min-w-40">
              <label htmlFor="cat-name" className="mb-1 block text-xs text-muted">Nom</label>
              <input
                id="cat-name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-background px-3 text-sm text-ink focus:border-accent/60 focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-40">
              <label htmlFor="cat-slug" className="mb-1 block text-xs text-muted">Slug (auto si vide)</label>
              <input
                id="cat-slug"
                value={catSlug}
                onChange={(e) => setCatSlug(e.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-background px-3 font-mono text-xs text-ink focus:border-accent/60 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={addCategory}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Ajouter
            </button>
          </div>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{cat.name}</p>
                  <p className="truncate font-mono text-xs text-muted">{cat.slug}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteCategory(cat)}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-red-500/50 hover:text-red-300"
                  aria-label={`Supprimer la catégorie ${cat.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editor ? (
        <TemplateEditor
          editor={editor}
          categories={categories}
          saving={saving}
          onChange={setEditor}
          onCancel={() => setEditor(null)}
          onSave={saveTemplate}
        />
      ) : null}
    </div>
  );
}

function TemplateEditor({
  editor,
  categories,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  editor: EditorState;
  categories: Category[];
  saving: boolean;
  onChange: (e: EditorState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    onChange({ ...editor, [key]: value });

  const inputCls =
    "h-10 w-full rounded-xl border border-line bg-background px-3 text-sm text-ink focus:border-accent/60 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium text-muted";

  return (
    <div className="rounded-2xl border border-accent/30 bg-surface/60 p-5" role="dialog" aria-label="Éditeur de template">
      <h3 className="mb-4 text-base font-semibold text-ink">
        {editor.id ? "Modifier le template" : "Nouveau template"}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-title" className={labelCls}>Titre</label>
          <input id="f-title" value={editor.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="f-slug" className={labelCls}>Slug (URL)</label>
          <input id="f-slug" value={editor.slug} onChange={(e) => set("slug", e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder="kinetic-type-01" />
        </div>
        <div>
          <label htmlFor="f-cat" className={labelCls}>Catégorie</label>
          <select id="f-cat" value={editor.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-comp" className={labelCls}>Composant d’animation (existant)</label>
          <select id="f-comp" value={editor.componentKey} onChange={(e) => set("componentKey", e.target.value as ComponentKey)} className={inputCls}>
            {COMPONENT_KEYS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted">
            Association à un composant compilé uniquement — aucun code arbitraire ne peut être importé.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-desc" className={labelCls}>Description</label>
          <textarea id="f-desc" value={editor.description} onChange={(e) => set("description", e.target.value)} rows={3} className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink focus:border-accent/60 focus:outline-none" />
        </div>

        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Paramètres par défaut (Motion Studio ready)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="f-text" className={labelCls}>Texte</label>
              <input id="f-text" value={editor.configText} onChange={(e) => set("configText", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-c1" className={labelCls}>Couleur principale</label>
              <input id="f-c1" value={editor.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className={`${inputCls} font-mono text-xs`} />
            </div>
            <div>
              <label htmlFor="f-c2" className={labelCls}>Couleur accent</label>
              <input id="f-c2" value={editor.accentColor} onChange={(e) => set("accentColor", e.target.value)} className={`${inputCls} font-mono text-xs`} />
            </div>
            <div>
              <label htmlFor="f-c3" className={labelCls}>Fond</label>
              <input id="f-c3" value={editor.backgroundColor} onChange={(e) => set("backgroundColor", e.target.value)} className={`${inputCls} font-mono text-xs`} />
            </div>
            <div>
              <label htmlFor="f-dur" className={labelCls}>Durée (s)</label>
              <input id="f-dur" type="number" min={1} max={30} step={0.1} value={editor.duration} onChange={(e) => set("duration", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="f-speed" className={labelCls}>Vitesse</label>
              <input id="f-speed" type="number" min={0.25} max={3} step={0.05} value={editor.speed} onChange={(e) => set("speed", e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="f-pw" className={labelCls}>Prompt Web</label>
          <textarea id="f-pw" value={editor.promptWeb} onChange={(e) => set("promptWeb", e.target.value)} rows={10} className="w-full rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-accent/60 focus:outline-none" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-pae" className={labelCls}>Prompt After Effects</label>
          <textarea id="f-pae" value={editor.promptAe} onChange={(e) => set("promptAe", e.target.value)} rows={10} className="w-full rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-accent/60 focus:outline-none" />
        </div>

        <div className="flex items-center gap-6 sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={editor.isPublished} onChange={(e) => set("isPublished", e.target.checked)} className="h-4 w-4 accent-[#0A84FF]" />
            Publié
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={editor.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} className="h-4 w-4 accent-[#0A84FF]" />
            À la une
          </label>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 cursor-pointer rounded-full border border-line px-5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/85 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Enregistrer
        </button>
      </div>
    </div>
  );
}