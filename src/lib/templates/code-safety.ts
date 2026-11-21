/** Validateur statique du code d'animation (Template Lab et animations sur mesure de Claude). */

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
