"use client";

import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildStaggeredCards } from "@/lib/animations/builders";

/**
 * Staggered Cards — apparition progressive de cartes en cascade,
 * avec rebond léger (back.out) et sortie inversée en boucle.
 *
 * `StaggeredCards01Frame` = DOM pur (réutilisé tel quel par le Studio).
 */
/** Découpe « idée · idée · idée » en cartes de message (2 à 6). Sinon : mode décoratif d'origine. */
export function parseCardItems(text: string | undefined): string[] {
  if (!text) return [];
  const items = text
    .split(/[·|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return items.length >= 2 ? items.slice(0, 6) : [];
}

function MessageCards({
  items,
  primary,
  accent,
  background,
}: {
  items: string[];
  primary: string;
  accent: string;
  background: string;
}) {
  const cols = items.length <= 3 ? items.length : items.length === 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const cap = cols === 1 ? 60 : cols === 2 ? 36 : 27;
  // Largeur bornée par le nombre de lignes pour que la grille tienne dans la hauteur du cadre.
  const width = `min(${cap}cqw, ${((88 / rows) * 1.05 - 2).toFixed(1)}cqh)`;
  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{
        backgroundColor: background,
        minHeight: "100%",
        containerType: "size",
      }}
    >
      <div
        className="grid justify-center"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${width})`,
          gap: "min(2.4cqw, 3cqh)",
        }}
      >
        {items.map((label, i) => (
          <div
            key={i}
            data-card
            className="flex flex-col justify-between rounded-3xl will-change-transform"
            style={{
              containerType: "inline-size",
              aspectRatio: "1.05",
              background:
                i % 2 === 0
                  ? "rgba(255,255,255,0.07)"
                  : "rgba(255,255,255,0.11)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: `0 28px 60px -28px rgba(0,0,0,0.8), 0 0 0 1px ${accent}22 inset`,
            }}
          >
            <div
              className="flex h-full flex-col justify-between"
              style={{ padding: "9cqw" }}
            >
              <span
                className="font-bold tabular-nums"
                style={{
                  color: accent,
                  fontSize: "13cqw",
                  letterSpacing: "0.08em",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col" style={{ gap: "6cqw" }}>
                <span
                  data-card-bar
                  className="block rounded-full"
                  style={{
                    height: "1.6cqw",
                    width: "28cqw",
                    backgroundColor: accent,
                  }}
                />
                <span
                  className="font-bold uppercase leading-[1.08]"
                  style={{
                    color: primary,
                    fontSize: "11.5cqw",
                    letterSpacing: "0.01em",
                    overflowWrap: "anywhere",
                  }}
                >
                  {label}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaggeredCards01Frame({ config }: AnimationComponentProps) {
  const { text, accentColor, backgroundColor, primaryColor } = config;
  const items = parseCardItems(text);
  if (items.length >= 2) {
    return (
      <MessageCards
        items={items}
        primary={primaryColor}
        accent={accentColor}
        background={backgroundColor}
      />
    );
  }
  const _primary = primaryColor;
  void _primary;

  const cardStyle = {
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 18px 44px -22px rgba(0,0,0,0.65)",
  };

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden p-6"
      style={{ backgroundColor, minHeight: "100%", containerType: "size" }}
    >
      {text ? (
        <span
          className="font-semibold uppercase tracking-[0.4em]"
          style={{ color: accentColor, fontSize: "2cqmin" }}
        >
          {text}
        </span>
      ) : null}
      <div
        className="flex items-center justify-center"
        style={{ gap: "2.8cqmin" }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-card
            className="flex flex-col gap-2 rounded-xl p-3 will-change-transform"
            style={{
              ...cardStyle,
              backgroundColor: i === 1 ? "rgba(255,255,255,0.08)" : undefined,
              aspectRatio: "0.82",
              width: "14cqmin",
              height: "auto",
            }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor:
                  i === 1 ? accentColor : "rgba(255,255,255,0.35)",
              }}
            />
            <span
              className="flex min-h-1.5 rounded-full"
              style={{
                backgroundColor: "rgba(255,255,255,0.4)",
                flexGrow: 0,
                width: "85%",
                height: "6%",
              }}
            />
            <div data-card-bar className="flex flex-col gap-1 pt-1">
              <span
                className="block h-1 w-4/5 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.22)" }}
              />
              <span
                className="block h-1 w-3/5 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.16)" }}
              />
              <span
                className="block h-1 w-2/5 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.16)" }}
              />
            </div>
            <span
              className="mt-auto block h-1.5 w-1/2 rounded-full"
              style={{
                backgroundColor:
                  i === 1 ? accentColor : "rgba(255,255,255,0.3)",
                opacity: 0.8,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StaggeredCards01({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, duration, speed } =
    config;

  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, duration, speed],
    speed,
    build: (root) =>
      buildStaggeredCards(root, {
        text,
        primaryColor,
        accentColor,
        backgroundColor,
        duration,
        speed,
      }),
  });

  return (
    <div ref={rootRef} className="absolute inset-0">
      <StaggeredCards01Frame config={config} />
    </div>
  );
}
