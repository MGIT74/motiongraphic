/** Templates texte qui lisent taille / interligne / espacements (config.fontSize, lineHeight…). */
export const TYPO_TEMPLATES = ["kinetic-type-01", "elastic-text-01", "text-reveal-01"];

/** Templates intégrés : les autres sont des templates en code (Template Lab), qui lisent aussi ces réglages. */
export const BUILTIN_TEMPLATES = [
  "kinetic-type-01",
  "text-reveal-01",
  "elastic-text-01",
  "shape-morph-01",
  "staggered-cards-01",
  "logo-reveal-01",
  "minimal-saas-ui-01",
];

/** Vrai si la taille de police (config.fontSize) pilote ce template : les poignées du canvas changent alors la police, pas l'échelle. */
export function supportsFontSize(templateKey: string, kind: string): boolean {
  if (kind === "media") return false;
  return TYPO_TEMPLATES.includes(templateKey) || !BUILTIN_TEMPLATES.includes(templateKey);
}
