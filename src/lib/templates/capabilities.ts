/**
 * Capacités d'un template personnalisé « code » — calculées à la lecture
 * (pas stockées : toujours à jour), conformément à
 * docs/template-lab-studio-pipeline.md.
 *
 * - `studioCompatible` : le code déclare le contrat déterministe
 *   `window.__MGS_TIMELINE__ = { duration, renderAt(time, params) }` et ne
 *   contient aucune source de nondéterminisme → le Studio est MAÎTRE du temps.
 * - `exportCompatible` : éligible à la capture MP4 image par image.
 */
export interface TemplateCapabilities {
  studioCompatible: boolean;
  exportCompatible: boolean;
  /** Raisons d'incompatibilité, affichées à l'administrateur. */
  reasons: string[];
  /** Durée déclarée par le contrat (si présente et exploitable). */
  contractDuration?: number;
}

/** Motifs du contrat déterministe — requis pour la timeline. */
const CONTRACT_RE = /renderAt\s*[:=(]|__MGS_TIMELINE__/;

/** Sources de nondéterminisme : rendement selon le temps réel, pas absolu. */
const HAZARDS: { re: RegExp; reason: string }[] = [
  { re: /\bsetTimeout\s*\(/, reason: "setTimeout (temps réel ≠ timeline) — rendez chaque image depuis renderAt(time)." },
  { re: /\bsetInterval\s*\(/, reason: "setInterval (temps réel ≠ timeline) — pareil : renderAt(time)." },
  { re: /\brequestAnimationFrame\b/, reason: "requestAnimationFrame — l'image doit venir de renderAt(time), pas d'une boucle." },
  { re: /\bDate\.now\b|\bnew\s+Date\s*\(|\bperformance\.now\b/, reason: "Horloge réelle (Date.now/new Date) — utilisez le temps passé à renderAt." },
  { re: /\bMath\.random\b/, reason: "Math.random (non déterministe) — précalcul avec semence fixe." },
  { re: /\bfetch\s*\b|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/, reason: "Appel réseau interdit dans le bac à sable." },
  { re: /@keyframes\b|animation\s*:[^;]+s|animation-delay/, reason: "Animation CSS (temps implicite) — passez par un rendu calculé depuis renderAt." },
];

export function computeCodeCapabilities(code: string): TemplateCapabilities {
  const reasons: string[] = [];
  const hasContract = CONTRACT_RE.test(code);
  if (!hasContract) {
    reasons.push("Contrat manquant : déclarez `window.__MGS_TIMELINE__ = { duration, renderAt(time, params) }`.");
  }
  for (const { re, reason } of HAZARDS) {
    if (re.test(code)) reasons.push(reason);
  }

  let contractDuration: number | undefined;
  const durationMatch =
    code.match(/__MGS_TIMELINE__[\s\S]{0,220}?duration\s*:\s*([0-9.]+)/) ??
    code.match(/duration\s*:\s*([0-9.]+)[\s\S]{0,220}?renderAt/);
  if (durationMatch) {
    const parsed = Number(durationMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 600) contractDuration = parsed;
  }

  const compatible = hasContract && reasons.length === 0;
  return {
    studioCompatible: compatible,
    exportCompatible: compatible,
    reasons,
    contractDuration,
  };
}