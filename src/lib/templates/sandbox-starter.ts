/**
 * Codes de départ pour l'éditeur « code source » du Template Lab.
 *
 * - `SANDBOX_STARTER_CODE` : modèle LIBRE (lecture/écriture événements
 *   mgsi:configchange) — incompatible avec la timeline (pas de contrat).
 * - `SANDBOX_TIMELINE_STARTER_CODE` : modèle TIMELINE-COMPATIBLE —
 *   `window.__MGS_TIMELINE__ = { duration, renderer: renderAt(time, params) }` :
 *   rendu DÉTERMINISTE piloté par le Studio (SEEK) et exporté en MP4.
 *
 * Les deux tournent dans un iframe sandbox="allow-scripts" + CSP
 * `default-src 'none'` (origine opaque : réseau/stockage/parent interdits).
 */

/** Modèle libre (non pilotable par la timeline) — affichage continu. */
export function SANDBOX_STARTER_CODE(title: string): string {
  return [
    "// MotionGraphic — template bac à sable (modèle libre)",
    `// ${title} — NOTE modèle libre : PAS compatible timeline/MP4.`,
    "// Pour la timeline, partez du modèle « renderAt » (bouton dédié).",
    "",
    "(function () {",
    '  var root = document.createElement("div");',
    "  root.style.cssText =",
    '    "position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;overflow:hidden;font-synthesis:none";',
    "  document.body.appendChild(root);",
    "",
    "  var lastText = null;",
    "  function render() {",
    "    var cfg = window.MGSI_CONFIG || {};",
    "    var text = cfg.text || \"MOTION\";",
    '    if (text === lastText) return;',
    "    lastText = text;",
    "    root.style.background = cfg.backgroundColor || \"#000\";",
    '    root.innerHTML = "";',
    "    text.split(\"\").forEach(function (ch, i) {",
    '      var span = document.createElement("span");',
    "      span.textContent = ch;",
    "      span.style.cssText =",
    "        \"display:inline-block;margin:0 0.02em;font-size:clamp(24px,7vw,72px);font-weight:800;\" +",
    '        "color:" + (i % 3 === 1 ? (cfg.accentColor || "#A1A1AA") : (cfg.primaryColor || "#F5F5F7"));',
    "      root.appendChild(span);",
    "    });",
    "  }",
    "  window.addEventListener(\"mgsi:configchange\", render);",
    '  window.addEventListener("mgsi:replay", function () { lastText = null; render(); });',
    "  render();",
    "})();",
  ].join("\n");
}

/**
 * Modèle TIMELINE-COMPATIBLE : renderAt(time, params) déterministe —
 * le Studio est maître du temps (SEEK image par image, export MP4 exact).
 */
export function SANDBOX_TIMELINE_STARTER_CODE(title: string): string {
  return [
    "// MotionGraphic — template bac à sable (CONTRAT TIMELINE : déterministe)",
    `// ${title}`,
    "// - renderAt(time, params) calcule TOUTE l'image depuis le temps t :",
    "//   pas de boucle (setTimeout/rAF), pas d'horloge (Date.now), pas de Math.random.",
    '// - outAt: début de la sortie (optionnel) -> timing "fit"/"hold" du Studio.',
    "",
    "window.__MGS_TIMELINE__ = {",
    "  duration: 3,",
    "  outAt: 2.4,",
    "  renderAt: function (time, params) {",
    '    var text = (params.text || "MOTION");',
    "    var accent = params.accentColor || \"#A1A1AA\";",
    "    var ink = params.primaryColor || \"#F5F5F7\";",
    "    var root = document.getElementById(\"stage\") || createStage();",
    "    root.style.background = params.backgroundColor || \"#000\";",
    "    var letters = text.split(\"\");",
    "    var n = letters.length;",
    "    var inEach = 0.5;            // entree : 0.5 s par lettre, en cascade",
    "    var hold = (this.outAt || this.duration * 0.8);",
    "",
    '    if (root.childNodes.length !== n) {',
    '      root.innerHTML = "";',
    "      for (var i = 0; i < n; i++) {",
    '        var span = document.createElement("span");',
    '        span.dataset.i = String(i);',
    "        span.style.cssText =",
    '          "display:inline-block;font-weight:800;font-size:clamp(24px,6.4vw,72px);margin:0 0.015em;"',
    "        root.appendChild(span);",
    "      }",
    "    }",
    "    for (var i = 0; i < n; i++) {",
    "      var span = root.children[i];",
    "      var dt = time - i * 0.07;              // décalage séquentiel",
    "      var inOut = 0;",
    "      if (dt >= inEach || i === n - 1 && dt >= inEach) inOut = 1;",
    "      else if (dt > 0) inOut = Math.min(1, dt / inEach);",
    "      var exit = 0;",
    '      var exitStart = hold - i * 0.05;',
    "      if (time >= exitStart) exit = Math.min(1, (time - exitStart) / 0.5);",
    "      var y = (1 - inOut) * 40 - exit * 40;",
    "      span.textContent = letters[i] === \" \" ? \"\\u00A0\" : letters[i];",
    "      span.style.transform = \"translateY(\" + y + \")\";",
    "      span.style.opacity = String(Math.max(0, Math.min(inOut - exit, 1)));",
    "      span.style.color = i % 3 === 1 ? accent : ink;",
    "    }",
    "  },",
    "};",
    "",
    "function createStage() {",
    '  var el = document.createElement("div");',
    '  el.id = "stage";',
    "  el.style.cssText =",
    '    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden";',
    "  document.body.appendChild(el);",
    "  return el;",
    "}",
  ].join("\n");
}