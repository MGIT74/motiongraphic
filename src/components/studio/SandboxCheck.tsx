"use client";

import { useEffect, useRef, useState } from "react";
import SandboxTimelineFrame, {
  metricsFor,
  type SandboxParams,
} from "./sandbox-frame";

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

/**
 * Page de contrôle du runtime sandbox (TEMPLATE_CHECK uniquement), branchée
 * sur la ROUTE /sandbox/sandbox-check-probe (CSP par en-tête = production) :
 * - déterminisme : seek identiques (voir tests/security) ;
 * - bornes de sécurité exécutées DANS l'iframe (sonde du template probe) ;
 * - messages hostiles ignorés + comptés.
 * Utilisée par tests/security/sandbox.security.cjs.
 */
export default function SandboxCheck() {
  const [mode, setMode] = useState<"timeline" | "free">("free");
  const [incompatible, setIncompatible] = useState<string[]>([]);
  const [time, setTime] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const frameAckRef = useRef<(() => void) | null>(null);
  const boundsRef = useRef<((results: Bounds) => void) | null>(null);
  const sessionRef = useRef<string | null>(null);

  const params: SandboxParams = {
    text: "SECURITE",
    primaryColor: "#F5F5F7",
    accentColor: "#0A84FF",
    backgroundColor: "#000000",
    duration: 3,
    speed: 1,
  };

  // API : instance unique, stable.
  useEffect(() => {
    const winOfStage = () => frameRef.current?.querySelector("iframe")?.contentWindow ?? null;
    window.__mgsSandboxCheck = {
      ready: false,
      mode,
      incompatible,
      seek: (t: number) => {
        setTime(t);
        return new Promise<void>((resolve) => {
          frameAckRef.current = resolve;
          setTimeout(() => resolve(), 4000);
        });
      },
      metrics: () => {
        const m = metricsFor(sessionRef.current ?? "unknown");
        return { received: m.received, ignored: m.ignored, errors: m.errors, degraded: m.degraded };
      },
      sendHostile: () => {
        const win = winOfStage();
        const session = sessionRef.current;
        if (!win || !session) return 0;
        win.postMessage({ type: "mgsi:seek", session: "WRONG-SESSION", t: 1, id: 1 }, "*");
        win.postMessage({ type: "mgsi:seek", session: null, t: 1, id: 2 }, "*");
        win.postMessage({ type: "mgsi:seek", t: "not-a-number" }, "*");
        win.postMessage({ type: "mgsi:gibberish", session }, "*");
        return 4;
      },
      boundsProbe: () => {
        const win = winOfStage();
        const session = sessionRef.current;
        if (!win || !session) return Promise.reject(new Error("iframe/session absentes"));
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
          win.postMessage({ type: "mgsi:probe", session }, "*");
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
          preview
          sourceTemplate={{ templateId: "sandbox-check-probe" }}
          params={params}
          time={time}
          onFrame={() => {
            const ack = frameAckRef.current;
            frameAckRef.current = null;
            ack?.();
          }}
          onSession={(session) => {
            sessionRef.current = session;
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