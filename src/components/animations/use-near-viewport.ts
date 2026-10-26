"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Indique si un élément est proche du viewport (rendu différé des animations
 * de la galerie). Une fois monté, l'élément reste monté : le moteur
 * d'animation prend ensuite le relais (pause/play via son propre
 * IntersectionObserver), ce qui limite les animations simultanées.
 */
export function useNearViewport<T extends Element>(rootMargin = "500px") {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, visible } as const;
}