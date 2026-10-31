"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Prévisualisation isolée d'un template « code source ».
 *
 * - iframe avec sandbox="allow-scripts" (PAS de allow-same-origin) :
 *   le code tourne sous origine nulle, sans accès cookies/DOM parent/stockage.
 * - Aucun code n'est jamais évalué dans l'application principale.
 * - Protocole (contrat documenté dans l'éditeur admin) :
 *     parent → iframe : { type: "mgsi:config", config } | { type: "mgsi:replay" }
 *     iframe → parent : { type: "mgsi:ready" } (optionnel)
 *
 * Le bootstrap injecté avant le code utilisateur expose :
 *   window.MGSI_CONFIG            — config actuelle (texte/couleurs/durée/vitesse)
 *   "mgsi:configchange" (event)   — émis à chaque changement de config
 *   "mgsi:replay" (event)         — émis quand l'utilisateur relance
 */
export default function SandboxPreview({
  code,
  config,
  rerunKey = 0,
  ariaLabel = "Aperçu isolé de l'animation",
}: {
  code: string;
  config: AnimationConfigLite;
  /** Change de valeur pour recharger le document (relance). */
  rerunKey?: number;
  ariaLabel?: string;
}) {
  const [doc, setDoc] = useState(() => buildSandboxDocument(code));
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [lastSource, setLastSource] = useState({ code, rerunKey });

  const configKey = JSON.stringify(config);

  // Reconstruit le document sandboxé quand le code change — ou à la relance.
  // Pattern "adjusted state during render" (React docs) : reset sans effet.
  if (lastSource.code !== code || lastSource.rerunKey !== rerunKey) {
    setLastSource({ code, rerunKey });
    setFrameReady(false);
    setDoc(buildSandboxDocument(code));
  }

  // Répond à « mgsi:ready » en envoyant la définition de config à jour.
  const sendConfig = (win: Window) => {
    win.postMessage({ type: "mgsi:config", config: JSON.parse(configKey) }, "*");
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string } | null;
      if (data?.type === "mgsi:ready") {
        setFrameReady(true);
        sendConfig(event.source as Window);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  // Config à jour après each changement (trop de postMessage si chaque rendu).
  useEffect(() => {
    if (!frameReady) return;
    const target = iframeRef.current?.contentWindow;
    if (target) sendConfig(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameReady, configKey]);

  return (
    <iframe
      ref={iframeRef}
      title={ariaLabel}
      sandbox="allow-scripts"
      className="absolute inset-0 h-full w-full border-0"
      srcDoc={doc}
    />
  );
}

export interface AnimationConfigLite {
  text: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  duration: number;
  speed: number;
}

const PRELUDE = `
<script>
(function () {
  "use strict";
  window.MGSI_CONFIG = window.MGSI_CONFIG || {};
  window.addEventListener("message", function (message) {
    var data = message && message.data;
    if (data && data.type === "mgsi:config" && data.config) {
      window.MGSI_CONFIG = data.config;
      try {
        window.dispatchEvent(new CustomEvent("mgsi:configchange", { detail: data.config }));
      } catch (e) {}
    } else if (data && data.type === "mgsi:replay") {
      try {
        window.dispatchEvent(new CustomEvent("mgsi:replay"));
      } catch (e) {}
    }
  });
  try { window.parent.postMessage({ type: "mgsi:ready" }, "*"); } catch (e) {}
})();
</script>
`;

export function buildSandboxDocument(code: string): string {
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\" />",
    "<style>",
    "html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}",
    "*{box-sizing:border-box}",
    "</style>",
    PRELUDE,
    "</head><body>",
    `<script>\n${code}\n</script>`,
    "</body></html>",
  ].join("");
}