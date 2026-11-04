"use client";

import { useEffect, useRef, useState } from "react";
import SandboxTimelineFrame, {
  metricsFor,
  type SandboxParams,
} from "./sandbox-frame";
import { SANDBOX_TIMELINE_STARTER_CODE } from "@/lib/templates/sandbox-starter";

declare global {
  interface Window {
    __mgsSandboxCheck?: {
      ready: boolean;
      mode: "timeline" | "free";
      incompatible: string[];
      seek: (t: number) => Promise<void>;
      metrics: () => { received: number; ignored: number; errors: number; degraded: number };
      sendHostile: () => number;
      boundsProbe: () => Promise<Bounds>;
    };
  }
}

interface Bounds {
  networkBlocked: boolean;
  networkDetail: string;
  storageBlocked: boolean;
  storageDetail: string;
  topOpaque: boolean;
  evalBlocked: boolean;
}

/** Sonde injectée DANS l'iframe : vérifie les bornes côté sandbox. */
const PROBE_SNIPPET = `
window.addEventListener("message", function (message) {
  var data = message && message.data;
  if (data && data.type === "mgsi:probe" && data.session === window.__MGS_SESSION__) {
    var results = { networkBlocked: false, networkDetail: "", storageBlocked: false, storageDetail: "", topOpaque: false, evalBlocked: false };
    try {
      var probeFetch = window.fetch("https://example.com/ping");
      probeFetch.then(function () {
        results.networkBlocked = false;
        results.networkDetail = "fetch autorisé (?!)";
      }, function (err) {
        results.networkBlocked = true;
        results.networkDetail = err && err.message ? String(err.message).slice(0, 60) : "bloqué";
      });
    } catch (err) {
      results.networkBlocked = true;
      results.networkDetail = err && err.message ? String(err.message).slice(0, 60) : "bloqué (throw)";
    }
    try {
      window.localStorage.setItem("mgsi", "1");
      results.storageDetail = "localStorage accessible (?!)";
    } catch (err) {
      results.storageBlocked = true;
      results.storageDetail = err && err.name ? String(err.name) : "bloqué";
    }
    try {
      var topDoc = window.top.document;
      results.topOpaque = Boolean(topDoc) === false;
    } catch (err) {
      results.topOpaque = true; // SECURITY_ERR attendu (origine opaque)
    }
    try {
      window.eval("1+1");
    } catch (err) {
      results.evalBlocked = true; // CSP sans 'unsafe-eval' attendu
    }
    setTimeout(function () {
      window.parent.postMessage({ type: "mgsi:bounds", session: window.__MGS_SESSION__, results: results }, "*");
    }, 150);
  }
});
`;

/**
 * Page de contrôle du runtime sandbox (TEMPLATE_CHECK uniquement) :
 * déterminisme (seek identiques), bornes de sécurité, messages hostiles.
 * Utilisée par tests/security/sandbox.security.cjs.
 */
export default function SandboxCheck() {
  const [mode, setMode] = useState<"timeline" | "free">("free");
  const [incompatible, setIncompatible] = useState<string[]>([]);
  const [time, setTime] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const frameAckRef = useRef<(() => void) | null>(null);
  const boundsRef = useRef<((results: Bounds) => void) | null>(null);
  const setTimeRef = useRef(setTime);

  const sessionId = "check-session-01";
  const params: SandboxParams = {
    text: "SECURITE",
    primaryColor: "#F5F5F7",
    accentColor: "#0A84FF",
    backgroundColor: "#000000",
    duration: 3,
    speed: 1,
  };
  const code = `${SANDBOX_TIMELINE_STARTER_CODE("Controle Sandbox")}\n${PROBE_SNIPPET}`;

  // API : seule instance, stabilisée (aucune re-création).
  useEffect(() => {
    window.__mgsSandboxCheck = {
      ready: false,
      mode,
      incompatible,
      seek: (t: number) => {
        setTimeRef.current(t);
        return new Promise<void>((resolve) => {
          frameAckRef.current = resolve;
          setTimeout(() => resolve(), 4000);
        });
      },
      metrics: () => {
        const m = metricsFor(sessionId);
        return { received: m.received, ignored: m.ignored, errors: m.errors, degraded: m.degraded };
      },
      sendHostile: () => {
        const win = frameRef.current?.querySelector("iframe")?.contentWindow;
        if (!win) return 0;
        win.postMessage({ type: "mgsi:seek", session: "WRONG-SESSION", t: 1, id: 1 }, "*");
        win.postMessage({ type: "mgsi:seek", session: null, t: 1, id: 2 }, "*");
        win.postMessage({ type: "mgsi:seek", t: "not-a-number" }, "*");
        win.postMessage({ type: "mgsi:gibberish", session: sessionId }, "*");
        return 4;
      },
      boundsProbe: () => {
        const win = frameRef.current?.querySelector("iframe")?.contentWindow;
        if (!win) return Promise.reject(new Error("iframe absente"));
        return new Promise((resolve) => {
          boundsRef.current = resolve;
          setTimeout(() => {
            boundsRef.current?.({
              networkBlocked: false,
              networkDetail: "timeout probe",
              storageBlocked: false,
              storageDetail: "timeout probe",
              topOpaque: false,
              evalBlocked: false,
            });
          }, 5000);
          win.postMessage({ type: "mgsi:probe", session: sessionId }, "*");
        });
      },
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; session?: string; mode?: "timeline" | "free"; results?: Bounds } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "mgsi:ready") {
        const api = window.__mgsSandboxCheck;
        if (!api) return;
        api.mode = data.mode ?? "free";
        setMode(api.mode);
        api.ready = true;
        return;
      }
      if (data.type === "mgsi:bounds") {
        boundsRef.current?.(data.results as Bounds);
        boundsRef.current = null;
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      delete window.__mgsSandboxCheck;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="p-6">
      <div
        ref={frameRef}
        data-sandbox-stage
        className="relative mx-auto overflow-hidden rounded-xl border border-line bg-black"
        style={{ width: 640, height: 360 }}
      >
        <SandboxTimelineFrame
          preview
          code={code}
          sessionId={sessionId}
          params={params}
          time={time}
          onFrame={() => {
            const ack = frameAckRef.current;
            frameAckRef.current = null;
            ack?.();
          }}
          onIncompatible={(reason) => setIncompatible(reason ? [reason] : [])}
        />
      </div>
      <p className="mt-3 text-center font-mono text-xs text-muted">
        mode={mode} · incompatible={incompatible.join(", ") || "aucune"}
      </p>
    </div>
  );
}