import { validateTemplateCode } from "@/lib/templates/code-safety";
import { computeCodeCapabilities } from "@/lib/templates/capabilities";

/**
 * Animation sur mesure (créée par Claude via MCP, propre à un projet).
 *
 * Le code suit le même contrat que le Template Lab
 * (`window.__MGS_TIMELINE__ = { duration, outAt?, renderAt(time, params) }`) et
 * tourne dans le même bac à sable. Il déclare ses réglages (`fields`) : le
 * panneau de droite du Studio les affiche, et leurs valeurs arrivent dans
 * `params.fields` à chaque image. Le client retouche donc la vidéo sans code.
 */
export const CUSTOM_CODE_KEY = "custom-code";
export const CUSTOM_CODE_MAX = 60_000;

export type CustomFieldType = "text" | "color" | "number";

export interface CustomField {
  key: string;
  label: string;
  type: CustomFieldType;
  min?: number;
  max?: number;
  step?: number;
}

export interface CustomAnimation {
  code: string;
  /** Durée et sortie déclarées par le contrat (s). */
  duration: number;
  outAt?: number;
  fields: CustomField[];
}

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

export function sanitizeFields(input: unknown): CustomField[] {
  if (!Array.isArray(input)) return [];
  const out: CustomField[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, 24)) {
    if (typeof raw !== "object" || raw === null) continue;
    const f = raw as Record<string, unknown>;
    if (typeof f.key !== "string" || !KEY_RE.test(f.key) || seen.has(f.key)) continue;
    const type: CustomFieldType = f.type === "color" || f.type === "number" ? f.type : "text";
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    seen.add(f.key);
    out.push({
      key: f.key,
      label: typeof f.label === "string" && f.label.trim() ? f.label.trim().slice(0, 60) : f.key,
      type,
      ...(type === "number" && num(f.min) !== undefined ? { min: num(f.min) } : {}),
      ...(type === "number" && num(f.max) !== undefined ? { max: num(f.max) } : {}),
      ...(type === "number" && num(f.step) !== undefined ? { step: num(f.step) } : {}),
    });
  }
  return out;
}

/** Problèmes bloquants du code (sécurité + contrat déterministe) ; vide = accepté. */
export function customCodeProblems(code: string): string[] {
  if (code.length > CUSTOM_CODE_MAX) return [`Code trop long (${CUSTOM_CODE_MAX} caractères maximum).`];
  const safety = validateTemplateCode(code);
  const errors = safety.findings.filter((f) => f.level === "error").map((f) => f.message);
  const caps = computeCodeCapabilities(code);
  if (!caps.studioCompatible) errors.push(...caps.reasons);
  return errors;
}

/** Durée / sortie lues dans le contrat (`duration: 4.5`, `outAt: 3.7`). */
export function contractTimes(code: string): { duration: number; outAt?: number } {
  const duration = computeCodeCapabilities(code).contractDuration ?? 4;
  const m = code.match(/outAt\s*:\s*([0-9.]+)/);
  const outAt = m ? Number(m[1]) : NaN;
  return { duration, ...(Number.isFinite(outAt) && outAt > 0 && outAt < duration ? { outAt } : {}) };
}

/** Assainit une animation lue en base : null si le code n'est plus acceptable. */
export function sanitizeCustomAnimation(input: unknown): CustomAnimation | null {
  if (typeof input !== "object" || input === null) return null;
  const c = input as Record<string, unknown>;
  if (typeof c.code !== "string" || customCodeProblems(c.code).length > 0) return null;
  const times = contractTimes(c.code);
  return { code: c.code, ...times, fields: sanitizeFields(c.fields) };
}

/** Valeurs des réglages : uniquement les clés déclarées, texte ≤ 300 caractères ou nombre. */
export function sanitizeFieldValues(input: unknown, fields: CustomField[]): Record<string, string | number> {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const f of fields) {
    const v = raw[f.key];
    if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[f.key] = Math.min(f.max ?? 1e6, Math.max(f.min ?? -1e6, n));
    } else if (typeof v === "string") {
      out[f.key] = f.type === "color" ? (/^#[0-9a-fA-F]{3,8}$|^transparent$/.test(v) ? v : "#FFFFFF") : v.slice(0, 300);
    }
  }
  return out;
}
