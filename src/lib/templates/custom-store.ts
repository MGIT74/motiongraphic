import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeCustomTemplate, validateCustomTemplate, type CustomTemplate } from "./custom-model";
import type { AnimationConfig } from "@/types/animation";

/**
 * Store des templates personnalisés.
 *
 * - Mode démo (Supabase non configuré) : store EN MÉMOIRE du serveur,
 *   pré-rempli avec un template de démonstration. Réinitialisé à chaque
 *   redémarrage du serveur dev — assumé (développement local uniquement).
 * - Mode Supabase : table `custom_templates` via le client serveur (RLS).
 */

/* ------------------------------------------------------------------ */
/* Mapping DB (snake_case) <-> modèle app (camelCase)                  */
/* ------------------------------------------------------------------ */

interface CustomTemplateRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  source_kind: string;
  component_key: string | null;
  code: string | null;
  default_config: unknown;
  prompt_web: string | null;
  prompt_after_effects: string | null;
  version: number;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  validation?: unknown;
}

const CUSTOM_SELECT = "id, slug, name, category, description, source_kind, component_key, code, default_config, prompt_web, prompt_after_effects, version, status, created_at, updated_at, validation";

function toRow(template: CustomTemplate): CustomTemplateRow {
  return {
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
    created_at: template.createdAt,
    updated_at: template.updatedAt,
    validation: template.validation ?? null,
  };
}

function fromRow(row: CustomTemplateRow): CustomTemplate | null {
  return sanitizeCustomTemplate({
    ...row,
    sourceKind: row.source_kind,
    componentKey: row.component_key ?? undefined,
    promptWeb: row.prompt_web ?? "",
    promptAfterEffects: row.prompt_after_effects ?? "",
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  });
}

/* ------------------------------------------------------------------ */
/* Mode démo                                                           */
/* ------------------------------------------------------------------ */

function demoSeedCTA(): CustomTemplate | null {
  const now = "2026-10-31T10:00:00.000Z";
  return sanitizeCustomTemplate({
    id: "b0000000-0000-4000-8000-000000000021",
    slug: "cta-hero-demo",
    name: "CTA Hero (démo)",
    category: "text-motion",
    description:
      "Template de démonstration créé dans l'administration : déclinaison « CTA » de Kinetic Typography, dispo dans la galerie et le Studio.",
    sourceKind: "component",
    componentKey: "kinetic-type-01",
    defaultConfig: {
      text: "ESSAYEZ",
      primaryColor: "#F5F5F7",
      accentColor: "#0A84FF",
      backgroundColor: "#000000",
      duration: 2.8,
      speed: 1,
    } as AnimationConfig,
    promptWeb:
      "Tu es un développeur créatif expert en motion design web et GSAP.\n\nOBJECTIF\nProduire un encart « CTA » kinetic : le mot ESSAYEZ apparaît lettre par lettre (masque bas, stagger 70 ms), un point accent bleu #0A84FF pop en back.out(3), boucle en sortie inversée vers le haut.\n\nCONTRAINTES\n- Un seul fichier HTML + GSAP via CDN\n- N'animer que transform/opacity (60 fps)\n- Respecter prefers-reduced-motion (état final statique)\n- Palette : fond #000000, texte #F5F5F7, accent #0A84FF",
    promptAfterEffects:
      "Tu es un expert ExtendScript (JSX) pour Adobe After Effects.\n\nMISSION\nÉcris un script JSX créant la compo « MGSI_CTAHero » (1920×1080, 30 fps, 5 s, fond #000000) : calque texte ESSAYEZ en sous-calques par lettre, entrée masque bas décalée de 2 frames, point accent pop, sortie inversée pour boucler. Idempotent, préfixe MGSI_, sans plugins.",
    version: 1,
    status: "published",
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Store mémoire (démonstration) : partagé entre TOUTES les instances du
 * module (routes API / pages) via globalThis — Turbopack duplique sinon le
 * module selon le graphe (dev). En production (Supabase), ce store n'est pas utilisé.
 */
interface GlobalCustomStore {
  __mgsiCustomTemplates?: Map<string, CustomTemplate>;
  __mgsiCustomSeeded?: boolean;
}
const globalStore = globalThis as GlobalCustomStore;
const memory: Map<string, CustomTemplate> = (globalStore.__mgsiCustomTemplates ??= new Map());

function ensureDemoSeed() {
  if (globalStore.__mgsiCustomSeeded) return;
  globalStore.__mgsiCustomSeeded = true;
  const cta = demoSeedCTA();
  if (cta) memory.set(cta.id, cta);
}

/* ------------------------------------------------------------------ */
/* API du store                                                        */
/* ------------------------------------------------------------------ */

export class CustomStoreError extends Error {}

/** Tout le catalogue (admin). Lève (mode Supabase) si la base est injoignable. */
export async function listCustomTemplates(): Promise<CustomTemplate[]> {
  if (!isSupabaseConfigured()) {
    ensureDemoSeed();
    return Array.from(memory.values());
  }
  const client = await createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client.from("custom_templates").select(CUSTOM_SELECT);
  if (error) throw new CustomStoreError(`Supabase (custom_templates) : ${error.message}`);
  return ((data ?? []) as unknown as CustomTemplateRow[])
    .map(fromRow)
    .filter((t): t is CustomTemplate => t !== null);
}

/** Templates publiés (site public). */
export async function listPublishedCustomTemplates(): Promise<CustomTemplate[]> {
  const all = await listCustomTemplates();
  return all.filter((t) => t.status === "published");
}

export async function getCustomTemplateBySlug(slug: string): Promise<CustomTemplate | null> {
  if (!isSupabaseConfigured()) {
    ensureDemoSeed();
    return Array.from(memory.values()).find((t) => t.slug === slug) ?? null;
  }
  const all = await listCustomTemplates();
  return all.find((t) => t.slug === slug) ?? null;
}

export interface CustomTemplateWriteResult {
  ok: boolean;
  errors?: string[];
  template?: CustomTemplate;
}

/** Écriture (admin) : validation authoritaire serveur + slug réservé. */
export async function upsertCustomTemplate(input: unknown): Promise<CustomTemplateWriteResult> {
  const template = sanitizeCustomTemplate(input);
  if (!template) return { ok: false, errors: ["Template invalide."] };
  const validation = validateCustomTemplate(template, { requireCodeForPublish: true });
  if (!validation.ok) return { ok: false, errors: validation.errors };

  if (!isSupabaseConfigured()) {
    ensureDemoSeed();
    memory.set(template.id, template);
    return { ok: true, template };
  }
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, errors: ["Supabase indisponible."] };
  const { error } = await client.from("custom_templates").upsert(toRow(template), { onConflict: "id" });
  if (error) return { ok: false, errors: [error.message] };
  return { ok: true, template };
}

export async function deleteCustomTemplate(id: string): Promise<CustomTemplateWriteResult> {
  if (!isSupabaseConfigured()) {
    ensureDemoSeed();
    memory.delete(id);
    return { ok: true };
  }
  const client = await createSupabaseServerClient();
  if (!client) return { ok: false, errors: ["Supabase indisponible."] };
  const { error } = await client.from("custom_templates").delete().match({ id });
  if (error) return { ok: false, errors: [error.message] };
  return { ok: true };
}