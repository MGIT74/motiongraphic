"use client";

import { useEffect, useRef, useState } from "react";
import SandboxTimelineFrame, {
  metricsFor,
  SandboxParams,
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
      boundsProbe: () => Promise<{
        networkBlocked: boolean;
        networkDetail: string;
        storageBlocked: boolean;
        storageDetail: string;
        topOpaque: boolean;
        evalBlocked: boolean;
      }>;
    };
  }
}

/** Sonde injectée DANS l'iframe : vérifie les bornes côté sandbox. */
const PROBE_SNIPPET = `
window.addEventListener("message", function (message) {
  var data = message && message.data;
  if (data && data.type === "mgsi:probe" && data.session === window.__MGS_SESSION__) {
    var results = { networkBlocked: false, networkDetail: "", storageBlocked: false, storageDetail: "", topOpaque: false, evalBlocked: false };
    try { throw 0; } catch (e) { /* noop */ }
    fetch("https://example.com/ping").then(function () {
      results.networkBlocked = false;
      results.networkDetail = "fetch autorisé (?!)";
    }, function (err) {
      results.networkBlocked = true;
      results.networkDetail = err && err.message ? String(err.message).slice(0, 60) : "bloqué";
    });
    try {
      window.localStorage.setItem("mgsi", "1");
      results.storageDetail = "localStorage accessible (?!)";
    } catch (err) {
      results.storageBlocked = true;
      results.storageDetail = err && err.name ? String(err.name) : "bloqué";
    }
    try {
      results.topOpaque = !window.top.document;
    } catch (err) {
      results.topOpaque = true; // SECURITY_ERR attendu
    }
    try {
      var evaluator = window.eval("1+1");
      results.evalBlocked = false;
    } catch (err) {
      results.evalBlocked = true; // CSP sans 'unsafe-eval' attendu
    }
    setTimeout(function () {
      window.parent.postMessage({ type: "mgsi:bounds", session: window.__MGS_SESSION__, results: results }, "*");
    }, 120);
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
  const [, force] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameAckRef = useRef<((info: { seq: number; degraded: boolean }) => void) | null>(null);
  const boundsRef = useRef<((results: unknown) => void) | null>(null);

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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; session?: string; results?: unknown } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "mgsi:ready") {
        const readyData = event.data as { mode?: "timeline" | "free" };
        setMode(readyData.mode ?? "free");
        window.__mgsSandboxCheck = {
          ready: true,
          mode: readyData.mode ?? "free",
          incompatible: [],
          seek: (t: number) => {
            setTime(t);
            return new Promise<void>((resolve) => {
              frameAckRef.current = () => resolve();
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
              boundsRef.current = resolve as (results: unknown) => void;
              setTimeout(() => {
                boundsRef.current?.({ networkBlocked: false, networkDetail: "timeout probe", storageBlocked: false, storageDetail: "timeout probe", topOpaque: false, evalBlocked: false });
              }, 5000);
              win.postMessage({ type: "mgsi:probe", session: sessionId }, "*");
            });
          },
        };
        force((v) => v + 1);
        return;
      }
      if (data.type === "mgsi:bounds") {
        boundsRef.current?.(data.results);
        boundsRef.current = null;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sessionId]);

  useEffect(() => {
    // Expose l'iframe à l'API (ref interne non accessible au testeur).
    const observer = new MutationObserver(() => {
      const iframe = frameRef.current?.querySelector("iframe");
      if (iframe && iframe !== iframeRef.current) iframeRef.current = iframe;
    });
    if (frameRef.current) observer.observe(frameRef.current, { childList: true, subtree: false });
    const first = frameRef.current?.querySelector("iframe");
    if (first) iframeRef.current = first;
    return () => observer.disconnect();
  }, []);

  return (
    <div className="p-6">
      <div
        ref={frameRef}
        data-sandbox-stage
        className="relative mx-auto overflow-hidden rounded-xl border border-line bg-black"
        style={{ width: 640, height: 360 }}
      >
        <SandboxTimelineFrame
          code={code}
          sessionId={sessionId}
          params={params}
          time={time}
          preview
          onIncompatible={(reason) => setIncompatible(reason ? [reason] : [])}
          onFrame={(info) => frameAckRef.current?.(info)}
        />
      </div>
      <p className="mt-3 text-center font-mono text-xs text-muted">
        mode={mode} · incompatible={incompatible.join(", ") || "aucune"}
      </p>
    </div>
  );
}