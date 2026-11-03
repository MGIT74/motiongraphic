"use client";

import { useEffect, useState } from "react";
import type { AnimationComponentProps, ComponentKey } from "@/types/animation";
import ControlledAnimation from "./ControlledAnimation";

/**
 * Aperçu en boucle d'un template (panneau « styles compatibles » du Studio).
 *
 * Utilise le moteur du Studio (ControlledAnimation) piloté par
 * requestAnimationFrame : un template enregistré dans ControlledAnimation est
 * automatiquement disponible ici (aucune seconde liste à tenir à jour).
 */
export default function LoopingDemoFrame({ templateKey, config }: AnimationComponentProps & { templateKey: ComponentKey }) {
  const [time, setTime] = useState(0);
  const loop = Math.max(1, config.duration) + 1.2;

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setTime(((now - t0) / 1000) % loop);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: config.backgroundColor, containerType: "size" }}>
      <ControlledAnimation templateKey={templateKey} config={config} localTime={time} elementDuration={loop} timing="natural" preview />
    </div>
  );
}
