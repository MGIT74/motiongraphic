"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildAIInputMorph } from "@/lib/animations/builders";

/** Pure DOM frame: timeline-controlled in Studio and deterministic in MP4. */
export function AIInputMorph01Frame({ config }: AnimationComponentProps) {
  const lines = config.text.split("\n").map((s) => s.trim()).filter(Boolean);
  const heading = (lines[0] || "What will you create?").slice(0, 65);
  const prompt = (lines[1] || "Describe your next idea...").slice(0, 95);
  const action = (lines[2] || "Generate").slice(0, 24);
  const ink = config.primaryColor;
  const accent = config.accentColor;
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: config.backgroundColor, containerType: "size", color: ink }}>
      <div data-input-stage className="flex w-full flex-col items-center justify-center"
        style={{ width: "min(86cqw, 105cqmin)", gap: "3cqmin" }}>
        <div data-input-heading style={{ fontSize: "clamp(12px, 5cqmin, 70px)", lineHeight: 1.13, fontWeight: 650, textAlign: "center", maxWidth: "100%", overflowWrap: "anywhere" }}>{heading}</div>
        <div data-input-shell style={{
          width: "100%", border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
          borderRadius: "3.5cqmin", padding: "3cqmin",
          background: "color-mix(in srgb, currentColor 7%, transparent)",
          boxShadow: "0 2cqmin 7cqmin rgba(0,0,0,.14)",
          display: "flex", flexDirection: "column", gap: "3cqmin", position: "relative",
        }}>
          <div data-input-text data-full-text={prompt} style={{ fontSize: "clamp(10px, 2.6cqmin, 32px)", lineHeight: 1.4, overflowWrap: "anywhere" }}>{prompt}<span data-input-caret aria-hidden="true" style={{ display: "inline-block", width: "0.16em", height: "1em", marginLeft: "0.15em", verticalAlign: "-0.13em", backgroundColor: accent }} /></div>
          <div data-input-pointer aria-hidden="true" style={{ position: "absolute", zIndex: 5, right: "8cqmin", bottom: "0.8cqmin", width: "4cqmin", height: "5cqmin", pointerEvents: "none", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.4))" }}>
            <svg viewBox="0 0 24 30" width="100%" height="100%" fill="#ffffff" stroke="#111827" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 2v23l6-6 4.5 9 4-2-4.5-9H22Z"/></svg>
          </div>
          <div data-input-tools style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2cqmin" }}>
            <div style={{ display: "flex", gap: "1.3cqmin" }}>
              <span data-input-tool style={{ display: "grid", placeItems: "center", width: "5.6cqmin", height: "5.6cqmin", borderRadius: "50%", border: "1px solid currentColor" }}>
                <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              </span>
              <span data-input-tool style={{ display: "grid", placeItems: "center", width: "5.6cqmin", height: "5.6cqmin", borderRadius: "50%", border: "1px solid currentColor" }}>
                <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15v3h4v-6H4m16 3v3h-4v-6h4"/></svg>
              </span>
            </div>
            <div data-input-action style={{ display: "flex", alignItems: "center", gap: "1.2cqmin", background: accent, color: "#fff", borderRadius: "10cqmin", padding: "1.7cqmin 2.6cqmin", fontSize: "clamp(10px, 2.4cqmin, 28px)", fontWeight: 650 }}>
              <span>{action}</span>
              <svg viewBox="0 0 24 24" width="2.7cqmin" height="2.7cqmin" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
            </div>
          </div>
        </div>
        <div data-input-caption style={{ fontSize: "2cqmin", opacity: 0.65, textAlign: "center" }}>An idea becomes an interface.</div>
      </div>
    </div>
  );
}

export default function AIInputMorph01({ config }: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.speed],
    speed: config.speed,
    build: (root) => buildAIInputMorph(root, config),
  });
  return <div ref={rootRef} className="absolute inset-0"><AIInputMorph01Frame config={config} /></div>;
}
