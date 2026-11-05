"use client";

import { useEffect, useId, useState } from "react";
import SandboxTimelineFrame, { type SandboxParams } from "@/components/studio/sandbox-frame";

/** Réglages d'aperçu partagés (le contrat du sandbox en mode prévisualisation). */
export interface AnimationConfigLite {
  text: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  duration: number;
  speed: number;
}

/**
 * Aperçu SANDBOXÉ d'un template « code » (fiches publiques, cartes, Lab).
 *
 * - Mode ROUTE : `sourceTemplate` -> iframe pointe sur /sandbox/<id> (la CSP
 *   réelle est délivrée en en-tête HTTP par la route) ;
 * - Mode srcDoc : `code` (aperçu live de l'éditeur uniquement) — origine
 *   opaque + calquage (la CSP par en-tête n'est pas possible dans ce mode).
 *
 * Runtime identique : SEEK piloté par l'hôte (boucle + pause), relance via
 * `rerunKey`, réglages = SET_PARAMS (contrat postMessage).
 */
export default function SandboxPreview({
  sourceTemplate,
  code,
  config,
  rerunKey = 0,
}: {
  sourceTemplate?: { templateId: string; version?: number };
  code?: string;
  config: AnimationConfigLite;
  /** Relance : recharge le document / repart de 0. */
  rerunKey?: number;
}) {
  const [time, setTime] = useState(0);
  const durationMs = Math.max(800, Math.min(20000, (config.duration || 3) * 1000 + 900));
  const pausedMs = 700;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sessionId = `pv-${uid}`;
  const params = config as SandboxParams;

  useEffect(() => {
    let raf = 0;
    const cycleMs = durationMs + pausedMs;
    const startMs = performance.now();
    const tick = (now: number) => {
      const offsetSec = ((now - startMs) % cycleMs) / 1000;
      setTime(Math.min(offsetSec, durationMs / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, pausedMs, rerunKey, code?.length, sourceTemplate?.templateId, sourceTemplate?.version]);

  const frameBase = {
    preview: true,
    params,
    time,
    sessionId,
  };

  return sourceTemplate ? (
    <SandboxTimelineFrame
      sourceTemplate={{ templateId: sourceTemplate.templateId, version: sourceTemplate.version }}
      {...frameBase}
    />
  ) : code ? (
    <SandboxTimelineFrame code={code} {...frameBase} />
  ) : null;
}