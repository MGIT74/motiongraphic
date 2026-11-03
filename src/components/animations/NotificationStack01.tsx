"use client";

import { Fragment, type CSSProperties } from "react";
import type { AnimationComponentProps } from "@/types/animation";
import { useAnimationEngine } from "./engine";
import { buildNotificationStack } from "@/lib/animations/builders";
import { initialsOf, isDarkColor, parseNotifications, type NotificationIcon } from "@/lib/animations/notifications";

/**
 * Notification Stack — des notifications de téléphone arrivent une à une,
 * en cartes de verre dépoli : la carte apparaît (flou → net), puis l'en-tête,
 * le titre et le message se révèlent mot par mot ; la pile remonte pour garder
 * la dernière notification au centre.
 *
 * `NotificationStack01Frame` = DOM pur (réutilisé par le Studio et le rendu MP4).
 * Fond « transparent » : seules les cartes sont dessinées (à poser sur une capture).
 */
export function NotificationStack01Frame({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor } = config;
  const items = parseNotifications(text);
  const transparent = backgroundColor === "transparent";
  const dark = isDarkColor(backgroundColor);

  const card: CSSProperties = dark
    ? {
        background: "rgba(44,44,48,0.62)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 calc(1.6 * var(--u)) calc(4 * var(--u)) calc(-1.6 * var(--u)) rgba(0,0,0,0.55)",
      }
    : {
        background: "rgba(255,255,255,0.62)",
        border: "1px solid rgba(255,255,255,0.75)",
        boxShadow: "0 calc(1.8 * var(--u)) calc(4.4 * var(--u)) calc(-1.8 * var(--u)) rgba(0,0,0,0.18), 0 calc(0.25 * var(--u)) calc(0.8 * var(--u)) rgba(0,0,0,0.05)",
      };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        containerType: "size",
        // Unité de mise en page : hauteur du cadre en paysage/carré, largeur en vertical (9:16).
        ["--u" as string]: "min(1cqh, 1.333cqw)",
        color: primaryColor,
        background: transparent
          ? "transparent"
          : `linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.2) 100%), ${backgroundColor}`,
      }}
      data-notif-root
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          data-notif-stack
          className="flex flex-col will-change-transform"
          style={{ width: "calc(66 * var(--u))", gap: "calc(1.6 * var(--u))" }}
        >
          {items.map((n, i) => (
            <div
              key={i}
              data-notif-card
              className="flex flex-col will-change-transform"
              style={{
                ...card,
                borderRadius: "calc(3.8 * var(--u))",
                padding: n.contact ? "calc(2.2 * var(--u)) calc(2.6 * var(--u))" : "calc(2.3 * var(--u)) calc(2.6 * var(--u)) calc(2.5 * var(--u))",
                gap: "calc(1 * var(--u))",
                backdropFilter: "blur(calc(2.4 * var(--u))) saturate(1.6)",
                WebkitBackdropFilter: "blur(calc(2.4 * var(--u))) saturate(1.6)",
              }}
            >
              {n.contact ? (
                <div className="flex items-center" style={{ gap: "calc(2 * var(--u))" }}>
                  <span data-notif-icon className="relative block shrink-0" style={{ width: "calc(8.4 * var(--u))", height: "calc(8.4 * var(--u))" }}>
                    <span
                      className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
                      style={{
                        fontSize: "calc(3 * var(--u))",
                        background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 55%), ${accentColor}`,
                      }}
                    >
                      {initialsOf(n.title)}
                    </span>
                    <span className="absolute" style={{ width: "calc(3.4 * var(--u))", height: "calc(3.4 * var(--u))", right: "calc(-0.5 * var(--u))", bottom: "calc(-0.3 * var(--u))" }}>
                      <AppIcon icon={n.icon} app={n.app} accent={accentColor} />
                    </span>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col" style={{ gap: "calc(0.2 * var(--u))" }}>
                    <div className="flex items-baseline justify-between" style={{ gap: "calc(1 * var(--u))" }}>
                      <span data-notif-app className="truncate" style={{ fontSize: "calc(3.1 * var(--u))", fontWeight: 600, letterSpacing: "-0.01em" }}>
                        {n.title}
                      </span>
                      {n.time ? (
                        <span data-notif-time className="shrink-0" style={{ fontSize: "calc(2.2 * var(--u))", opacity: 0.4 }}>
                          {n.time}
                        </span>
                      ) : null}
                    </div>
                    {n.message ? (
                      <span style={{ fontSize: "calc(2.7 * var(--u))", lineHeight: 1.25, opacity: 0.82 }}>
                        <Words text={n.message} attr="data-notif-word" />
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center" style={{ gap: "calc(1.5 * var(--u))" }}>
                    <span data-notif-icon className="shrink-0" style={{ width: "calc(5.8 * var(--u))", height: "calc(5.8 * var(--u))" }}>
                      <AppIcon icon={n.icon} app={n.app} accent={accentColor} />
                    </span>
                    <span data-notif-app className="min-w-0 flex-1 truncate" style={{ fontSize: "calc(3 * var(--u))", fontWeight: 500 }}>
                      {n.app}
                    </span>
                    {n.time ? (
                      <span data-notif-time className="shrink-0 self-start" style={{ fontSize: "calc(2.2 * var(--u))", opacity: 0.4 }}>
                        {n.time}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col" style={{ gap: "calc(0.3 * var(--u))" }}>
                    {n.title ? (
                      <span style={{ fontSize: "calc(3.1 * var(--u))", fontWeight: 650, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                        <Words text={n.title} attr="data-notif-word" />
                      </span>
                    ) : null}
                    {n.message ? (
                      <span style={{ fontSize: "calc(2.7 * var(--u))", lineHeight: 1.28, opacity: 0.82 }}>
                        <Words text={n.message} attr="data-notif-word" />
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mots animables séparés par de vrais espaces (pas d'écrasement des espaces). */
function Words({ text, attr }: { text: string; attr: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="inline-block will-change-transform" {...{ [attr]: "" }}>
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

/** Pictogrammes génériques (pas de logos de marque). */
function AppIcon({ icon, app, accent }: { icon: NotificationIcon; app: string; accent: string }) {
  const box: CSSProperties = { width: "100%", height: "100%", display: "block" };
  const squircle = (fill: string, children: React.ReactNode, id: string) => (
    <svg viewBox="0 0 44 44" style={box} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#000" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="10.5" fill={fill} />
      <rect width="44" height="44" rx="10.5" fill={`url(#${id})`} />
      {children}
    </svg>
  );
  switch (icon) {
    case "chat":
      return squircle(
        "#30C552",
        <path d="M22 11c-6.9 0-12.5 4.5-12.5 10.1 0 3.2 1.8 6 4.7 7.9-.3 1.8-1.2 3.5-2.6 4.7 2.9-.1 5.3-1.2 7-2.6 1.1.3 2.2.4 3.4.4 6.9 0 12.5-4.5 12.5-10.2S28.9 11 22 11z" fill="#fff" />,
        "g-chat"
      );
    case "mail":
      return squircle(
        "#1F7AEC",
        <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round">
          <rect x="10" y="13.5" width="24" height="17" rx="3" />
          <path d="M11 15.5l11 8 11-8" />
        </g>,
        "g-mail"
      );
    case "calendar":
      return (
        <svg viewBox="0 0 44 44" style={box} aria-hidden="true">
          <rect width="44" height="44" rx="10.5" fill="#fff" />
          <rect x="0.5" y="0.5" width="43" height="43" rx="10" fill="none" stroke="rgba(0,0,0,0.08)" />
          <text x="22" y="15" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#FF3B30" fontFamily="system-ui, sans-serif">
            LUN
          </text>
          <text x="22" y="34" textAnchor="middle" fontSize="18" fontWeight="400" fill="#1C1C1E" fontFamily="system-ui, sans-serif">
            17
          </text>
        </svg>
      );
    case "payment":
      return squircle(
        "#5B5BD6",
        <g fill="none" stroke="#fff" strokeWidth="2.3">
          <rect x="9.5" y="13" width="25" height="18" rx="3.2" />
          <path d="M9.5 18.5h25" strokeWidth="3.2" />
          <path d="M14 26h6" strokeLinecap="round" />
        </g>,
        "g-pay"
      );
    case "team":
      return squircle(
        "#2C2C30",
        <path d="M18 11l-2.2 22M28.2 11L26 33M12 18h21M11 26h21" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />,
        "g-team"
      );
    case "bell":
      return squircle(
        "#FF9F0A",
        <path d="M22 11c-4.4 0-7.4 3.3-7.4 7.6v5.2l-2.3 3.6c-.4.7.1 1.5.9 1.5h17.6c.8 0 1.3-.8.9-1.5l-2.3-3.6v-5.2C29.4 14.3 26.4 11 22 11zm-3 19.4a3 3 0 0 0 6 0z" fill="#fff" />,
        "g-bell"
      );
    default:
      return squircle(
        accent,
        <text x="22" y="29.5" textAnchor="middle" fontSize="20" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
          {(app.trim()[0] || "•").toUpperCase()}
        </text>,
        "g-letter"
      );
  }
}

export default function NotificationStack01({ config }: AnimationComponentProps) {
  const { text, primaryColor, accentColor, backgroundColor, duration, speed } = config;
  const rootRef = useAnimationEngine({
    deps: [text, primaryColor, accentColor, backgroundColor, duration, speed],
    speed,
    build: (root) => buildNotificationStack(root, config),
  });
  return (
    <div ref={rootRef} className="absolute inset-0">
      <NotificationStack01Frame config={config} />
    </div>
  );
}
