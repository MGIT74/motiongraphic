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

/** seekNow courant par session (module, hors refs React) : SET_PARAMS ack ->
 * SEEK défilé sans détenir une fonction de rendu périmée. */
const SEEK_NOW_BY_SESSION = new Map<string, (t: number, degraded?: boolean) => void>();

/** Dernière signature de paramètres ENVOYÉE par session (module) : les
 * changements de params post-ready déclenchent SET_PARAMS (un seul vol). */
const SENT_PARAMS_SIG_BY_SESSION = new Map<string, string>();
function enqueueSeekForSession(sessionId: string, t: number): () => void {
  return () => {
    SEEK_NOW_BY_SESSION.get(sessionId)?.(t);
  };
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
  resolve: (frameT?: number | null) => void;
  timer?: ReturnType<typeof setTimeout>;
  t?: number;
}

/** Id de charge par document (l'initialisation ne re-courra pas aux pings). */
const lastLoadIdBySession = new Map<string, string>();

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
   * applicable au srcdoc (documenté). */
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
  /** Ack rendu : résolu à chaque FRAME_READY (ou timeout dégradé) ;
   * `t` = l'instant réellement rendu (null pour un ack set_params). */
  onFrame?: (info: { seq: number; degraded: boolean; t: number | null }) => void;
  /** Signale une incompatibilité détectée au runtime (badge éditeur). */
  onIncompatible?: (reason: string | null) => void;
  /** Session établie (tests : métriques par session). */
  onSession?: (sessionId: string) => void;
  backgroundColor?: string;
}) {
  /* ------------------------------------------------------------------ */
  /* Réfs : session, acks, ordonnancement SET_PARAMS -> SEEK             */
  /* ------------------------------------------------------------------ */

  // Session UNIQUE par instance (aucun cross-talk ; route : ?s=<session>).
  const invalidFrame = !code && !sourceTemplate;
  const sessionUid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sessionId = `sbx-${sessionUid}`;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const seqRef = useRef(0);
  const pendingRef = useRef<Map<number, PendingSeek>>(new Map());
  const currentTimeRef = useRef(0);
  const paramsSettledRef = useRef(true);
  const queuedSeekRef = useRef<number | null>(null);
  const lastParamsSeqRef = useRef<number | null>(null);
  const lastParamsSentRef = useRef<SandboxParams | null>(null);
  const [runtimeIncompatible, setRuntimeIncompatible] = useState(false);
  const [quotaReached, setQuotaReached] = useState(() => sandboxQuotaExceeded(Boolean(preview)));
  const [doc, setDoc] = useState(() =>
    code ? buildSandboxDocumentV2(code, sessionId, params) : ""
  );

  // Callbacks parents (stabilisés : assignation en effet, jamais en rendu).
  const onIncompatibleRef = useRef(onIncompatible);
  const onFrameRef = useRef(onFrame);
  const sendParamsRef = useRef<(params: SandboxParams) => void>(() => {});
  const onSessionRef = useRef(onSession);
  const paramsRef = useRef<SandboxParams>(params);
  useEffect(() => {
    currentTimeRef.current = time;
    paramsRef.current = params;
    onIncompatibleRef.current = onIncompatible;
    onFrameRef.current = onFrame;
    onSessionRef.current = onSession;
  });

  const isRouteMode = Boolean(sourceTemplate);
  const sandboxSrc = isRouteMode
    ? `/sandbox/${encodeURIComponent(sourceTemplate?.templateId ?? "")}?s=${encodeURIComponent(sessionId)}${
        sourceTemplate?.version ? `&v=${sourceTemplate.version}` : ""
      }`
    : null;

  /** Expose la session (métriques par session pour les tests). */
  useEffect(() => {
    onSessionRef.current?.(sessionId);
  }, [sessionId]);

  /** Enfile le SEEK (le DERNIER demandé gagne) — module map, pas de ref. */
  const flushQueuedSeek = useCallback(() => {
    if (!paramsSettledRef.current) return;
    const queued = queuedSeekRef.current;
    if (queued === null) return;
    queuedSeekRef.current = null;
    enqueueSeekForSession(sessionId, queued)();
  }, [sessionId]);

  /* SEEK + ACK : envoi + promesse partagée + journal des échecs. */
  const seekNow = useCallback(
    (t: number, fromIncompatible = runtimeIncompatible) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      if (fromIncompatible) return; // jamais de faux ACK
      const seq = seqRef.current + 1;
      seqRef.current = seq;
      const pending: PendingSeek = { resolve: () => {} };
      pendingRef.current.set(seq, pending);
      const wait = new Promise<void>((resolve) => {
        pending.resolve = () => resolve();
      });
      pending.timer = setTimeout(() => {
        pendingRef.current.delete(seq);
        pending.resolve();
        onFrameRef.current?.({ seq, degraded: true, t: null });
        degradedFrames.push({ sessionId, seq, reason: "timeout" });
        if (degradedFrames.length > 200) degradedFrames.splice(0, degradedFrames.length - 200);
      }, 2500);
      const wrapped = wait.finally(() => pendingCodeWaits.delete(wrapped));
      pendingCodeWaits.add(wrapped);
      win.postMessage({ type: "mgsi:seek", session: sessionId, t, id: seq }, "*");
    },
    [sessionId, runtimeIncompatible]
  );
  // Enregistrement du seekNow courant (nettoyé au démontage / changement).
  useEffect(() => {
    SEEK_NOW_BY_SESSION.set(sessionId, seekNow);
    return () => {
      if (SEEK_NOW_BY_SESSION.get(sessionId) === seekNow) SEEK_NOW_BY_SESSION.delete(sessionId);
    };
  }, [sessionId, seekNow]);

  /* Changement de PARAMÈTRES après le chargement : SET_PARAMS (un seul en
   * vol ; son acquittement débloque le SEEK éventuellement en file). */
  useEffect(() => {
    const docLoaded = lastLoadIdBySession.has(sessionId);
    const sentSig = SENT_PARAMS_SIG_BY_SESSION.get(sessionId);
    const sig = JSON.stringify(params);
    if (!docLoaded || sentSig === sig || !paramsSettledRef.current) return;
    sendParamsRef.current(paramsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params), sessionId]);

  /* SET_PARAMS + ACK : l'acquittement débloque les SEEK en file ; l'attente
   * d'acquittement vit dans pendingCodeWaits -> le rendu MP4 ne peut PAS
   * capturer une image rendue avec d'anciens paramètres. */
  const sendParamsNow = useCallback(
    (nextParams: SandboxParams) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      const seq = seqRef.current + 1;
      seqRef.current = seq;
      paramsSettledRef.current = false;
      const pending: PendingSeek = { resolve: () => {} };
      /** ACK set_params (porte l'image rendue à t) : le queued SEEK ne part
       * que s'il demande un instant DIFFÉRENT de celui déjà rendu. */
      const settle = new Promise<void>((resolve) => {
        pending.resolve = (frameT) => {
          paramsSettledRef.current = true;
          const queued = queuedSeekRef.current;
          if (queued !== null) {
            queuedSeekRef.current = null;
            if (frameT === null || frameT === undefined || Math.abs(queued - frameT) > 1e-6) {
              seekNow(queued);
            }
          }
          resolve();
        };
      });
      pending.timer = setTimeout(() => {
        paramsSettledRef.current = true;
        degradedFrames.push({ sessionId, seq, reason: "timeout" });
        if (degradedFrames.length > 200) degradedFrames.splice(0, degradedFrames.length - 200);
        pending.resolve(undefined);
      }, 2500);
      const wrapped = settle.finally(() => pendingCodeWaits.delete(wrapped));
      pendingCodeWaits.add(wrapped);
      SENT_PARAMS_SIG_BY_SESSION.set(sessionId, JSON.stringify(nextParams));
      win.postMessage({ type: "mgsi:set_params", session: sessionId, params: nextParams, id: seq }, "*");
    },
    [sessionId, flushQueuedSeek]
  );
  useEffect(() => {
    sendParamsRef.current = sendParamsNow;
  }, [sendParamsNow]);

  /* Reconstruction srcdoc (éditeur live : params inline -> settled). */
  const docKey = keyOf(code ?? `route:${sourceTemplate?.templateId}:${sourceTemplate?.version ?? ""}`, sessionId, JSON.stringify(params));
  const [lastDocKey, setLastDocKey] = useState(docKey);
  if (lastDocKey !== docKey && !isRouteMode) {
    setLastDocKey(docKey);
    setDoc(buildSandboxDocumentV2(code ?? "", sessionId, params));
    setRuntimeIncompatible(false);
  }

  /* Quota (suivi au rendu : le canvas re-rend à chaque instant). */
  if (sandboxQuotaExceeded(Boolean(preview)) !== quotaReached) {
    setQuotaReached(!quotaReached);
  }

  /* ------------------------------------------------------ */
  /* Effets : session/acks, ping, temps                     */
  /* ------------------------------------------------------ */

  /* Libération des acks au démontage (sans blocage du rendu MP4). */
  const isPreview = Boolean(preview);
  useEffect(() => {
    const pendingMap = pendingRef.current;
    return () => {
      if (isPreview) activeSandboxPreviews -= 1;
      else activeSandboxFrames -= 1;
      pendingMap.forEach((pending) => {
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve();
        onFrameRef.current?.({ seq: 0, degraded: true, t: null });
        degradedFrames.push({ sessionId, seq: 0, reason: "unmount" });
        if (degradedFrames.length > 200) degradedFrames.splice(0, degradedFrames.length - 200);
      });
      pendingMap.clear();
      lastLoadIdBySession.delete(sessionId);
    };
  }, [sessionId, isPreview]);

  /* Ping/pong + messages (session stricte, formes validées). */
  useEffect(() => {
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
            message?: string;
            metrics?: SandboxHostMetrics;
          }
        | null;
      if (!data || typeof data.type !== "string") return;
      if (data.session !== sessionId) return;

      recordMetrics(metricsFor(sessionId), data.metrics ?? null);
      if (data.type === "mgsi:ready") {
        // Pong du MÊME document (même loadId) : PAS de réinitialisation ;
        // mais si le SET_PARAMS partait avant l'écoute du sandbox (doc en
        // chargement), le pong REJOUE le même seq (pas de nouvelle promesse).
        const loadId = (data as { loadId?: string }).loadId ?? "";
        const seenLoadId = lastLoadIdBySession.get(sessionId);
        if (seenLoadId && seenLoadId === loadId) {
          const win = iframeRef.current?.contentWindow;
          if (!win) return;
          // SET_PARAMS non encore acquitté : re-jeu du même seq.
          if (!paramsSettledRef.current && lastParamsSeqRef.current !== null && lastParamsSentRef.current) {
            win.postMessage(
              { type: "mgsi:set_params", session: sessionId, params: lastParamsSentRef.current, id: lastParamsSeqRef.current },
              "*"
            );
          }
          // SEEK non acquitté : re-jeu du même seq (perte possible pendant le
          // chargement du document ; la promesse/son timer ne changent pas).
          const outstanding = Array.from(pendingRef.current.entries());
          if (outstanding.length > 0) {
            const [seqOutstanding, pendingOutstanding] = outstanding[outstanding.length - 1];
            if (seqOutstanding !== lastParamsSeqRef.current) {
              win.postMessage({ type: "mgsi:seek", session: sessionId, t: pendingOutstanding.t ?? 0, id: seqOutstanding }, "*");
            }
          }
          return;
        }
        if (loadId) lastLoadIdBySession.set(sessionId, loadId);

        const incompatible = data.mode === "free" || !compatible;
        setRuntimeIncompatible(incompatible);
        onIncompatibleRef.current?.(
          incompatible ? "Contrat __MGS_TIMELINE__ / renderAt(time) manquant ou non déterministe." : null
        );
        if (incompatible) return;
        // Route : SET_PARAMS d'abord (les paramètres inline ne sont pas dans
        // le document servi) ; le premier SEEK part au flush.
        if (isRouteMode) {
          queuedSeekRef.current = queuedSeekRef.current ?? currentTimeRef.current;
          sendParamsRef.current(paramsRef.current);
          return;
        } else {
          // srcdoc : params inline -> SEEK direct au temps courant.
          queuedSeekRef.current = currentTimeRef.current;
          flushQueuedSeek();
        }
        return;
      }
      if (data.type === "mgsi:error") {
        if (data.code === "CONTRACT_MISSING") setRuntimeIncompatible(true);
        else {
          degradedFrames.push({ sessionId, seq: Number(data.seq) || 0, reason: "render-at-failed" });
          if (degradedFrames.length > 200) degradedFrames.splice(0, degradedFrames.length - 200);
        }
        if (onIncompatibleRef.current)
          onIncompatibleRef.current?.(
            data.code === "CONTRACT_MISSING"
              ? "Contrat __MGS_TIMELINE__ / renderAt(time) manquant."
              : `renderAt en échec : ${data.message ?? "erreur"}`
          );
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
          degraded: Boolean(data.degraded) || data.t === null,
          t: data.t === null || data.t === undefined ? null : Number(data.t),
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
  }, [sessionId, compatible, runtimeIncompatible, isRouteMode, flushQueuedSeek]);

  /* Chaque changement d'instant (lecture, scrub, export) -> SEEK —
   * mis en file si un SET_PARAMS attend son acquittement. */
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || quotaReached || runtimeIncompatible) return;
    if (!paramsSettledRef.current) {
      queuedSeekRef.current = time;
      return;
    }
    seekNow(time);
  }, [time, doc, sessionId, quotaReached, runtimeIncompatible, seekNow]);

  if (invalidFrame) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-black px-4 text-center text-[11px] leading-relaxed text-muted"
      >
        Aucun code ni template sandbox fourni.
      </div>
    );
  }
  if (quotaReached) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4 text-center text-[10px] uppercase tracking-wider text-muted">
        Quota d&apos;aperçus sandboxés atteint
      </div>
    );
  }

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

