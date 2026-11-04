"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runtime de bac à sable déterministe pour les templates « code ».
 *
 * CONTRAT (starter code + docs/template-lab-studio-pipeline.md) :
 *   window.__MGS_TIMELINE__ = {
 *     duration: <secondes>,
 *     outAt?:   <secondes>,                 // début de sortie (timing fit/hold)
 *     renderAt: function (time, params) {}  // rendu DÉTERMINISTE
 *   }
 *
 * - Le Studio est MAÎTRE DU TEMPS : SEEK(t) → l'iframe rend puis répond
 *   FRAME_READY(t, seq). Lecture = SEEKing image par image (aucune boucle).
 * - Sécurité : iframe sandbox="allow-scripts" + CSP via attribut `csp`
 *   (réseau/stockage/canvas cross-origin interdits), origine opaque,
 *   session identifiée, messages hostiles ignorés + comptés, quotas.
 */

/* ------------------------------------------------------------------ */
/* Acks partagés (le rendu MP4 attend ces promesses)                   */
/* ------------------------------------------------------------------ */

/** Promesses d'attente des FRAME_READY — consommées par /render (RenderStage). */
export const pendingCodeWaits = new Set<Promise<void>>();

// Quotas : iframes sandboxées simultanées (timeline vs vignettes/aperçus).
const MAX_SANDBOX_FRAMES = 8;
const MAX_SANDBOX_PREVIEWS = 4;
let activeSandboxFrames = 0;
let activeSandboxPreviews = 0;
function sandboxQuotaExceeded(preview: boolean): boolean {
  return preview ? activeSandboxPreviews >= MAX_SANDBOX_PREVIEWS : activeSandboxFrames >= MAX_SANDBOX_FRAMES;
}

/* ------------------------------------------------------------------ */
/* Métriques exposées côté hôte (tests sécurité/déterminisme)          */
/* ------------------------------------------------------------------ */

export interface SandboxHostMetrics {
  received: number;
  ignored: number;
  frames: number;
  degraded: number;
  errors: number;
}

const METRICS_KEY = "__MGS_HOST_METRICS__";
export function metricsFor(sessionId: string): SandboxHostMetrics {
  const holder = window as unknown as Record<string, Record<string, SandboxHostMetrics>>;
  holder[METRICS_KEY] ??= {};
  holder[METRICS_KEY][sessionId] ??= { received: 0, ignored: 0, frames: 0, degraded: 0, errors: 0 };
  return holder[METRICS_KEY][sessionId];
}

/* ------------------------------------------------------------------ */
/* Document sandboxé (protocole v2)                                    */
/* ------------------------------------------------------------------ */

export interface SandboxParams {
  text: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  duration: number;
  speed: number;
  [key: string]: unknown;
}

/** Prelude (sans balise script : l'hôte l'emballl lui-même). */
// Neutralisation au calquage : Chrome ignore l'attribut csp des iframes
// (spec retirée) -> le prelude remplace les fonctions réseau/eval avant tout
// code utilisateur (Propriétés non réinscriptibles). Les accès via <img>/<script>
// injectés sont interceptés dans document.createElement.
const PRELUDE_V2_SOURCE = `
(function () {
  "use strict";
  var SESSION = window.__MGS_SESSION__;
  var metrics = { received: 0, ignored: 0, frames: 0, degraded: 0, errors: 0, neutered: [] };

  function neuter(name, body) {
    Object.defineProperty(window, name, {
      value: body,
      writable: false,
      configurable: false,
    });
    metrics.neutered.push(name);
  }
  try {
    neuter("fetch", function () { throw new Error("RESEAU_BLOQUE (sandbox MotionGraphic)"); });
  } catch (e) { metrics.neutered.push("fetch:ERR:" + (e && e.message)); }
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
  } catch (e) { metrics.neutered.push("eval:ERR:" + (e && e.message).slice(0, 40)); }
  (function patchCreate() {
    var originalCreate = document.createElement.bind(document);
    document.createElement = function (tag) {
      var lower = String(tag).toLowerCase();
      if (lower === "script" || lower === "iframe" || lower === "embed" || lower === "object") {
        var neutral = originalCreate("span");
        neutral.setAttribute("data-mgsi-blocked", lower);
        return neutral;
      }
      if (lower === "img" || lower === "link") {
        var neutralImg = originalCreate("span");
        neutralImg.setAttribute("data-mgsi-blocked", lower);
        return neutralImg;
      }
      return originalCreate(tag);
    };
  })();
  try { document.write = function () {}; document.close = function () {}; } catch (e) {}
  function post(message) {
    message.session = SESSION;
    try { window.parent.postMessage(message, "*"); } catch (e) { metrics.errors++; }
  }
  function nextTwoFrames(cb) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { cb(); }); });
  }
  function applyParams(params) {
    window.MGSI_CONFIG = params || {};
    try { window.dispatchEvent(new CustomEvent("mgsi:configchange", { detail: params })); } catch (e) {}
  }
  function postReady() {
    var contract = window.__MGS_TIMELINE__;
    post({
      type: "mgsi:ready",
      mode: contract && typeof contract.renderAt === "function" ? "timeline" : "free",
      duration: contract ? Number(contract.duration) || 0 : 0,
      outAt: contract && Number(contract.outAt) > 0 ? Number(contract.outAt) : undefined,
      metrics: metrics,
    });
  }
  function handleSeek(data) {
    var contract = window.__MGS_TIMELINE__;
    if (!contract || typeof contract.renderAt !== "function") {
      post({ type: "mgsi:error", code: "CONTRACT_MISSING" });
      metrics.degraded++;
      nextTwoFrames(function () {
        post({ type: "mgsi:frame", seq: data.id, t: data.t, degraded: true });
      });
      return;
    }
    var contractDuration = Number(contract.duration) || 0;
    var t = contractDuration > 0 ? Math.max(0, Math.min(contractDuration, data.t)) : Math.max(0, data.t);
    Promise.resolve()
      .then(function () { return contract.renderAt(t, window.MGSI_CONFIG || {}); })
      .then(function () {
        nextTwoFrames(function () { post({ type: "mgsi:frame", seq: data.id, t: t, metrics: metrics }); });
      }, function (err) {
        metrics.errors++;
        post({ type: "mgsi:error", seq: data.id, message: String(err && err.message || err) });
        nextTwoFrames(function () { post({ type: "mgsi:frame", seq: data.id, t: t, degraded: true, metrics: metrics }); });
      });
  }
  window.addEventListener("message", function (message) {
    var data = message && message.data;
    metrics.received++;
    if (!data || typeof data !== "object" || data.session !== SESSION || typeof data.type !== "string") {
      metrics.ignored++;
      return;
    }
    if (data.type === "mgsi:ping") {
      postReady();
      return;
    }
    if (data.type === "mgsi:seek" && typeof data.t === "number" && typeof data.id !== "undefined") {
      handleSeek(data);
    } else if (data.type === "mgsi:set_params" && data.params && typeof data.params === "object") {
      applyParams(data.params);
      nextTwoFrames(function () { post({ type: "mgsi:frame", seq: data.id, t: null, metrics: metrics }); });
    } else {
      metrics.ignored++;
    }
  });
  window.addEventListener("load", postReady);
})();
`;

export const SANDBOX_CSP_FALLBACK_HEADER =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src 'none'; form-action 'none'; frame-ancestors 'self'";

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
    "<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}*{box-sizing:border-box}</style>",
    "<script>window.__MGS_SESSION__ = " + sessionJson + ";</script>",
    "<script>window.MGSI_CONFIG = " + paramsJson + ";</script>",
    "<script>" + PRELUDE_V2_SOURCE.replace(/<\/script/gi, "<\\/script") + "</script>",
    "</head><body>",
    "<script>" + safeCode + "</script>",
    "</body></html>",
  ].join("");
}

/* ------------------------------------------------------------------ */
/* Hôte de l'iframe (Studio, rendu MP4, vignettes, fiches publiques)   */
/* ------------------------------------------------------------------ */

interface PendingSeek {
  resolve: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

export default function SandboxTimelineFrame({
  code,
  sourceTemplate,
  sessionId,
  params,
  time,
  compatible = true,
  preview = false,
  hideOverlay = false,
  onIncompatible,
  onFrame,
  backgroundColor = "transparent",
}: {
  /** Mode ROUTE (défaut studio/fiches/rendu) : code servi par /sandbox/<id>
   * avec CSP par EN-TÊTE (Chromium ignore l'attribut csp des iframes). */
  sourceTemplate?: { templateId: string; version?: number };
  /** Mode srcdoc brut : UNIQUEMENT l'aperçu live de l'éditeur (code en cours
   * de saisie). L'origine reste opaque + calquage ; la CSP n'est pas
   * applicable dans ce mode (documenté). */
  code?: string;
  sessionId: string;
  params: SandboxParams;
  /** Temps moteur (déjà converti par timelineTimeFor) — SEEK à chaque changement. */
  time: number;
  /** Contrat présent dans le code (calculé par les capacités). */
  compatible?: boolean;
  /** Vignette/apercu : quota distinct (léger). */
  preview?: boolean;
  /** Rendu MP4 : pas d'overlay incompatible (sinon capturé dans la vidéo). */
  hideOverlay?: boolean;
  /** Ack rendu : résolu à chaque FRAME_READY (ou timeout dégradé). */
  onFrame?: (info: { seq: number; degraded: boolean }) => void;
  /** Signale une incompatibilité détectée au runtime (badge éditeur). */
  onIncompatible?: (reason: string | null) => void;
  backgroundColor?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [doc, setDoc] = useState(() =>
    code ? buildSandboxDocumentV2(code, sessionId, params) : ""
  );
  const seqRef = useRef(0);
  const pendingRef = useRef<Map<number, PendingSeek>>(new Map());
  const [runtimeIncompatible, setRuntimeIncompatible] = useState(false);
  const [quotaReached, setQuotaReached] = useState(() => sandboxQuotaExceeded(Boolean(preview)));

  // Callbacks parents (stabilisés) : valeurs lues via les refs dans les
  // effets only (l'assignation dans un effet est validée par le linter React).
  const onIncompatibleRef = useRef(onIncompatible);
  const onFrameRef = useRef(onFrame);
  const sendParamsRef = useRef<(params: SandboxParams) => void>(() => {});

  // Paramètres courants (injectés par SET_PARAMS en mode route).
  const paramsRef = useRef<SandboxParams>(params);
  useEffect(() => {
    paramsRef.current = params;
    onIncompatibleRef.current = onIncompatible;
    onFrameRef.current = onFrame;
  });

  /** SET_PARAMS + ACK : envoi + promesse partagée (résolue par l'ack). */
  const sendParamsNow = useCallback((nextParams: SandboxParams) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    const pendingRef2 = pendingRef.current;
    const pending: PendingSeek = { resolve: () => {} };
    pendingRef2.set(seq, pending);
    const wait = new Promise<void>((resolve) => {
      pending.resolve = resolve;
    });
    pending.timer = setTimeout(() => {
      pendingRef2.delete(seq);
      pending.resolve();
    }, 2500);
    const wrapped = wait.finally(() => pendingCodeWaits.delete(wrapped));
    pendingCodeWaits.add(wrapped);
    win.postMessage({ type: "mgsi:set_params", session: sessionId, params: nextParams, id: seq }, "*");
  }, [sessionId]);

  // Liaison (dans un effet, jamais pendant le rendu) :
  useEffect(() => {
    sendParamsRef.current = sendParamsNow;
  }, [sendParamsNow]);


  const isRouteMode = Boolean(sourceTemplate);
  const docKey = keyOf(code ?? `route:${sourceTemplate?.templateId}:${sourceTemplate?.version ?? ""}`, sessionId, JSON.stringify(params));
  const [lastDocKey, setLastDocKey] = useState(docKey);
  if (lastDocKey !== docKey && !isRouteMode) {
    // Reconstruction pendant le rendu (pattern React « adjusted state »).
    setLastDocKey(docKey);
    setDoc(buildSandboxDocumentV2(code ?? "", sessionId, params));
    setRuntimeIncompatible(false);
  }
  // Mode route : src calculé (cohérent avec la méta enregistrée au rendu) ;
  // chaque changement de PARAMÈTRES passe par SET_PARAMS (postMessage).
  const sandboxSrc = isRouteMode
    ? `/sandbox/${encodeURIComponent(sourceTemplate?.templateId ?? "")}?s=${encodeURIComponent(sessionId)}${
        sourceTemplate?.version ? `&v=${sourceTemplate.version}` : ""
      }`
    : null;
  // Quota (module global, non-réactif) : suivi au rendu (le canvas re-rendu
  // à chaque instant : le quota est réévalué régulièrement).
  if (sandboxQuotaExceeded(Boolean(preview)) !== quotaReached) {
    setQuotaReached(!quotaReached);
  }

  /* Temps courant + SEEK/ACK (le handler mgsi:ready et les effets d'instant s'en servent). */
  const currentTimeRef = useRef(0);
  useEffect(() => {
    currentTimeRef.current = time;
  });

  /** SEEK + ACK : envoi, promesse partagée, ack résolu par FRAME_READY. */
  const seekNow = useCallback((t: number, fromIncompatible = runtimeIncompatible) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (fromIncompatible) return; // jamais de faux ACK
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    const pending: PendingSeek = { resolve: () => {} };
    pendingRef.current.set(seq, pending);
    const wait = new Promise<void>((resolve) => {
      pending.resolve = resolve;
    });
    pending.timer = setTimeout(() => {
      pendingRef.current.delete(seq);
      pending.resolve();
      onFrameRef.current?.({ seq, degraded: true });
    }, 2500);
    const wrapped = wait.finally(() => pendingCodeWaits.delete(wrapped));
    pendingCodeWaits.add(wrapped);
    win.postMessage({ type: "mgsi:seek", session: sessionId, t, id: seq }, "*");
  }, [sessionId, runtimeIncompatible]);

  /* Libération des acks au démontage (protège le rendu d'un blocage). */
  const isPreview = Boolean(preview);
  useEffect(() => {
    const pendingMap = pendingRef.current;
    return () => {
      if (isPreview) activeSandboxPreviews -= 1;
      else activeSandboxFrames -= 1;
      pendingMap.forEach((pending) => {
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve();
      onFrameRef.current?.({ seq: 0, degraded: true });
      });
      pendingMap.clear();
    };
  }, [isPreview]);

  useEffect(() => {
    // Ping/pong : certains READY partent avant l'écoute (srcdoc déjà chargé).
    const pingTimer = setInterval(() => {
      if (runtimeIncompatible) {
        clearInterval(pingTimer);
        return;
      }
      const win = iframeRef.current?.contentWindow;
      if (win) win.postMessage({ type: "mgsi:ping", session: sessionId }, "*");
    }, 500);
    const stopPing = setTimeout(() => clearInterval(pingTimer), 12000);

    const onMessage = (event: MessageEvent) => {
      const win = iframeRef.current?.contentWindow;
      if (!win || event.source !== win) return;
      const data = event.data as
        | {
            type?: string;
            session?: unknown;
            seq?: number;
            t?: number;
            degraded?: boolean;
            mode?: string;
            code?: string;
            metrics?: SandboxHostMetrics;
          }
        | null;
      if (!data || typeof data.type !== "string") return;
      if (data.session !== sessionId) return;

      const local = metricsFor(sessionId);
      recordMetrics(local, data.metrics ?? null);
      if (data.type === "mgsi:ready") {
        const incompatible = data.mode === "free" || !compatible;
        setRuntimeIncompatible(incompatible);
        onIncompatibleRef.current?.(incompatible ? "Contrat __MGS_TIMELINE__ / renderAt(time) manquant ou non déterministe." : null);
        // Mode route : les params initiaux passent par SET_PARAMS (CSP = doc
        // sans params inline), puis premier SEEK au temps courant.
        if (!incompatible && sourceTemplate) {
          sendParamsRef.current(paramsRef.current);
        }
        seekNow(currentTimeRef.current, incompatible);
        return;
      }
      if (data.type === "mgsi:error") {
        if (data.code === "CONTRACT_MISSING") setRuntimeIncompatible(true);
        return;
      }
      if (data.type === "mgsi:frame" && typeof data.seq === "number") {
        const pending = pendingRef.current.get(data.seq);
        if (!pending) return;
        pendingRef.current.delete(data.seq);
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve();
        onFrameRef.current?.({
          seq: data.seq,
          degraded: Boolean(data.degraded) || Number(data.t) === null,
        });
        return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(pingTimer);
      clearTimeout(stopPing);
    };
  }, [sessionId, compatible, runtimeIncompatible, sendParamsNow, sourceTemplate]);

  // Chaque changement d'instant (lecture, scrub, export) -> SEEK.
  // Mode gratuit : aucun ACK (l'animation n'est pas déterministe ; l'export
  // sera refusé — jamais de faux rendu promis frame-exact).
  const quotaBlock = quotaReached ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-[10px] uppercase tracking-wider text-muted">
      Quota d&apos;aperçus sandboxés atteint
    </div>
  ) : null;
  useEffect(() => {
    if (quotaReached || runtimeIncompatible) return;
    seekNow(time);
  }, [time, doc, sessionId, quotaReached, runtimeIncompatible, seekNow]);

  if (quotaBlock) return <div className="absolute inset-0" style={{ background: backgroundColor }}>{quotaBlock}</div>;

  return (
    <div className="absolute inset-0" style={{ background: backgroundColor }}>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        className="absolute inset-0 h-full w-full border-0"
        src={sandboxSrc ?? undefined}
        srcDoc={sandboxSrc ? undefined : doc}
        tabIndex={-1}
        aria-hidden="true"
      />
      {runtimeIncompatible && !hideOverlay ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-[11px] leading-relaxed text-amber-300">
          Non pilotable par la timeline : contrat renderAt(time) manquant ou non déterministe.
        </span>
      ) : null}
    </div>
  );
}

function keyOf(code: string, sessionId: string, paramsSignature: string): string {
  return `${code.length}:${sessionId}:${paramsSignature}`;
}

/** Fusion des métriques sandbox -> hôte (module, hors composant). */
function recordMetrics(local: SandboxHostMetrics, data: SandboxHostMetrics | null): void {
  if (!data) return;
  local.received = data.received;
  local.ignored = data.ignored;
  local.errors = data.errors;
  local.degraded = data.degraded;
}