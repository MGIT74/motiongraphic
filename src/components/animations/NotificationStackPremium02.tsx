"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildNotificationStackPremium } from "@/lib/animations/builders";

const NOTIFICATIONS = [
  { icon: "✓", title: "Payment received", detail: "Your invoice has been paid", time: "now" },
  { icon: "↗", title: "New milestone", detail: "Your project is moving forward", time: "2m" },
  { icon: "✦", title: "You're all set", detail: "Everything is ready to launch", time: "5m" },
];

export function NotificationStackPremium02Frame({ config }: AnimationComponentProps) {
  const labels = config.text.slice(0, 800).split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden" style={{
      backgroundColor: config.backgroundColor, containerType: "size",
      fontFamily: config.fontFamily || "inherit",
    }}>
      <div className="relative flex flex-col" style={{ width: "min(86cqw, 75cqh)", gap: "2cqmin", perspective: "100cqw" }}>
        {NOTIFICATIONS.map((item, i) => (
          <div key={i} data-premium-notification className="relative flex items-center" style={{
            gap: "3cqmin", padding: "3.5cqmin 4cqmin",
            background: "#FFFFFF", border: "1px solid rgba(30,40,55,.07)",
            borderRadius: "3cqmin",
            boxShadow: "0 2cqmin 6cqmin rgba(21,30,46,.10), 0 .3cqmin 1cqmin rgba(21,30,46,.06)",
            transformOrigin: "center center",
          }}>
            <div data-premium-icon className="flex shrink-0 items-center justify-center" style={{
              width: "9cqmin", height: "9cqmin", borderRadius: "2.3cqmin",
              backgroundColor: config.accentColor, color: "#FFFFFF",
              fontSize: "5cqmin", fontWeight: 700,
            }}>{item.icon}</div>
            <div data-premium-content className="min-w-0 flex-1">
              <div className="flex items-center justify-between" style={{ gap: "2cqmin" }}>
                <span style={{ color: config.primaryColor, fontSize: "3.6cqmin", fontWeight: 720, lineHeight: 1.2 }}>{labels[i] || item.title}</span>
                <span style={{ color: "#9CA3AF", fontSize: "2.4cqmin" }}>{item.time}</span>
              </div>
              <div style={{ color: "#6B7280", fontSize: "2.8cqmin", marginTop: ".7cqmin", lineHeight: 1.3 }}>{item.detail}</div>
            </div>
            <span data-premium-glow aria-hidden="true" className="pointer-events-none absolute inset-0" style={{
              borderRadius: "inherit", boxShadow: "inset 0 0 0 .3cqmin " + config.accentColor, opacity: 0,
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NotificationStackPremium02({ config }: AnimationComponentProps) {
  const rootRef = useAnimationEngine({
    deps: [config.text, config.primaryColor, config.accentColor, config.backgroundColor, config.duration, config.speed, config.fontFamily, config.entranceDirection],
    speed: config.speed,
    build: (root) => buildNotificationStackPremium(root, config),
  });
  return <div ref={rootRef} className="absolute inset-0"><NotificationStackPremium02Frame config={config} /></div>;
}
