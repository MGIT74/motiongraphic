"use client";

import { createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { MediaAsset, StudioElement } from "@/lib/studio/project-model";

/**
 * Contexte des médias : URL de lecture signées, mode de lecture.
 * - `deterministic` (page de rendu) : chaque image attend que la vidéo soit
 *   positionnée à l'instant exact avant la capture ;
 * - sinon (Studio) : la vidéo joue en direct et se recale si elle dérive.
 */
export interface MediaRuntime {
  urls: Record<string, string>;
  deterministic: boolean;
  playing: boolean;
}

export const MediaRuntimeContext = createContext<MediaRuntime>({ urls: {}, deterministic: false, playing: false });

/** Attentes en cours (rendu) : la capture d'une image attend leur résolution. */
export const pendingMediaWaits = new Set<Promise<void>>();

function track(promise: Promise<void>) {
  const wrapped = promise.finally(() => pendingMediaWaits.delete(wrapped));
  pendingMediaWaits.add(wrapped);
}

const ease = (p: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);

/** Opacité / transformation de l'entrée, de la sortie et du mouvement lent. */
function mediaMotion(element: StudioElement, localTime: number): { opacity: number; transform: string; inner: string } {
  const m = element.media!;
  const D = Math.max(0.1, element.duration);
  const enterLen = Math.min(0.6, D / 3);
  const exitLen = element.timing === "hold" ? 0 : Math.min(0.45, D / 4);
  const pIn = m.enter === "none" ? 1 : ease(localTime / enterLen);
  const pOut = exitLen > 0 ? ease((D - localTime) / exitLen) : 1;
  const vis = Math.min(pIn, pOut);
  let transform = "";
  if (m.enter === "rise") transform = `translateY(${(1 - vis) * 6}%)`;
  if (m.enter === "scale") transform = `scale(${0.92 + 0.08 * vis})`;
  const t = Math.max(0, Math.min(1, localTime / D));
  const inner =
    m.motion === "zoom-in" ? `scale(${1 + 0.12 * t})`
    : m.motion === "zoom-out" ? `scale(${1.12 - 0.12 * t})`
    : m.motion === "pan-left" ? `scale(1.08) translateX(${3 - 6 * t}%)`
    : m.motion === "pan-right" ? `scale(1.08) translateX(${-3 + 6 * t}%)`
    : "";
  return { opacity: m.enter === "none" && exitLen === 0 ? 1 : vis, transform, inner };
}

function MediaContent({ asset, url, element, localTime }: { asset: MediaAsset; url?: string; element: StudioElement; localTime: number }) {
  const runtime = useContext(MediaRuntimeContext);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const m = element.media!;
  const target = Math.max(0, Math.min((asset.duration ?? 3600) - 0.05, m.trimStart + localTime));

  // Vidéo : rendu déterministe (seek + attente) ou lecture synchronisée (Studio).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || asset.kind !== "video") return;
    if (runtime.deterministic) {
      video.pause();
      if (Math.abs(video.currentTime - target) < 0.004 && video.readyState >= 2) return;
      track(
        new Promise<void>((resolve) => {
          // « seeked » puis une image d'affichage : la nouvelle image vidéo est peinte.
          // (requestVideoFrameCallback ne se déclenche pas toujours sans fenêtre.)
          const done = () => {
            video.removeEventListener("seeked", done);
            requestAnimationFrame(() => resolve());
          };
          video.addEventListener("seeked", done);
          const seek = () => {
            video.currentTime = target;
          };
          if (video.readyState >= 1) seek();
          else video.addEventListener("loadedmetadata", seek, { once: true });
          setTimeout(() => {
            video.removeEventListener("seeked", done);
            resolve();
          }, 2000);
        })
      );
      return;
    }
    if (runtime.playing) {
      if (Math.abs(video.currentTime - target) > 0.3) video.currentTime = target;
      if (video.paused) void video.play().catch(() => undefined);
    } else {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - target) > 0.04) video.currentTime = target;
    }
  }, [target, runtime.deterministic, runtime.playing, asset.kind]);

  // Image : en rendu, attendre son chargement complet.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !runtime.deterministic || img.complete) return;
    track(
      new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
        setTimeout(resolve, 6000);
      })
    );
  }, [url, runtime.deterministic]);

  const style: CSSProperties = { width: "100%", height: "100%", objectFit: m.fit, display: "block" };
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white/5 text-[11px] text-white/50">
        {asset.name}
      </div>
    );
  }
  if (asset.kind === "video") {
    return <video ref={videoRef} src={url} muted playsInline preload="auto" style={style}/>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imgRef} src={url} alt={asset.name} draggable={false} style={style} decoding="sync" />;
}

/** Habillage : fenêtre de navigateur ou téléphone autour du média. */
function Frame({ frame, asset, children }: { frame: "none" | "browser" | "phone"; asset: MediaAsset; children: ReactNode }) {
  if (frame === "browser") {
    const ratio = asset.width && asset.height ? asset.width / asset.height : 16 / 10;
    return (
      <div
        className="relative overflow-hidden"
        style={{
          width: `min(80cqw, calc(80cqh * ${ratio}))`,
          aspectRatio: `${ratio} / 1`,
          borderRadius: "1.6cqmin",
          background: "#0d0f14",
          boxShadow: "0 4cqmin 10cqmin -4cqmin rgba(0,0,0,0.7), 0 0 0 0.15cqmin rgba(255,255,255,0.12)",
          paddingTop: "4.2cqmin",
        }}
      >
        <div className="absolute inset-x-0 top-0 flex items-center gap-[1cqmin] px-[1.6cqmin]" style={{ height: "4.2cqmin", background: "#1a1d24" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: "1.3cqmin", height: "1.3cqmin", borderRadius: "50%", background: c }} />
          ))}
          <span className="ml-[1.5cqmin] flex-1 rounded-full" style={{ height: "2.2cqmin", background: "rgba(255,255,255,0.07)", maxWidth: "45%" }} />
        </div>
        <div className="h-full w-full overflow-hidden">{children}</div>
      </div>
    );
  }
  if (frame === "phone") {
    return (
      <div
        className="relative overflow-hidden"
        style={{
          height: "86cqh",
          aspectRatio: "9 / 19.5",
          maxWidth: "80cqw",
          borderRadius: "6cqmin",
          background: "#000",
          padding: "1.4cqmin",
          boxShadow: "0 4cqmin 10cqmin -4cqmin rgba(0,0,0,0.75), 0 0 0 0.35cqmin #2a2d34",
        }}
      >
        <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: "4.8cqmin" }}>
          {children}
          <span className="absolute left-1/2 top-[1.4cqmin] -translate-x-1/2 rounded-full bg-black" style={{ width: "28%", height: "2.6cqmin" }} />
        </div>
      </div>
    );
  }
  return <div className="h-full w-full overflow-hidden">{children}</div>;
}

/** Calque média (image/vidéo) : mêmes règles de timing que les templates animés. */
export default function MediaLayer({ element, asset, localTime }: { element: StudioElement; asset: MediaAsset | undefined; localTime: number }) {
  const runtime = useContext(MediaRuntimeContext);
  if (!element.media) return null;
  if (!asset) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50" data-mgsi-element>
        Média introuvable
      </div>
    );
  }
  const motion = mediaMotion(element, localTime);
  const framed = element.media.frame !== "none";
  return (
    <div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ containerType: "size", opacity: motion.opacity }}
      data-mgsi-element
      data-mgsi-media={asset.kind}
    >
      <div
        className={framed ? "flex items-center justify-center" : "h-full w-full"}
        style={{ transform: motion.transform, width: "100%", height: "100%" }}
      >
        <Frame frame={element.media.frame} asset={asset}>
          <div className="h-full w-full" style={{ transform: motion.inner, transformOrigin: "center" }}>
            <MediaContent asset={asset} url={runtime.urls[asset.id]} element={element} localTime={localTime} />
          </div>
        </Frame>
      </div>
    </div>
  );
}
