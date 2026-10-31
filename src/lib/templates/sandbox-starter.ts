/**
 * Code de départ pour l'éditeur "code source" du Template Lab.
 * Implémente le contrat du bac à sable : lire window.MGSI_CONFIG et
 * écouter "mgsi:configchange" (config) / "mgsi:replay" (relance).
 * Le code tourne dans un iframe sandbox="allow-scripts" (origine nulle).
 */
export function SANDBOX_STARTER_CODE(title: string): string {
  return [
    "// MotionGraphic — template bac à sable",
    `// ${title} : exemple de base conforme au contrat MGSI_CONFIG.`,
    "// - window.MGSI_CONFIG : config actuelle (text, primaryColor, accentColor,",
    "//   backgroundColor, duration, speed)",
    '// - événement "mgsi:configchange" : appliquée à chaque modification',
    '// - événement "mgsi:replay" : relance demandée par l\'utilisateur',
    "",
    "(function () {",
    '  var root = document.createElement("div");',
    "  root.style.cssText =",
    '    "position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;overflow:hidden";',
    "  document.body.appendChild(root);",
    "",
    "  function render() {",
    "    var cfg = window.MGSI_CONFIG || {};",
    "    var text = cfg.text || \"MOTION\";",
    "    root.style.background = cfg.backgroundColor || \"#000\";",
    '    root.innerHTML = "";',
    "    text.split(\"\").forEach(function (ch, i) {",
    '      var span = document.createElement("span");',
    "      span.textContent = ch;",
    "      span.style.cssText =",
    "        \"display:inline-block;margin:0 0.02em;font-size:clamp(24px,7vw,72px);\" +",
    '        "font-weight:800;color:" + (i % 3 === 1 ? (cfg.accentColor || "#0A84FF") : (cfg.primaryColor || "#F5F5F7"));',
    "      root.appendChild(span);",
    "    });",
    "  }",
    "",
    "  window.addEventListener(\"mgsi:configchange\", render);",
    "  window.addEventListener(\"mgsi:replay\", function () { render(); });",
    "  render();",
    "})();",
  ].join("\n");
}

/** Contrat documenté (utilisé par l'éditeur et le site public). */
export const SANDBOX_CONTRACT_DOC = [
  "window.MGSI_CONFIG = { text, primaryColor, accentColor, backgroundColor, duration, speed }",
  'window.addEventListener("mgsi:configchange", (e) => render(e.detail))',
  'window.addEventListener("mgsi:replay", () => render(window.MGSI_CONFIG))',
].join("\n");