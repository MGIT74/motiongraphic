
/**
 * Constantes/runtime partagées du sandbox — module NEUTRE (ni "use client",
 * ni "server-only") : importable depuis les deux graphes (route + composants).
 *
 * La CSP d'un iframe sandboxé ne peut PAS être appliquée via l'attribut
 * `csp` (retiré de la spec HTML, ignoré par Chromium). La CSP réelle est
 * délivrée en EN-TÊTE HTTP par la route `/sandbox/[id]` : le document y est
 * servi avec `default-src 'none'` (réseau, workers, images distantes
 * bloqués), et le sandbox attr `allow-scripts` sans `allow-same-origin`
 * garantit l'origine opaque (cookies/stockage/DOM parent inaccessibles).
 */

export interface SandboxParams {
  text: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  duration: number;
  speed: number;
  [key: string]: unknown;
}

export const SANDBOX_CSP_HEADER =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src 'none'; form-action 'none'; frame-ancestors 'self'; media-src 'none'; object-src 'none'; child-src 'none'; base-uri 'none'";

/** Alias historique (srcdoc : mode aperçu live de l'éditeur). */
export const SANDBOX_CSP_FALLBACK_HEADER = SANDBOX_CSP_HEADER;

/** Version META de la CSP (pour les documents srcdoc) : sans frame-ancestors. */
export const SANDBOX_CSP_META =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src 'none'; form-action 'none'; media-src 'none'; object-src 'none'; child-src 'none'; base-uri 'none'";

/** Prelude v2 : neutralisation + SEEK/ACK (sans balise script : l'hôte emball). */
const PRELUDE_V2_SOURCE = `
(function () {
  "use strict";
  var SESSION = window.__MGS_SESSION__;
  var metrics = { received: 0, ignored: 0, frames: 0, degraded: 0, errors: 0, neutered: [] };
  var lastSeekedT = 0;
  // Charge id du document : l'hôte distingue initialisation et pong (ping).
  var LOAD_ID = Math.random().toString(36).slice(2) + "-" + Math.floor(performance.now());

  function neuter(name, body) {
    Object.defineProperty(window, name, {
      value: body,
      writable: false,
      configurable: false,
    });
    metrics.neutered.push(name);
  }
  try {
    neuter("fetch", function () {
      return Promise.reject(new Error("RESEAU_BLOQUE (sandbox MotionGraphic)"));
    });
  } catch (e) { metrics.neutered.push("fetch:ERR"); }
  try {
    neuter("WebSocket", function () { throw new Error("RESEAU_BLOQUE (sandbox MotionGraphic)"); });
  } catch (e) { metrics.neutered.push("ws:ERR"); }
  try {
    neuter("EventSource", function () { throw new Error("RESEAU_BLOQUE (sandbox MotionGraphic)"); });
  } catch (e) { metrics.neutered.push("es:ERR"); }
  try {
    neuter("XMLHttpRequest", function () {
      this.open = function () {}; this.send = function () { throw new Error("RESEAU_BLOQUE (sandbox MotionGraphic)"); };
    });
  } catch (e) { metrics.neutered.push("xhr:ERR"); }
  try {
    neuter("eval", function () { throw new Error("EVAL_BLOQUE (sandbox MotionGraphic)"); });
  } catch (e) { metrics.neutered.push("eval:ERR"); }
  (function patchCreate() {
    var originalCreate = document.createElement.bind(document);
    document.createElement = function (tag) {
      var lower = String(tag).toLowerCase();
      if (lower === "script" || lower === "iframe" || lower === "embed" || lower === "object" || lower === "img" || lower === "link") {
        var neutral = originalCreate("span");
        neutral.setAttribute("data-mgsi-blocked", lower);
        return neutral;
      }
      return originalCreate(tag);
    };
  })();
  try { document.write = function () {}; document.close = function () {}; } catch (e) {}

  function post(message) {
    message.session = SESSION;
    try { window.parent.postMessage(message, "*"); } catch (e) { metrics.errors++; }
  }
  // Boîte englobante du contenu visible (fractions 0..1 du cadre) : sert à la sélection sur le canvas.
  function measureBox() {
    try {
      var W = window.innerWidth, H = window.innerHeight;
      if (!W || !H) return null;
      var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      var nodes = document.body.getElementsByTagName("*");
      var n = Math.min(nodes.length, 700);
      for (var i = 0; i < n; i++) {
        var el = nodes[i];
        var tag = String(el.tagName).toLowerCase();
        if (tag === "script" || tag === "style") continue;
        var counts = tag === "svg" || tag === "canvas" || tag === "video" || tag === "img";
        if (!counts) {
          for (var c = 0; c < el.childNodes.length; c++) {
            var node = el.childNodes[c];
            if (node.nodeType === 3 && String(node.textContent || "").replace(/\\s+/g, "") !== "") { counts = true; break; }
          }
        }
        if (!counts) {
          var cs = getComputedStyle(el);
          var bg = cs.backgroundColor;
          if ((bg && bg !== "transparent" && bg.indexOf("rgba(0, 0, 0, 0)") !== 0) || (cs.backgroundImage && cs.backgroundImage !== "none")) counts = true;
        }
        if (!counts) continue;
        var rc = el.getBoundingClientRect();
        if (rc.width < 1 || rc.height < 1) continue;
        if (rc.width >= W * 0.94 && rc.height >= H * 0.94) continue;
        l = Math.min(l, rc.left); t = Math.min(t, rc.top); r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
      }
      if (!isFinite(l) || r - l < 2 || b - t < 2) return null;
      return { l: Math.max(0, l / W), t: Math.max(0, t / H), r: Math.min(1, r / W), b: Math.min(1, b / H) };
    } catch (e) { return null; }
  }
  function nextTick(cb) {
    // Le rendu d'un calque doit suivre renderAt SANS dépendre de rAF (les
    // iframes opaques peuvent être étranglées par le compositing Chromium) :
    // renderAt est synchrone (contrat), l'ack part juste après.
    Promise.resolve().then(function () { cb(); });
  }
  function applyParams(params) {
    window.MGSI_CONFIG = params || {};
    try { window.dispatchEvent(new CustomEvent("mgsi:configchange", { detail: params })); } catch (e) {}
  }
  function postReady() {
    var contract = window.__MGS_TIMELINE__;
    post({
      type: "mgsi:ready",
      loadId: LOAD_ID,
      mode: contract && typeof contract.renderAt === "function" ? "timeline" : "free",
      duration: contract ? Number(contract.duration) || 0 : 0,
      outAt: contract && Number(contract.outAt) > 0 ? Number(contract.outAt) : undefined,
      metrics: metrics,
    });
  }
  function handleSeek(data) {
    lastSeekedT = data.t;
    var contract = window.__MGS_TIMELINE__;
    if (!contract || typeof contract.renderAt !== "function") {
      post({ type: "mgsi:error", code: "CONTRACT_MISSING" });
      metrics.degraded++;
      nextTick(function () {
        post({ type: "mgsi:frame", seq: data.id, t: data.t, degraded: true });
      });
      return;
    }
    var contractDuration = Number(contract.duration) || 0;
    var t = contractDuration > 0 ? Math.max(0, Math.min(contractDuration, data.t)) : Math.max(0, data.t);
    Promise.resolve()
      .then(function () { return contract.renderAt(t, window.MGSI_CONFIG || {}); })
      .then(function () {
        nextTick(function () { post({ type: "mgsi:frame", seq: data.id, t: t, metrics: metrics, bbox: measureBox() }); });
      }, function (err) {
        metrics.errors++;
        post({ type: "mgsi:error", seq: data.id, message: String(err && err.message || err) });
        nextTick(function () { post({ type: "mgsi:frame", seq: data.id, t: t, degraded: true, metrics: metrics }); });
      });
  }
  window.addEventListener("message", function (message) {
    var data = message && message.data;
    metrics.received++;
    if (!data || typeof data !== "object" || data.session !== SESSION || typeof data.type !== "string") {
      metrics.ignored++;
      // Journalisé vers l'hôte : le compteur des messages hostiles reste à jour
      // côté Studio (les tests lit ignored).
      post({ type: "mgsi:metrics", metrics: metrics });
      return;
    }
    if (data.type === "mgsi:ping") {
      postReady();
      return;
    }
    if (data.type === "mgsi:seek" && typeof data.t === "number" && typeof data.id !== "undefined") {
      handleSeek(data);
    } else if (data.type === "mgsi:set_params" && data.params && typeof data.params === "object") {
      // Params appliqués PUIS re-rendu du dernier instant demandé : l'ack
      // porte l'IMAGE rendue avec les paramètres FRAIS (aucun aller-retour
      // séparé) — cohérence garanti pour le Studio et l'export MP4.
      applyParams(data.params);
      var contract = window.__MGS_TIMELINE__;
      var tNow = lastSeekedT;
      if (contract && typeof contract.renderAt === "function") {
        var contractDuration = Number(contract.duration) || 0;
        tNow = contractDuration > 0 ? Math.max(0, Math.min(contractDuration, tNow)) : Math.max(0, tNow);
        Promise.resolve()
          .then(function () { return contract.renderAt(tNow, window.MGSI_CONFIG || {}); })
          .then(function () {
            nextTick(function () { post({ type: "mgsi:frame", seq: data.id, t: tNow, metrics: metrics, bbox: measureBox() }); });
          }, function (err) {
            metrics.errors++;
            post({ type: "mgsi:error", seq: data.id, message: String(err && err.message || err) });
            nextTick(function () { post({ type: "mgsi:frame", seq: data.id, t: tNow, degraded: true, metrics: metrics }); });
          });
      } else {
        nextTick(function () { post({ type: "mgsi:frame", seq: data.id, t: tNow, metrics: metrics, bbox: measureBox() }); });
      }
    } else {
      metrics.ignored++;
    }
  });
  window.addEventListener("load", postReady);
})();
`;

/**
 * Document sandboxé (protocole v2) :
 * - session + params initiaux inline (premier rendu immédiat) ;
 * - prelude : neutralisation réseau/eval/img + SEEK/ACK + postMessage ;
 * - le code utilisateur est escapé (aucun `</script>` prématuré).
 */
export function buildSandboxDocumentV2(
  code: string,
  sessionId: string,
  params?: SandboxParams
): string {
  const sessionJson = JSON.stringify(sessionId);
  const paramsJson = params ? JSON.stringify(params).replace(/</g, "\\u003c") : "undefined";
  const safeCode = code.replace(/<\/script/gi, "<\\/script");
  return [
    '<!doctype html><html><head><meta charset="utf-8" /><meta name="referrer" content="no-referrer" />',
    // CSP RÉELLE : Chromium ignore l'attribut csp des iframes ; en srcdoc, la
    // <meta http-equiv> EST appliquée. (La route l'ajoute aussi en en-tête.)
    `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP_META}">`,
    "<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}*{box-sizing:border-box}</style>",
    "<script>window.__MGS_SESSION__ = " + sessionJson + ";</script>",
    params ? "<script>window.MGSI_CONFIG = " + paramsJson + ";</script>" : "",
    "<script>" + PRELUDE_V2_SOURCE.replace(/<\/script/gi, "<\\/script") + "</script>",
    "</head><body>",
    "<script>" + safeCode + "</script>",
    "</body></html>",
  ].join("");
}