import type { AnimationConfig } from "@/types/animation";
import { makeDefaultProject } from "@/lib/studio/project-model";

/**
 * Fixture de test du pipeline sandbox → timeline → MP4.
 * Source UNIQUE du code du template « code » de démonstration :
 * - seed du store démo (Template Lab),
 * - page /dev/render-stage (export MP4 de test),
 * - pages /dev/template-check et /dev/sandbox-check.
 * Aucun secret, aucun serveur requis (constantes déterministes).
 */

import { SANDBOX_TIMELINE_STARTER_CODE } from "@/lib/templates/sandbox-starter";

const SANDBOX_TIMELINE_PROBE_BASE = SANDBOX_TIMELINE_STARTER_CODE("Probe Sandbox");

export const PULSE_GRID_CODE = [
  "// MotionGraphic — Pulse Grid (contrat TIMELINE : renderAt déterministe)",
  "window.__MGS_TIMELINE__ = {",
  "  duration: 2,",
  "  outAt: 1.7,",
  "  renderAt: function (time, params) {",
    '  var stage = document.getElementById("stage") || createStage();',
  "    stage.style.background = params.backgroundColor || '#000';",
    '    if (!stage.dataset.built) { stage.innerHTML = "";',
    '      for (var y = 0; y < 5; y++) for (var x = 0; x < 8; x++) {',
    '        var dot = document.createElement("span"); dot.className = "dot" + x + "-" + y;',
    '        dot.style.cssText = "position:absolute;width:3.4%;padding-bottom:3.4%;border-radius:50%;left:" + (7 + x * 11) + "%;top:" + (10 + y * 17) + "%;";',
    "        stage.appendChild(dot);",
    "      }",
    '      stage.dataset.built = "1";',
    "    }",
    "    var accent = params.accentColor || '#0A84FF';",
    "    var ink = params.primaryColor || '#F5F5F7';",
    "    for (var y = 0; y < 5; y++) for (var x = 0; x < 8; x++) {",
    '      var d = stage.querySelector(".dot" + x + "-" + y);',
    "      var phase = Math.sin(time * 3.1 + x * 0.6 + y * 0.9) * 0.5 + 0.5;",
    "      var intro = Math.min(1, time / 0.4);",
    "      var exitStart = this.outAt;",
    "      var exit = time < exitStart ? 0 : Math.min(1, (time - exitStart) / 0.3);",
    "      var scale = (0.4 + phase * 0.9) * intro;",
    "      d.style.transform = 'scale(' + scale + ')';",
    "      d.style.opacity = String(Math.max(0, intro - exit) * (0.25 + phase * 0.75));",
    "      d.style.background = (x + y) % 2 === 0 ? accent : ink;",
    "    }",
  "  },",
  "};",
  "function createStage() {",
    '  var el = document.createElement("div"); el.id = "stage";',
    '  el.style.cssText = "position:absolute;inset:0;overflow:hidden";',
  "  document.body.appendChild(el); return el;",
  "}",
].join("\n");

/** Cas de test : contrat DÉCLARÉ mais renderAt en échec à l'exécution
 * (capabilities statiques = compatible ; le runtime/export doit refuser). */
export const BROKEN_TEMPLATE = {
  id: "00000000-0000-4000-8000-000000000098",
  slug: "broken-code-test",
  name: "Broken Code",
  category: "ui-motion",
  description: "Cas de test (candidate) : renderAt échoue à l'exécution.",
  sourceKind: "code",
  code: [
    "window.__MGS_TIMELINE__ = {",
    "  duration: 1,",
    "  renderAt: function () {",
    "    throw new Error('BUG_RENDU (test)');",
    "  },",
    "};",
  ].join("\n"),
  defaultConfig: {
    text: "BROKEN",
    primaryColor: "#F5F5F7",
    accentColor: "#0A84FF",
    backgroundColor: "#000000",
    duration: 1,
    speed: 1,
  } as AnimationConfig,
  promptWeb: "",
  promptAfterEffects: "",
  version: 1,
  status: "candidate",
} as const;

export const PULSE_GRID_TEMPLATE_ID = "b0000000-0000-4000-8000-000000000022";
export const PULSE_GRID_TEMPLATE_DEFAULT_CONFIG = {
  text: "PULSE",
  primaryColor: "#F5F5F7",
  accentColor: "#0A84FF",
  backgroundColor: "#000000",
  duration: 2,
  speed: 1,
} as const satisfies AnimationConfig;


/** Template de PROBE de sécurité (NE JAMAIS publier : statut candidate) :
 * contrat timeline + sonde de bornes (réseau/stockage/parent/eval). */
export const SANDBOX_PROBE_CODE = SANDBOX_TIMELINE_PROBE_BASE + "\n" + [
  "window.addEventListener(\"message\", function (message) {",
  "  var data = message && message.data;",
  "  if (data && data.type === \"mgsi:probe\" && data.session === window.__MGS_SESSION__) {",
  "    var results = { networkBlocked: false, networkDetail: \"\", storageBlocked: false, storageDetail: \"\", topOpaque: false, evalBlocked: false };",
  "    try {",
  "      window.fetch(\"https://example.com/ping\").then(function () { results.networkBlocked = false; results.networkDetail = \"fetch autorisé (?!)\"; },",
  "        function (err) { results.networkBlocked = true; results.networkDetail = err && err.message ? String(err.message).slice(0, 60) : \"bloqué\"; });",
  "    } catch (err) { results.networkBlocked = true; results.networkDetail = \"throw\"; }",
  "    try { window.localStorage.setItem(\"mgsi\", \"1\"); results.storageDetail = \"localStorage accessible (?!)\"; }",
  "    catch (err) { results.storageBlocked = true; results.storageDetail = err && err.name ? String(err.name) : \"bloqué\"; }",
  "    try { var topDoc = window.top.document; results.topOpaque = Boolean(topDoc) === false; } catch (err) { results.topOpaque = true; }",
  "    try { window.eval(\"1+1\"); } catch (err) { results.evalBlocked = true; }",
  "    setTimeout(function () {",
  "      window.parent.postMessage({ type: \"mgsi:bounds\", session: window.__MGS_SESSION__, results: results }, \"*\");",
  "    }, 150);",
  "  }",
  "});",
].join("\n");

export const SANDBOX_PROBE_TEMPLATE = {
  id: "00000000-0000-4000-8000-000000000099",
  slug: "sandbox-check-probe",
  name: "Sandbox Check Probe",
  category: "ui-motion",
  description: "Sonde de tests (réseau/stockage/parent/eval) — JAMAIS publiée (candidate).",
  sourceKind: "code",
  code: SANDBOX_PROBE_CODE,
  defaultConfig: {
    text: "PROBE",
    primaryColor: "#F5F5F7",
    accentColor: "#0A84FF",
    backgroundColor: "#000000",
    duration: 3,
    speed: 1,
  } as AnimationConfig,
  promptWeb: "",
  promptAfterEffects: "",
  version: 1,
  status: "candidate",
} as const;

/** Modèle LIBRE publié (sans contrat renderAt) : masqué de la bibliothèque
 * Studio, diagnosable au Template Lab, export MP4 refusé. */
export const FREE_CODE_TEMPLATE = {
  id: "00000000-0000-4000-8000-000000000097",
  slug: "free-code-demo",
  name: "Free Code (non pilotable)",
  category: "ui-motion",
  description: "Template libre sans contrat renderAt(time) : visible au catalogue mais masqué de la timeline.",
  sourceKind: "code",
  code: [
    "// sans contrat __MGS_TIMELINE__ : jamais pilotable",
    "(function () {",
    '  var el = document.createElement("div");',
    "  el.style.cssText = \"position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(24px,6vw,64px);color:#F5F5F7\";",
    "  var render = function () { el.textContent = (window.MGSI_CONFIG || {}).text || \"MOTION\"; };",
    "  window.addEventListener(\"mgsi:configchange\", render);",
    "  document.body.appendChild(el);",
    "  render();",
    "})();",
  ].join("\n"),
  defaultConfig: {
    text: "LIBRE",
    primaryColor: "#F5F5F7",
    accentColor: "#0A84FF",
    backgroundColor: "#000000",
    duration: 3,
    speed: 1,
  } as AnimationConfig,
  promptWeb: "",
  promptAfterEffects: "",
  version: 1,
  status: "published",
} as const;

export const PULSE_GRID_TEMPLATE = {
  id: "b0000000-0000-4000-8000-000000000022",
  slug: "pulse-grid-demo",
  name: "Pulse Grid (démo code)",
  category: "ui-motion",
  description:
    "Template de démonstration « code source » conforme au contrat déterministe renderAt(time) : piloté par la timeline du Studio, exportable en MP4.",
  sourceKind: "code",
  code: PULSE_GRID_CODE,
  defaultConfig: PULSE_GRID_TEMPLATE_DEFAULT_CONFIG as AnimationConfig,
  promptWeb:
    "Tu es un développeur créatif expert en HTML/CSS/JS.\n\nOBJECTIF\nGrille 8×5 de points pulsés (sinusoïde en cascade), fond #000000, accent #0A84FF.\n\nCONTRAT DÉTERMINISTE\n- window.__MGS_TIMELINE__ = { duration: 2, outAt: 1.7, renderAt(time, params) }\n- renderAt calcule TOUTE l'image depuis time (pas de setTimeout/rAF/Math.random/CSS animation)\n\nCONTRAINTES\n- Bac à sable (pas de réseau/stockage) ; 60 fps.",
  promptAfterEffects:
    "Tu es un expert ExtendScript (JSX) pour Adobe After Effects.\n\nMISSION\nCompo « MGSI_PulseGrid » (1080×1080, 30 fps, 2 s, fond #000000) : 40 pastilles pulsées (sin en cascade), entrée 0,4 s, sortie 0,3 s. Idempotent, préfixe MGSI_, sans plugins.",
  version: 1,
  status: "published",
} as const;

/** Projet d'export de test : texte intégré + template code (sandbox), durée 2 s. */
export function buildSandboxExportProject({
  width = 1920,
  height = 1080,
}: {
  width?: number;
  height?: number;
} = {}): import("@/lib/studio/project-model").StudioProject {
  const project = makeDefaultProject("Export test sandbox", { deterministic: true });
  return {
    ...project,
    width,
    height,
    scenes: [
      {
        id: "scene-exp-1",
        name: "Pulse",
        duration: 2,
        elements: [
          {
            id: "element-pulse-1",
            label: "Pulse Grid",
            kind: "cards",
            templateKey: "pulse-grid-demo",
            start: 0,
            duration: 2,
            config: { ...PULSE_GRID_TEMPLATE.defaultConfig },
            x: 50,
            y: 50,
            scale: 1,
          },
        ],
      },
    ],
  };
}