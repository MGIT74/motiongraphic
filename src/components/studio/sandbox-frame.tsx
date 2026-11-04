"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

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

/** Frames dégradées (timeout / renderAt en échec) : /render/Studio refusent
 * d'encoder du dégradé silencieusement — journalisé + consommé par le moteur. */
export interface DegradedFrameInfo {
  sessionId: string;
  seq: number;
  reason: "timeout" | "render-at-failed" | "unmount";
}
export const degradedFrames: DegradedFrameInfo[] = [];

/** Consomme le journal (le moteur d'export le vide après lecture). */
export function drainDegradedFrames(): DegradedFrameInfo[] {
  const drained = [...degradedFrames];
  degradedFrames.length = 0;
  return drained;
}

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

import {
  buildSandboxDocumentV2,
  SANDBOX_CSP_FALLBACK_HEADER,
  type SandboxParams,
} from "@/lib/templates/sandbox-runtime";
export { SANDBOX_CSP_FALLBACK_HEADER };
export { buildSandboxDocumentV2 };
export type { SandboxParams };
export { SANDBOX_CSP_FALLBACK_HEADER as SANDBOX_CSP };

/** Prelude (sans balise script : l'hôte l'emballl lui-même). */
// Neutralisation au calquage : Chrome ignore l'attribut csp des iframes
// (spec retirée) -> le prelude remplace les fonctions réseau/eval avant tout
// code utilisateur (Propriétés non réinscriptibles). Les accès via <img>/<script>
// injectés sont interceptés dans document.createElement.

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
  params,
  time,
  compatible = true,
  preview = false,
  hideOverlay = false,
  onSession,
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
  /** Session établie (tests : métriques par session). */
  onSession?: (sessionId: string) => void;
  backgroundColor?: string;
}) {
  // Session UNIQUE par instance (cross-talk impossible ; route : ?s=<session>).
  const sessionUid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sessionId = `sbx-${sessionUid}`;
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
      degradedFrames.push({ sessionId, seq, reason: "timeout" });
    if (degradedFrames.length > 200) degradedFrames.splice(0, degradedFrames.length - 200);
    }, 2500);
    const wrapped = wait.finally(() => pendingCodeWaits.delete(wrapped));
    pendingCodeWaits.add(wrapped);
    win.postMessage({ type: "mgsi:seek", session: sessionId, t, id: seq }, "*");
  }, [sessionId, runtimeIncompatible]);

  /* Session exposée (tests) : l'API de check lit les métriques par session. */
  const onSessionRef = useRef(onSession);
  useEffect(() => {
    onSessionRef.current = onSession;
    onSessionRef.current?.(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
        else degradedFrames.push({ sessionId, seq: Number(data.seq) || 0, reason: "render-at-failed" });
      if (degradedFrames.length > 200) degradedFrames.splice(0, degradedFrames.length - 200);
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
  }, [sessionId, compatible, runtimeIncompatible, sendParamsNow, sourceTemplate, seekNow]);

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