"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Loader2, Pencil, Plus, Power, Trash2, Eye, LayoutDashboard, Layers3, FolderOpen, BarChart3, ExternalLink, Sun, Moon, TrendingUp, Copy, Activity, ArrowUpRight, Film, Search } from "lucide-react";
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [rows, setRows] = useState<AnimationRowMapped[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<"overview" | "templates" | "categories" | "analytics">("overview");
  const [copyStats, setCopyStats] = useState<{ animation_id: string; event_type: string; created_at: string }[]>([]);
  const [analyticsReady, setAnalyticsReady] = useState(false);
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
      client.from("animations").select(ANIMATION_SELECT).order("created_at", { ascending: false }),
      client.from("categories").select("id, name, slug, description, created_at").order("name"),
    ]);
    if (animRes.error) {
      setMessage({ kind: "error", text: `Chargement des templates : ${animRes.error.message}` });
    } else {
      const animations = (animRes.data ?? []) as unknown as AnimationRowMapped[];
      if (animations.length > 0) {
        const { data: promptData, error: promptError } = await client
          .from("prompts")
          .select("id, animation_id, type, content, version")
          .in("animation_id", animations.map((animation) => animation.id));
        if (promptError) {
          setMessage({ kind: "error", text: `Chargement des prompts : ${promptError.message}` });
        } else {
          const prompts = (promptData ?? []) as unknown as (TemplatePrompt & { animation_id: string })[];
          setRows(animations.map((animation) => ({
            ...animation,
            prompts: prompts.filter((prompt) => prompt.animation_id === animation.id),
          })));
          setMessage(null);
        }
      } else {
        setRows([]);
        setMessage(null);
      }
    }
    if (catRes.error) {
      setMessage({ kind: "error", text: `Chargement des catégories : ${catRes.error.message}` });
    } else {
      setCategories(((catRes.data ?? []) as unknown as Category[]) ?? []);
    }
    const statsRes = await client.from("template_events").select("animation_id, event_type, created_at").eq("event_type", "prompt_copy").limit(10000);
    if (!statsRes.error) {
      setCopyStats((statsRes.data ?? []) as { animation_id: string; event_type: string; created_at: string }[]);
      setAnalyticsReady(true);
    } else {
      setAnalyticsReady(false);
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
      <div className="admin-shell flex items-center justify-center p-12"><p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement de l’administration…
      </p></div>
    );
  }

  return (
    <div className="admin-shell" data-admin-theme={theme}>
      <div className="mx-auto max-w-[1560px] px-4 py-6 sm:px-7 lg:px-10">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-black text-white">M</div><div><p className="text-base font-bold text-ink">MotionGraphic<span className="text-accent">.si</span></p><p className="text-xs text-muted">Espace administrateur</p></div></div>
        <div className="flex items-center gap-3"><span className="hidden text-xs text-muted sm:inline">Administration · Gestion du catalogue</span><button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="flex h-10 items-center gap-2 rounded-xl border border-line bg-elevated px-3 text-sm text-ink" aria-label={theme === "light" ? "Activer le mode sombre" : "Activer le mode clair"}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{theme === "light" ? "Sombre" : "Clair"}</button></div>
      </div>
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

      <div className="grid gap-6 lg:grid-cols-[235px_minmax(0,1fr)]">
        <aside className="admin-panel h-fit p-3 lg:sticky lg:top-6">
          <p className="px-3 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted">Workspace</p>
          {([
            ["overview", "Vue d’ensemble", LayoutDashboard],
            ["templates", "Templates", Layers3],
            ["categories", "Catégories", FolderOpen],
            ["analytics", "Statistiques", BarChart3],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${tab === key ? "admin-nav-active" : "text-muted hover:bg-elevated hover:text-ink"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <a href="/explore" target="_blank" rel="noopener noreferrer" className="mt-5 flex items-center gap-3 border-t border-line px-3 py-4 text-sm text-muted hover:text-ink">
            <ExternalLink className="h-4 w-4" /> Voir le site
          </a>
        </aside>
        <div className="min-w-0 space-y-6">
          {tab === "overview" || tab === "analytics" ? (
            <section className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-xs font-medium text-accent">DASHBOARD / INSIGHTS</p><h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">{tab === "overview" ? "Bienvenue sur votre studio 👋" : "Statistiques de votre bibliothèque"}</h1><p className="mt-2 text-sm text-muted">Vue d’ensemble de vos animations et des interactions enregistrées.</p></div>
                <button type="button" onClick={() => setTab("templates")} className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white">Gérer les templates</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {([
                  ["Templates", rows.length, Film],
                  ["Animations publiées", rows.filter((r) => r.is_published).length, Activity],
                  ["Catégories", categories.length, Layers3],
                  ["Copies de prompts", analyticsReady ? copyStats.length.toLocaleString("fr-FR") : "—", Copy],
                ] as const).map(([label, value, Icon]) => (
                  <div key={label} className="admin-panel p-5">
                    <div className="flex items-center justify-between"><p className="text-xs font-medium text-muted">{label}</p><span className="rounded-xl bg-accent/10 p-2 text-accent"><Icon className="h-4 w-4" /></span></div>
                    <p className="mt-5 text-3xl font-bold tracking-tight text-ink">{value}</p>
                    <p className="mt-2 text-xs text-muted">Données du catalogue</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <div className="admin-panel p-6">
                  <div className="mb-6 flex items-center justify-between"><div><h2 className="font-bold text-ink">Activité des copies</h2><p className="mt-1 text-xs text-muted">7 derniers jours · copies de prompts</p></div><TrendingUp className="h-5 w-5 text-accent" /></div>
                  {analyticsReady ? (
                    <div className="flex h-56 items-end justify-between gap-2 border-b border-line pb-1">
                      {Array.from({length: 7}, (_, i) => {
                        const day = new Date(); day.setDate(day.getDate() - 6 + i);
                        const date = day.toLocaleDateString("en-CA");
                        const count = copyStats.filter(e => e.created_at.slice(0, 10) === date).length;
                        const max = Math.max(1, ...Array.from({length: 7}, (_, j) => {
                          const d = new Date(); d.setDate(d.getDate() - 6 + j);
                          return copyStats.filter(e => e.created_at.slice(0, 10) === d.toLocaleDateString("en-CA")).length;
                        }));
                        return <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-xs text-muted">{count}</span><div title={count + " copies"} className="w-full max-w-14 rounded-t-lg bg-accent/80" style={{height: Math.max(3, count / max * 165)}} /><span className="text-[10px] text-muted">{day.toLocaleDateString("fr-FR", {weekday: "short"})}</span></div>;
                      })}
                    </div>
                  ) : <p className="flex h-56 items-center justify-center text-center text-sm text-muted">Installez la migration SQL des événements pour afficher l’activité réelle.</p>}
                </div>
                <div className="admin-panel p-6">
                  <h2 className="font-bold text-ink">État du catalogue</h2><p className="mt-1 text-xs text-muted">Répartition des publications</p>
                  <div className="mt-8 flex items-center justify-center"><div className="flex h-40 w-40 items-center justify-center rounded-full" style={{background: `conic-gradient(var(--color-accent) ${rows.length ? rows.filter(r => r.is_published).length / rows.length * 100 : 0}%, var(--color-elevated) 0)`}}><div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-surface"><span className="text-3xl font-bold text-ink">{rows.length ? Math.round(rows.filter(r => r.is_published).length / rows.length * 100) : 0}%</span><span className="text-xs text-muted">publiés</span></div></div></div>
                  <div className="mt-6 flex justify-between text-xs text-muted"><span>● {rows.filter(r => r.is_published).length} publiés</span><span>{rows.filter(r => !r.is_published).length} brouillons</span></div>
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="admin-panel p-6"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-ink">Templates les plus copiés</h2><button type="button" onClick={() => setTab("analytics")} className="text-xs text-accent">Statistiques <ArrowUpRight className="inline h-3 w-3" /></button></div>
                  {analyticsReady ? <div className="space-y-3">{[...rows].sort((a,b) => copyStats.filter(e=>e.animation_id===b.id).length - copyStats.filter(e=>e.animation_id===a.id).length).slice(0,5).map((row,i) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-elevated px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="text-xs text-muted">{String(i+1).padStart(2,"0")}</span><span className="truncate text-sm font-medium text-ink">{row.title}</span></div><span className="text-sm font-semibold text-ink">{copyStats.filter(e=>e.animation_id===row.id).length}</span></div>)}</div> : <p className="py-8 text-sm text-muted">Statistiques non disponibles tant que la migration SQL n’est pas installée.</p>}
                </div>
                <div className="admin-panel p-6"><h2 className="font-bold text-ink">Gestion rapide</h2><p className="mt-1 text-xs text-muted">Accès direct à votre bibliothèque</p><div className="mt-5 space-y-3"><button type="button" onClick={() => setTab("templates")} className="flex w-full items-center justify-between rounded-xl bg-elevated px-4 py-4 text-sm text-ink"><span>Gérer les animations</span><ArrowUpRight className="h-4 w-4 text-accent" /></button><button type="button" onClick={() => setTab("categories")} className="flex w-full items-center justify-between rounded-xl bg-elevated px-4 py-4 text-sm text-ink"><span>Organiser les catégories</span><ArrowUpRight className="h-4 w-4 text-accent" /></button><a href="/explore" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl bg-elevated px-4 py-4 text-sm text-ink"><span>Voir la galerie publique</span><ExternalLink className="h-4 w-4 text-accent" /></a></div></div>
              </div>
            </section>
          ) : null}
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
                    <a href={`/admin/preview/${row.id}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-xs font-medium text-ink hover:border-accent/50"
                      title="Aperçu privé administrateur, y compris pour les brouillons">
                      <Eye className="h-3.5 w-3.5" /> Aperçu
                    </a>
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
      ) : tab === "categories" ? (
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
      ) : null}

        </div>
      </div>
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