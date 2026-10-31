"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Code2,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { COMPONENT_KEYS, getComponentMeta } from "@/lib/animations/registry";
import { STUDIO_CATEGORIES } from "@/lib/studio/template-registry";
import {
  sanitizeCustomTemplate,
  type CustomTemplate,
  type CustomTemplateStatus,
  type CustomSourceKind,
} from "@/lib/templates/custom-model";
import TemplateDemoControls from "@/components/templates/TemplateDemoControls";
import SandboxPreview, { type AnimationConfigLite } from "@/components/templates/SandboxPreview";
import { SANDBOX_STARTER_CODE } from "@/lib/templates/sandbox-starter";
import type { AnimationConfig } from "@/types/animation";

/**
 * Template Lab — gestionnaire de templates interactifs (administrateur).
 *
 * Deux backends :
 * - "demo" : API /api/templates/lab (store mémoire du serveur, sans Supabase) ;
 * - "supabase" : client navigateur `custom_templates` (RLS admin).
 *
 * Pipeline : brouillon → validation autoritaire (serveur) → candidate →
 * publié (version incrémentée). Le code source n'est JAMAIS exécuté dans
 * l'app : rendu exclusif en bac à sable isolé (iframe sandbox + postMessage).
 */
export default function TemplateLab({ backend }: { backend: "demo" | "supabase" }) {
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [editor, setEditor] = useState<EditorForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [validating, setValidating] = useState(false);
  const [rerunKey, setRerunKey] = useState(0);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emptyForm = (): EditorForm => ({
    id: null,
    slug: "",
    name: "",
    category: "text-motion",
    description: "",
    sourceKind: "component",
    componentKey: COMPONENT_KEYS[0],
    code: SANDBOX_STARTER_CODE("Nouveau template"),
    configText: "MOTION",
    primaryColor: "#F5F5F7",
    accentColor: "#0A84FF",
    backgroundColor: "#000000",
    duration: "4",
    speed: "1",
    promptWeb: "",
    promptAe: "",
    status: "draft",
    version: 1,
  });

  const formToTemplate = (f: EditorForm): CustomTemplate => {
    const duration = Number(f.duration) || 4;
    const sourceKind = f.sourceKind;
    const componentKey =
      sourceKind === "component" && (COMPONENT_KEYS as string[]).includes(f.componentKey)
        ? (f.componentKey as CustomTemplate["componentKey"])
        : undefined;
    return sanitizeCustomTemplate({
      id: f.id ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      slug: f.slug.trim(),
      name: f.name.trim(),
      category: f.category,
      description: f.description.trim(),
      sourceKind,
      componentKey,
      code: sourceKind === "code" ? f.code : undefined,
      defaultConfig: {
        text: f.configText.trim() || f.name.trim() || "MOTION",
        primaryColor: f.primaryColor.trim(),
        accentColor: f.accentColor.trim(),
        backgroundColor: f.backgroundColor.trim(),
        duration,
        speed: Number(f.speed) || 1,
      },
      promptWeb: f.promptWeb,
      promptAfterEffects: f.promptAe,
      version: f.version,
      status: f.status,
    }) as CustomTemplate;
  };

  const formFromTemplate = (t: CustomTemplate): EditorForm => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    category: t.category,
    description: t.description,
    sourceKind: t.sourceKind,
    componentKey: t.componentKey ?? COMPONENT_KEYS[0],
    code: t.code ?? SANDBOX_STARTER_CODE(t.name),
    configText: t.defaultConfig.text,
    primaryColor: t.defaultConfig.primaryColor,
    accentColor: t.defaultConfig.accentColor,
    backgroundColor: t.defaultConfig.backgroundColor,
    duration: String(t.defaultConfig.duration),
    speed: String(t.defaultConfig.speed),
    promptWeb: t.promptWeb,
    promptAe: t.promptAfterEffects,
    status: t.status,
    version: t.version,
  });

  const notify = (kind: "ok" | "error", text: string) => {
    setMessage({ kind, text });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), 4000);
  };

  const load = useCallback(async () => {
    await null;
    setLoading(true);
    try {
      if (backend === "demo") {
        const res = await fetch("/api/templates/lab", { cache: "no-store" });
        const data = (await res.json()) as { ok: boolean; templates?: unknown[] };
        setTemplates(
          ((data.templates ?? []) as unknown[])
            .map(sanitizeCustomTemplate)
            .filter((t): t is CustomTemplate => t !== null)
        );
      } else {
        const client = createSupabaseBrowserClient();
        if (client) {
          const { data, error } = await client
            .from("custom_templates")
            .select("*")
            .order("created_at", { ascending: false });
          if (error) {
            notify("error", `Chargement : ${error.message}`);
            setTemplates([]);
          } else {
            setTemplates(
              ((data ?? []) as unknown[])
                .map(sanitizeCustomTemplate)
                .filter((t): t is CustomTemplate => t !== null)
            );
          }
        }
      }
    } catch (e) {
      notify("error", e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [backend]);

  useEffect(() => {
    // Chargement des templates via fetch/client (setStates async après await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /* --------------------------- validateur ------------------------------- */
  const runValidation = async () => {
    if (!editor) return;
    if (editor.sourceKind !== "code") {
      setValidation({ ok: true, findings: [] });
      return;
    }
    setValidating(true);
    try {
      const res = await fetch("/api/templates/validate-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: editor.code }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        report?: { ok: boolean; findings: ValidationSummary["findings"] };
        errors?: string[];
      };
      if (data.report) setValidation(data.report);
      else
        setValidation({
          ok: false,
          findings: (data.errors ?? []).map((message) => ({ level: "error" as const, message })),
        });
    } catch {
      setValidation({
        ok: false,
        findings: [{ level: "error", message: "Impossible de joindre le validateur." }],
      });
    }
    setValidating(false);
  };

  /* ------------------------------ save ---------------------------------- */
  const save = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      let template: CustomTemplate = formToTemplate(editor) as CustomTemplate;
      if (!template) {
        notify("error", "Formulaire invalide.");
        setSaving(false);
        return;
      }

      // Version : incrément automatique à la publication / modif publiée.
      const prior = templates.find((t) => t.id === template.id);
      if (prior) {
        template = {
          ...template,
          createdAt: prior.createdAt,
          version: prior.version,
          status: template.status,
        };
        const changed =
          prior.code !== template.code ||
          prior.status !== template.status ||
          JSON.stringify(prior.defaultConfig) !== JSON.stringify(template.defaultConfig) ||
          prior.name !== template.name ||
          prior.description !== template.description ||
          prior.promptWeb !== template.promptWeb ||
          prior.promptAfterEffects !== template.promptAfterEffects;
        if (changed && (template.status === "published" || template.status === "candidate")) {
          template = { ...template, version: prior.version + 1 };
        }
      }

      // Code source : validation autoritaire serveur avant enregistrement.
      if (template.sourceKind === "code") {
        const res = await fetch("/api/templates/validate-code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: template.code }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          report?: { ok: boolean; findings: ValidationSummary["findings"] };
          errors?: string[];
        };
        if (!data.ok) {
          notify("error", "Code refusé par le validateur de sécurité.");
          if (data.report) setValidation({ ok: data.report.ok, findings: data.report.findings });
          setSaving(false);
          return;
        }
      }

      if (backend === "demo") {
        const res = await fetch("/api/templates/lab", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(template),
        });
        const data = (await res.json()) as { ok: boolean; errors?: string[]; template?: CustomTemplate };
        if (!data.ok) {
          notify("error", (data.errors ?? ["Erreurs."]).join(" — "));
          setSaving(false);
          return;
        }
        if (data.template) setEditor(formFromTemplate(data.template));
        notify("ok", saveVersionLabel(template.version, template.status));
      } else {
        const client = createSupabaseBrowserClient();
        if (!client) {
          notify("error", "Client Supabase indisponible.");
          setSaving(false);
          return;
        }
        const { error } = await client.from("custom_templates").upsert(
          {
            id: template.id,
            slug: template.slug,
            name: template.name,
            category: template.category,
            description: template.description,
            source_kind: template.sourceKind,
            component_key: template.componentKey ?? null,
            code: template.sourceKind === "code" ? (template.code ?? null) : null,
            default_config: template.defaultConfig,
            prompt_web: template.promptWeb,
            prompt_after_effects: template.promptAfterEffects,
            version: template.version,
            status: template.status,
          },
          { onConflict: "id" }
        );
        if (error) {
          notify("error", `Enregistrement : ${error.message}`);
          setSaving(false);
          return;
        }
        notify("ok", saveVersionLabel(template.version, template.status));
      }
      await load();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    try {
      if (backend === "demo") {
        await fetch("/api/templates/lab", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } else {
        const client = createSupabaseBrowserClient();
        await client?.from("custom_templates").delete().match({ id });
      }
      if (editor?.id === id) setEditor(null);
      notify("ok", "Template supprimé.");
      await load();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : String(e));
    }
  };

  const previewConfig = useMemo<AnimationConfig | null>(() => {
    if (!editor) return null;
    return {
      text: editor.configText || editor.name || "MOTION",
      primaryColor: editor.primaryColor,
      accentColor: editor.accentColor,
      backgroundColor: editor.backgroundColor,
      duration: Number(editor.duration) || 4,
      speed: Number(editor.speed) || 1,
    };
  }, [editor]);

  return (
    <div className="flex flex-col gap-5">
      {message ? (
        <p
          className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
          role="status"
        >
          {message.kind === "ok" ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
          <Code2 className="h-5 w-5 text-accent" aria-hidden="true" /> Template Lab
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
            {templates.length} template{templates.length > 1 ? "s" : ""}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Recharger
          </button>
          <button
            type="button"
            onClick={() => setEditor(emptyForm())}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau template
          </button>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement du Template Lab…
        </p>
      ) : (
        <>
          {/* Liste */}
          <ul className="flex flex-col gap-2.5">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        t.status === "published"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : t.status === "candidate"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-white/5 text-muted"
                      }`}
                    >
                      {t.status}
                    </span>
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                      v{t.version}
                    </span>
                    <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
                      {t.sourceKind === "component" ? t.componentKey : "code source"}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted">/templates/{t.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/templates/${t.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Page publique
                  </a>
                  <button
                    type="button"
                    onClick={() => setEditor(formFromTemplate(t))}
                    className="inline-flex h-9 cursor-pointer items-center rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-ink"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(t.id)}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line text-muted transition-colors hover:border-red-500/50 hover:text-red-300"
                    aria-label={`Supprimer ${t.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
            {templates.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
                Aucun template personnalisé. Cliquez « Nouveau template » pour créer le premier.
              </li>
            ) : null}
          </ul>

          {/* Éditeur */}
          {editor ? (
            <Editor
              editor={editor}
              setEditor={setEditor}
              validation={validation}
              validating={validating}
              onValidate={() => void runValidation()}
              onSave={() => void save()}
              onClose={() => setEditor(null)}
              saving={saving}
              onCancel={() => setRerunKey((k) => k + 1)}
              rerunKey={rerunKey}
              previewConfig={previewConfig}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Éditeur (sous-composant du Lab)                                     */
/* ------------------------------------------------------------------ */

function Editor({
  editor,
  setEditor,
  validation,
  validating,
  onValidate,
  onSave,
  onClose,
  saving,
  onCancel,
  rerunKey,
  previewConfig,
}: {
  editor: EditorForm;
  setEditor: (f: EditorForm) => void;
  validation: ValidationSummary | null;
  validating: boolean;
  onValidate: () => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  onCancel: () => void;
  rerunKey: number;
  previewConfig: AnimationConfig | null;
}) {
  const inputCls =
    "h-10 w-full rounded-xl border border-line bg-background px-3 text-sm text-ink transition-colors focus:border-accent/60 focus:outline-none";
  const labelCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted";

  return (
    <div
      className="rounded-2xl border border-accent/30 bg-surface/60 p-5"
      role="dialog"
      aria-label="Éditeur de template"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tl-name" className={labelCls}>Nom</label>
          <input id="tl-name" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label htmlFor="tl-slug" className={labelCls}>Identifiant (slug)</label>
          <input
            id="tl-slug"
            value={editor.slug}
            onChange={(e) => setEditor({ ...editor, slug: e.target.value.toLocaleLowerCase().slice(0, 60) })}
            className={`${inputCls} font-mono text-xs`}
            placeholder="cta-hero"
          />
        </div>
        <div>
          <label htmlFor="tl-cat" className={labelCls}>Catégorie</label>
          <select id="tl-cat" value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })} className={inputCls}>
            {STUDIO_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tl-status" className={labelCls}>
            Statut <span className="text-muted">(version actuelle : v{editor.version})</span>
          </label>
          <select
            id="tl-status"
            value={editor.status}
            onChange={(e) => setEditor({ ...editor, status: e.target.value as CustomTemplateStatus })}
            className={inputCls}
          >
            <option value="draft">Brouillon</option>
            <option value="candidate">Candidate</option>
            <option value="published">Publié</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="tl-desc" className={labelCls}>Description</label>
          <textarea
            id="tl-desc"
            value={editor.description}
            onChange={(e) => setEditor({ ...editor, description: e.target.value })}
            rows={2}
            className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink focus:border-accent/60 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <p className={labelCls}>Source de l&apos;animation</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditor({ ...editor, sourceKind: "component" })}
              className={`h-9 flex-1 cursor-pointer rounded-full border px-4 text-xs font-medium transition-colors ${
                editor.sourceKind === "component"
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              Basé sur un composant approuvé
            </button>
            <button
              type="button"
              onClick={() => setEditor({ ...editor, sourceKind: "code" })}
              className={`h-9 flex-1 cursor-pointer rounded-full border px-4 text-xs font-medium transition-colors ${
                editor.sourceKind === "code"
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              Code source (bac à sable)
            </button>
          </div>
        </div>

        {editor.sourceKind === "component" ? (
          <div className="sm:col-span-2">
            <label htmlFor="tl-compo" className={labelCls}>Composant de base (registre apprové)</label>
            <select id="tl-compo" value={editor.componentKey} onChange={(e) => setEditor({ ...editor, componentKey: e.target.value })} className={inputCls}>
              {COMPONENT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k} — {getComponentMeta(k).name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="tl-code" className={`${labelCls} !mb-0`}>
                Code source (contrat MGSI_CONFIG)
              </label>
              <button
                type="button"
                onClick={onValidate}
                className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:text-ink"
              >
                {validating ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Valider
              </button>
            </div>
            <textarea
              id="tl-code"
              value={editor.code}
              onChange={(e) => setEditor({ ...editor, code: e.target.value })}
              rows={12}
              spellCheck={false}
              className="w-full rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-accent/60 focus:outline-none"
            />
            <div className="mt-2">
              {validation ? (
                <div className="rounded-xl border border-line bg-background/70 p-3">
                  <p className={`text-xs font-semibold ${validation.ok ? "text-emerald-300" : "text-red-300"}`}>
                    {validation.ok ? "Validation : OK" : "Validation : refusé"}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {validation.findings.map((f, i) => (
                      <li key={i} className={`text-[11px] ${f.level === "error" ? "text-red-300" : "text-amber-300"}`}>
                        • {f.message}
                      </li>
                    ))}
                    {validation.findings.length === 0 && validation.ok ? (
                      <li className="text-[11px] text-muted">Aucun motif interdit détecté.</li>
                    ) : null}
                  </ul>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-muted">
                  Le code est rendu dans un <strong className="text-ink">bac à sable isolé</strong> (iframe
                  sandbox=&quot;allow-scripts&quot;, origine nulle) : sans accès réseau / stockage / DOM parent.
                  Le contrat : lire <code className="font-mono text-[10px]">window.MGSI_CONFIG</code> et écouter
                  « mgsi:configchange » (config) / « mgsi:replay » (relance).
                </p>
              )}
            </div>
          </div>
        )}

        <div className="sm:col-span-2 grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="tl-text" className={labelCls}>Texte par défaut</label>
            <input id="tl-text" value={editor.configText} onChange={(e) => setEditor({ ...editor, configText: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="tl-dur" className={labelCls}>Durée par défaut (s)</label>
            <input id="tl-dur" type="number" min={1} max={30} step={0.1} value={editor.duration} onChange={(e) => setEditor({ ...editor, duration: e.target.value })} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Texte</span>
            <input type="color" value={toValidHex(editor.primaryColor)} onChange={(e) => setEditor({ ...editor, primaryColor: e.target.value })} className="h-10 w-full cursor-pointer rounded-xl border border-line" aria-label="Couleur principale" />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Accent</span>
            <input type="color" value={toValidHex(editor.accentColor)} onChange={(e) => setEditor({ ...editor, accentColor: e.target.value })} className="h-10 w-full cursor-pointer rounded-xl border border-line" aria-label="Couleur accent" />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Fond</span>
            <input type="color" value={toValidHex(editor.backgroundColor)} onChange={(e) => setEditor({ ...editor, backgroundColor: e.target.value })} className="h-10 w-full cursor-pointer rounded-xl border border-line" aria-label="Couleur de fond" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tl-speed" className={labelCls}>Vitesse</label>
            <input id="tl-speed" type="number" min={0.25} max={3} step={0.05} value={editor.speed} onChange={(e) => setEditor({ ...editor, speed: e.target.value })} className={inputCls} />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="tl-pw" className={labelCls}>Prompt Web</label>
          <textarea id="tl-pw" value={editor.promptWeb} onChange={(e) => setEditor({ ...editor, promptWeb: e.target.value })} rows={6} className="w-full rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-accent/60 focus:outline-none" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="tl-pae" className={labelCls}>Prompt After Effects</label>
          <textarea id="tl-pae" value={editor.promptAe} onChange={(e) => setEditor({ ...editor, promptAe: e.target.value })} rows={6} className="w-full rounded-xl border border-line bg-background px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-accent/60 focus:outline-none" />
        </div>

        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <p className={labelCls}>Aperçu interactif</p>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Relancer
            </button>
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line">
            {previewConfig && editor.sourceKind === "component" && (COMPONENT_KEYS as string[]).includes(editor.componentKey) ? (
              <TemplateDemoControls
                templateKey={editor.componentKey as never}
                defaultConfig={previewConfig as AnimationConfig}
                configFromTemplate={previewConfig as AnimationConfig}
              />
            ) : previewConfig ? (
              <>
                <SandboxPreview
                  code={editor.code}
                  config={previewConfig as AnimationConfigLite}
                  rerunKey={rerunKey}
                  ariaLabel="Aperçu sandboxé du code en cours d'édition"
                />
                <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-line bg-black/60 px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted">
                  Sandbox isolé
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 cursor-pointer rounded-full border border-line px-5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Fermer
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/85 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          Enregistrer{editor.status === "published" ? " et publier" : ""}
        </button>
      </div>
    </div>
  );
}

interface EditorForm {
  id: string | null;
  slug: string;
  name: string;
  category: string;
  description: string;
  sourceKind: CustomSourceKind;
  componentKey: string;
  code: string;
  configText: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  duration: string;
  speed: string;
  promptWeb: string;
  promptAe: string;
  status: CustomTemplateStatus;
  version: number;
}

interface ValidationSummary {
  ok: boolean;
  findings: { level: "error" | "warning"; message: string }[];
}

function saveVersionLabel(version: number, status: string): string {
  return status === "published"
    ? `Publié : version v${version} en ligne.`
    : `Enregistré : version ${version} (${status}).`;
}

function toValidHex(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000";
}