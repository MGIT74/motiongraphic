"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildDashboardReveal } from "@/lib/animations/builders";

const DEFAULT = ["Overview", "Revenue | €48.2K | +12.8%", "Customers | 2,840 | +8.4%", "Conversion | 4.82% | +2.1%"];
const BARS = [38, 57, 44, 71, 60, 83, 69, 92, 77, 100, 84, 96];

export function DashboardReveal01Frame({ config }: AnimationComponentProps) {
  const lines = config.text.slice(0, 800).split("\n").map((s) => s.trim()).filter(Boolean);
  const heading = lines[0] || DEFAULT[0];
  const metrics = [0, 1, 2].map((i) => {
    const [name, value, change] = (lines[i + 1] || DEFAULT[i + 1]).split("|").map((s) => s.trim());
    const fallback = DEFAULT[i + 1].split("|").map((s) => s.trim());
    return { name: name || fallback[0], value: value || fallback[1], change: change || fallback[2] };
  });
  const ink = config.primaryColor;
  const accent = config.accentColor;
  const panel = { background: "rgba(255,255,255,0.055)", border: "0.13cqmin solid rgba(255,255,255,0.11)", borderRadius: "2.5cqmin" };
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden" style={{ backgroundColor: config.backgroundColor, containerType: "size", color: ink }}>
      <div data-dashboard-shell className="flex flex-col" style={{ width: "min(92cqw, 115cqh)", maxHeight: "92cqh", gap: "2.3cqmin", padding: "3cqmin", borderRadius: "3cqmin", background: "rgba(255,255,255,0.035)", border: "0.13cqmin solid rgba(255,255,255,0.10)" }}>
        <div data-dashboard-header className="flex items-center justify-between" style={{ gap: "2cqmin" }}>
          <div className="flex items-center" style={{ gap: "1.8cqmin" }}>
            <div style={{ width: "3cqmin", height: "3cqmin", borderRadius: "0.9cqmin", background: accent }} />
            <span style={{ fontWeight: 750, fontSize: "4.1cqmin", lineHeight: 1.1 }}>{heading}</span>
          </div>
          <span style={{ fontSize: "1.9cqmin", opacity: 0.55 }}>ANALYTICS / 2026</span>
        </div>
        <div className="grid grid-cols-3" style={{ gap: "1.8cqmin" }}>
          {metrics.map((metric, i) => (
            <div data-dashboard-stat key={i} className="flex flex-col" style={{ ...panel, padding: "2.4cqmin", gap: "1.1cqmin", minWidth: 0 }}>
              <span style={{ fontSize: "2.1cqmin", opacity: 0.64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metric.name}</span>
              <strong style={{ fontSize: "4.3cqmin", letterSpacing: "-0.045em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metric.value}</strong>
              <span style={{ color: accent, fontSize: "2.1cqmin", fontWeight: 700 }}>{metric.change}</span>
            </div>
          ))}
        </div>
        <div data-dashboard-chart style={{ ...panel, padding: "2.4cqmin", display: "flex", flexDirection: "column", gap: "2cqmin" }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: "2.6cqmin", fontWeight: 700 }}>Performance</span>
            <span style={{ fontSize: "1.9cqmin", opacity: 0.55 }}>Last 12 months</span>
          </div>
          <div className="flex items-end" style={{ height: "20cqmin", gap: "1.2cqmin", borderBottom: "0.13cqmin solid rgba(255,255,255,0.15)" }}>
            {BARS.map((height, i) => (
              <div key={i} className="flex-1" style={{ height: "100%", display: "flex", alignItems: "end" }}>
                <div data-dashboard-bar style={{ width: "100%", height: height + "%", borderRadius: "0.65cqmin 0.65cqmin 0 0", background: i === 9 ? accent : "rgba(255,255,255,0.24)", transformOrigin: "bottom center" }} />
              </div>
            ))}
          </div>
        </div>
        <div data-dashboard-footer className="flex items-center justify-between" style={{ fontSize: "2cqmin", opacity: 0.6 }}>
          <span>Live insights</span><span>● &nbsp; All systems operational</span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardReveal01({ config }: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.speed],
    speed: config.speed,
    build: (root) => buildDashboardReveal(root, config),
  });
  return <div ref={rootRef} className="absolute inset-0"><DashboardReveal01Frame config={config} /></div>;
}
