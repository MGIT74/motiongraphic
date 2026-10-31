import type { AnimationConfig, ComponentKey } from "@/types/animation";
import { isComponentKey } from "@/lib/animations/registry";
import { sanitizeConfigByKey } from "@/lib/animations/config";
import { STUDIO_CATEGORIES, STUDIO_TEMPLATES } from "@/lib/studio/template-registry";

/**
 * Templates personnalisés créés par l'administration.
 *
 * Deux sources possibles :
 * - `component` : dérivé d'un composant APPROUVÉ du registre (déploiement
 *   instantané, params modifiables, pilotable par la timeline Studio) ;
 * - `code` : code source fourni (React/HTML/CSS/SVG). JAMAIS exécuté dans
 *   l'application : rendu exclusivement dans un iframe isolé
 *   (sandbox="allow-scripts", origine nulle) — voir SandboxPreview.
 *   Son intégration timeline (pilotage par le temps) passera par le
 *   pipeline de compilation (Phase 2 Studio), pas directement en production.
 *
 * Statuts : draft → candidate → published (rétrogradation possible).
 * La publication ne touche que les données (métadonnées/params/prompt) :
 * le code source, lui, ne devient jamais exécutable côté app.
 */

export const CUSTOM_SCHEMA_VERSION = 1;

export type CustomTemplateStatus = "draft" | "candidate" | "published";
export type CustomSourceKind = "component" | "code";

export interface CustomTemplate {
  id: string;
  slug: string;
  name: string;
  /** Catégorie Studio (STUDIO_CATEGORIES). */
  category: string;
  description: string;
  sourceKind: CustomSourceKind;
  /** Sourcekind=component : clé du composant de base approuvé. */
  componentKey?: ComponentKey;
  /** Sourcekind=code : code source validé (rendu sandbox uniquement). */
  code?: string;
  defaultConfig: AnimationConfig;
  promptWeb: string;
  promptAfterEffects: string;
  /** Version du template : incrémentée à chaque publication/modif publiée. */
  version: number;
  status: CustomTemplateStatus;
  createdAt: string;
  updatedAt: string;
  /** Résultat du dernier passage du validateur (pour affichage admin). */
  validation?: CodeValidationReport;
}

export interface CodeFinding {
  level: "error" | "warning";
  pattern: string;
  message: string;
}

export interface CodeValidationReport {
  ok: boolean;
  findings: CodeFinding[];
  checkedAt: string;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ------------------------------------------------------------------ */
/* Validateur statique de code source (autoritaire, exécuté serveur)  */
/* ------------------------------------------------------------------ */

const FORBIDDEN_PATTERNS: { re: RegExp; level: "error" | "warning"; message: string }[] = [
  { re: /\beval\s*\(|new\s+Function\s*\(/, level: "error", message: "Évaluation dynamique (eval/Function) interdite." },
  { re: /\bimport\s*\(|\brequire\s*\(|\bmodule\.exports/, level: "error", message: "Imports dynamiques / modules interdits dans le bac à sable." },
  { re: /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket|EventSource/, level: "error", message: "Appels réseau interdits (animations 100 % locales)." },
  { re: /\blocalStorage|\bsessionStorage|\bindexedDB|\bdocument\.cookie/, level: "error", message: "Accès stockage/cookies interdit dans le bac à sable." },
  { re: /window\.top|window\.parent|\.frames\[|eventSource/i, level: "error", message: "Accès à la fenêtre parente interdit (le contrat passe par postMessage)." },
  { re: /document\.domain|window\.location\s*=/, level: "error", message: "Navigation/redirection interdite." },
  { re: /\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/, level: "warning", message: "Boîtes de dialogue bloquées par le bac à sable (inutiles)." },
  { re: /serviceWorker|SharedWorker|\bnavigator\./, level: "warning", message: "API navigateur non nécessaires à une animation." },
];

export function validateTemplateCode(code: string): CodeValidationReport {
  const findings: CodeFinding[] = [];
  for (const { re, level, message } of FORBIDDEN_PATTERNS) {
    if (re.test(code)) {
      findings.push({ level, pattern: re.source, message });
    }
  }
  return {
    ok: !findings.some((f) => f.level === "error"),
    findings,
    checkedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Validation d'un template custom complet                             */
/* ------------------------------------------------------------------ */

export interface CustomTemplateValidation {
  ok: boolean;
  errors: string[];
}

export function validateCustomTemplate(
  template: CustomTemplate,
  { requireCodeForPublish = false }: { requireCodeForPublish?: boolean } = {}
): CustomTemplateValidation {
  const errors: string[] = [];

  if (!SLUG_RE.test(template.slug)) errors.push("Slug invalide (lettrines minuscules, chiffres, tirets).");
  if (isReservedSlug(template.slug)) errors.push(`Slug réservé : « ${template.slug} » correspond à un template intégré.`);
  if (!template.name.trim() || template.name.length > 120) errors.push("Nom requis (120 max).");
  if (template.description.length > 1000) errors.push("Description trop longue (1000 max).");
  if (!STUDIO_CATEGORIES.some((c) => c.id === template.category)) errors.push("Catégorie inconnue.");

  const statusValues: CustomTemplateStatus[] = ["draft", "candidate", "published"];
  if (!statusValues.includes(template.status)) errors.push("Statut inconnu.");

  if (!Number.isInteger(template.version) || template.version < 1) errors.push("Version invalide.");

  if (template.sourceKind === "component") {
    if (!template.componentKey || !isComponentKey(template.componentKey)) {
      errors.push("Composant de base inconnu : choisissez un composant du registre approuvé.");
    }
  } else {
    if (typeof template.code !== "string" || template.code.trim().length < 20) {
      errors.push("Code source requis (20 caractères minimum).");
    } else {
      const report = validateTemplateCode(template.code);
      if (!report.ok) {
        errors.push("Code refusé par le validateur de sécurité (voir les détails dans l'éditeur).");
      }
    }
    if (requireCodeForPublish && template.status === "published" && typeof template.code !== "string") {
      errors.push("Publication impossible sans code source.");
    }
  }

  return { ok: errors.length === 0, errors };
}

export const RESERVED_SLUGS: string[] = [
  "kinetic-type-01",
  "text-reveal-01",
  "elastic-text-01",
  "shape-morph-01",
  "staggered-cards-01",
  "logo-reveal-01",
  "minimal-saas-ui-01",
  "admin",
  "studio",
  "login",
  "explore",
  "preview",
  "new",
  "api",
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}

/**
 * Assainit une entrée externe (API/DB/localStorage) en CustomTemplate.
 * Retourne null si l'objet n'est pas cohérent — jamais d'exception.
 */
export function sanitizeCustomTemplate(input: unknown): CustomTemplate | null {
  try {
    if (typeof input !== "object" || input === null) return null;
    const raw = input as Record<string, unknown>;

    const sourceKind = raw.sourceKind === "code" ? "code" : raw.sourceKind === "component" ? "component" : null;
    if (!sourceKind) return null;

    const status = (["draft", "candidate", "published"] as const).find((s) => s === raw.status);
    if (!status) return null;

    const componentKey = typeof raw.componentKey === "string" && isComponentKey(raw.componentKey)
      ? (raw.componentKey as ComponentKey)
      : undefined;

    if (sourceKind === "component" && !componentKey) return null;

    const defaultConfig = componentKey
      ? sanitizeConfigByKey(componentKey, raw.defaultConfig)
      : typeof (raw.defaultConfig as AnimationConfig | undefined)?.text === "string"
        ? (raw.defaultConfig as AnimationConfig)
        : null;
    if (!defaultConfig) return null;

    const version = Number.isInteger(Number(raw.version)) && Number(raw.version) >= 1 ? Number(raw.version) : 1;

    return {
      id: typeof raw.id === "string" ? raw.id : "",
      slug: typeof raw.slug === "string" ? raw.slug.slice(0, 80) : "",
      name: typeof raw.name === "string" ? raw.name.slice(0, 120) : "",
      category: typeof raw.category === "string" ? raw.category : "text-motion",
      description: typeof raw.description === "string" ? raw.description.slice(0, 1000) : "",
      sourceKind,
      componentKey,
      code: sourceKind === "code" && typeof raw.code === "string" ? raw.code : undefined,
      defaultConfig,
      promptWeb: typeof raw.promptWeb === "string" ? raw.promptWeb : "",
      promptAfterEffects: typeof raw.promptAfterEffects === "string" ? raw.promptAfterEffects : "",
      version,
      status,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
      validation: (raw.validation as CodeValidationReport | undefined) ?? undefined,
    };
  } catch {
    return null;
  }
}

/** Métadonnées d'un template custom : type d'élément (compatibilité). */
export function customElementKind(template: CustomTemplate): string {
  if (template.sourceKind === "component" && template.componentKey) {
    return STUDIO_TEMPLATES[template.componentKey]?.elementKind ?? "text";
  }
  // Code source : pilotable par la timeline en Phase 2 ; par défaut, cards.
  return "cards";
}