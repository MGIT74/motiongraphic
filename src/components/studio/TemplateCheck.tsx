"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import "@/app/studio-fonts.css";
import type { AnimationConfig, ComponentKey } from "@/types/animation";
import { ANIMATION_BUILDERS, type AnimationBuilder } from "@/lib/animations/builders";
import { COMPONENT_KEYS, getComponentMeta } from "@/lib/animations/registry";
import { STUDIO_TEMPLATES } from "@/lib/studio/template-registry";
import { RESERVED_SLUGS, type CustomTemplate } from "@/lib/templates/custom-model";
import { computeCodeCapabilities } from "@/lib/templates/capabilities";
import { registerCustomStudioTemplates } from "@/lib/studio/template-registry";
import { STUDIO_FRAMES } from "./ControlledAnimation";
import SandboxTimelineFrame from "./sandbox-frame";

/**
 * Page de contrôle automatique des templates (CI uniquement, TEMPLATE_CHECK=1).
 *
 * Rend un template avec le moteur du Studio (cadre DOM + builder GSAP) à un
 * instant précis de sa timeline, et expose `window.__tc` au script
 * tests/templates/check.cjs : liste des templates, chargement, positionnement
 * image par image et mesures (opacité effective, débordements).
 */

const SIZES = {
  "16:9": { width: 960, height: 540 },
  "9:16": { width: 540, height: 960 },
  "1:1": { width: 720, height: 720 },
} as const;
type Format = keyof typeof SIZES;

interface Loaded {
  key: string;
  format: Format;
  config: AnimationConfig;
}

interface ElementSample {
  /** Opacité effective (produit des ancêtres jusqu'au cadre). */
  o: number[];
  label: string;
}

declare global {
  interface Window {
    __tc?: {
      ready: boolean;
      list: () => unknown[];
      load: (key: string, format: Format, transparent: boolean) => Promise<{ total: number; out: number | null; error?: string }>;
      seek: (t: number) => Promise<void>;
      sampleOpacity: (times: number[]) => Promise<{ label: string; o: number[] }[]>;
      overflow: () => { label: string; dx: number; dy: number }[];
      coverage: () => { label: string; area: number; opaque: boolean }[];
    };
  }
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const API_REF: { seekWaiters: { current: (() => void)[] } } = { seekWaiters: { current: [] } };

export default function TemplateCheck() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const ctxRef = useRef<gsap.Context | null>(null);
  const pending = useRef<((v: { total: number; out: number | null; error?: string }) => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [loadedKind, setLoadedKind] = useState<"gsap" | "sandbox">("gsap");
  const loadedKindRef = useRef<"gsap" | "sandbox">("gsap");
  useEffect(() => {
    loadedKindRef.current = loadedKind;
  }, [loadedKind]);

  /* Templates sandbox (contrat déterministe) : codes du Template Lab (démo). */
  const [sandboxTemplates, setSandboxTemplates] = useState<
    { key: string; name: string; code: string; version: number; duration: number; outAt?: number; compatible: boolean; config: AnimationConfig }[]
  >([]);
  const [sandboxTime, setSandboxTime] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/templates/lab", { signal: abort.signal, cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; templates?: CustomTemplate[] };
        const publishedCodes = (data.templates ?? []).filter(
          (t) => t.status === "published" && t.sourceKind === "code" && typeof t.code === "string"
        );
        registerCustomStudioTemplates(
          publishedCodes.map((t) => {
            const caps = computeCodeCapabilities(t.code as string);
            return {
              id: t.id,
              slug: t.slug,
              name: t.name,
              category: t.category,
              sourceKind: t.sourceKind,
              elementKind: "cards",
              defaultConfig: t.defaultConfig,
              code: t.code,
              capabilities: caps,
              version: t.version,
            };
          })
        );
        setSandboxTemplates(
          publishedCodes.map((t) => {
            const caps = computeCodeCapabilities(t.code as string);
            return {
              key: t.slug,
              name: t.name,
              code: t.code as string,
              version: t.version,
              duration: caps.contractDuration ?? t.defaultConfig.duration,
              outAt: caps.contractDuration ? caps.contractDuration * 0.8 : undefined,
              compatible: caps.studioCompatible,
              config: t.defaultConfig,
            };
          })
        );
      } catch {
        // sans store Lab (absent/injoignable) : le contrôle des intégrés continue
      }
      setReady(true);
    })();
    return () => abort.abort();
  }, []);

  // Construction de la timeline une fois le cadre rendu.
  useEffect(() => {
    if (!loaded) return;
    const resolve = pending.current;
    pending.current = null;
    void (async () => {
      await document.fonts.ready;
      await frame();
      const root = stageRef.current;
      const builder: AnimationBuilder | undefined = ANIMATION_BUILDERS[loaded.key];
      ctxRef.current?.revert();
      tlRef.current = null;
      if (!builder) {
        resolve?.({ total: 0, out: null, error: "builder absent" });
        return;
      }
      if (!root) {
        resolve?.({ total: 0, out: null, error: "cadre absent" });
        return;
      }
      try {
        ctxRef.current = gsap.context(() => {
          const tl = builder(root, loaded.config, { loop: false }) ?? null;
          if (tl) {
            tl.repeat(0).repeatDelay(0).pause(0);
            tlRef.current = tl;
          }
        }, root);
      } catch (e) {
        resolve?.({ total: 0, out: null, error: e instanceof Error ? e.message : String(e) });
        return;
      }
      await frame();
      const tl = tlRef.current as gsap.core.Timeline | null;
      resolve?.({ total: tl ? tl.duration() : 0, out: tl && typeof tl.labels.out === "number" ? tl.labels.out : null, error: tl ? undefined : "le builder ne renvoie pas de timeline" });
    })();
  }, [loaded]);

  useEffect(() => {
    const effectiveOpacity = (el: Element, stop: Element): number => {
      let o = 1;
      for (let n: Element | null = el; n && n !== stop.parentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden") return 0;
        o *= Number(cs.opacity);
      }
      return o;
    };
    /** Éléments « de contenu » : texte direct, SVG, image, ou bloc sans enfant visible. */
    const contentElements = (root: Element): Element[] => {
      const out: Element[] = [];
      root.querySelectorAll("*").forEach((el) => {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return;
        const hasText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? "").trim().length > 0);
        const tag = el.tagName.toLowerCase();
        const r = el.getBoundingClientRect();
        if (hasText || tag === "svg" || tag === "img" || (el.childElementCount === 0 && r.width * r.height > 16)) out.push(el);
      });
      return out.slice(0, 600);
    };
    const labelOf = (el: Element, i: number) => {
      const t = (el.textContent ?? "").trim().slice(0, 24);
      return `${el.tagName.toLowerCase()}#${i}${t ? ` « ${t} »` : ""}`;
    };

    window.__tc = {
      ready,
      list: () => [
        ...COMPONENT_KEYS.map((key) => ({
          kind: "gsap",
          key,
          name: getComponentMeta(key).name,
          defaultText: getComponentMeta(key).defaultConfig.text,
          inStudio: key in STUDIO_TEMPLATES,
          hasBuilder: key in ANIMATION_BUILDERS,
          hasFrame: key in STUDIO_FRAMES,
          reserved: RESERVED_SLUGS.includes(key),
        })),
        ...sandboxTemplates.map((t) => ({
          kind: "sandbox",
          key: t.key,
          name: t.name,
          defaultText: t.config.text,
          inStudio: t.key in STUDIO_TEMPLATES,
          hasBuilder: false,
          hasFrame: false,
          reserved: true,
          compatible: t.compatible,
          duration: t.duration,
        })), // rendu STATIC côté check : pas d'iframe live (les tests sécurité/déterminisme sont dans test:security)
      ],
      load: (key, format, transparent) =>
        new Promise((resolve) => {
          const sandboxEntry = sandboxTemplates.find((t) => t.key === key);
          if (sandboxEntry) {
            // Sandbox : pas de timeline GSAP — la totalité vient du contrat.
            pending.current = null;
            setLoaded({ key, format, config: sandboxEntry.config } as Loaded & { sandbox: boolean });
            setLoadedKind("sandbox");
            resolve({ total: sandboxEntry.duration, out: sandboxEntry.outAt ?? null });
            return;
          }
          setLoadedKind("gsap");
          pending.current = resolve;
          const base = getComponentMeta(key as ComponentKey).defaultConfig;
          setLoaded({ key, format, config: { ...base, ...(transparent ? { backgroundColor: "transparent" } : {}) } });
        }),
      seek: (t) =>
        new Promise<void>((resolve) => {
          if (loadedKindRef.current === "sandbox") {
            // Ack : résolu par onFrame (FRAME_READY de l'iframe).
            API_REF.seekWaiters.current.push(resolve);
            setSandboxTime(t);
            return;
          }
          tlRef.current?.pause(Math.max(0, t));
          void frame().then(frame).then(resolve);
        }),
      sampleOpacity: async (times) => {
        const root = stageRef.current;
        if (!root) return [];
        const els = contentElements(root);
        const samples: ElementSample[] = els.map((el, i) => ({ o: [], label: labelOf(el, i) }));
        for (const t of times) {
          tlRef.current?.pause(Math.max(0, t));
          // Lecture synchrone des styles calculés : pas besoin d'attendre l'affichage.
          els.forEach((el, i) => samples[i].o.push(Math.round(effectiveOpacity(el, root) * 100) / 100));
        }
        return samples;
      },
      overflow: () => {
        const root = stageRef.current;
        if (!root) return [];
        const box = root.getBoundingClientRect();
        const res: { label: string; dx: number; dy: number }[] = [];
        contentElements(root).forEach((el, i) => {
          const hasText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? "").trim().length > 0);
          if (!hasText || effectiveOpacity(el, root) < 0.5) return;
          const r = el.getBoundingClientRect();
          const dx = Math.max(0, box.left - r.left, r.right - box.right);
          const dy = Math.max(0, box.top - r.top, r.bottom - box.bottom);
          if (dx > 2 || dy > 2) res.push({ label: labelOf(el, i), dx: Math.round(dx), dy: Math.round(dy) });
        });
        return res;
      },
      coverage: () => {
        const root = stageRef.current;
        if (!root) return [];
        const box = root.getBoundingClientRect();
        const area = box.width * box.height;
        const res: { label: string; area: number; opaque: boolean }[] = [];
        root.querySelectorAll("*").forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const a = (Math.min(r.right, box.right) - Math.max(r.left, box.left)) * (Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top));
          if (a < area * 0.9) return;
          const cs = getComputedStyle(el);
          const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
          const alpha = m ? Number(m[1].split(",")[3] ?? 1) : 0;
          const opaque = alpha > 0.05 || (cs.backgroundImage !== "none" && !/^url/.test(cs.backgroundImage));
          if (opaque) res.push({ label: labelOf(el, i), area: Math.round((a / area) * 100), opaque });
        });
        return res;
      },
    };
  }, [ready, sandboxTemplates]);

  const Frame = loaded ? STUDIO_FRAMES[loaded.key as ComponentKey] : null;
  const size = loaded ? SIZES[loaded.format] : SIZES["16:9"];
  const sandboxEntry = sandboxTemplates.find((t) => t.key === loaded?.key) ?? null;
  /* Ack du seek sandbox : la promesse résout UNIQUEMENT sur FRAME_READY
   * (l'ordonnancement SET_PARAMS -> ack -> SEEK -> frame) + secours 4 s. */
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "#808080" }}>
      <div
        ref={stageRef}
        data-tc-stage
        className="relative overflow-hidden"
        style={{ width: size.width, height: size.height, containerType: "size", backgroundColor: loaded?.config.backgroundColor === "transparent" ? "transparent" : undefined }}
        key={loaded ? `${loaded.key}-${loaded.format}-${loaded.config.backgroundColor}` : "none"}
      >
        {loaded && sandboxEntry ? (
          <div
            className="absolute inset-0 h-full w-full overflow-hidden"
            style={{ backgroundColor: loaded.config.backgroundColor }}
          >
            <SandboxTimelineFrame
              preview
              code={sandboxEntry.code}
              params={loaded.config as import("@/components/studio/sandbox-frame").SandboxParams}
              time={sandboxTime}
              compatible={sandboxEntry.compatible}
              onFrame={(info) => {
                // Acquittement RÉEL : dépile les seek en attente.
                void info;
                API_REF.seekWaiters.current.forEach((resolve) => resolve());
                API_REF.seekWaiters.current = [];
              }}
            />
          </div>
        ) : Frame && loaded ? (
          <div className="absolute inset-0 h-full w-full overflow-hidden" style={{ backgroundColor: loaded.config.backgroundColor }}>
            <Frame config={loaded.config} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
