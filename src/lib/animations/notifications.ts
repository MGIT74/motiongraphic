/**
 * Notification Stack — modèle de données partagé (cadre DOM + builder GSAP).
 *
 * Le texte du template décrit les notifications, une par ligne :
 *   App | Titre | Message | Heure
 * (champs optionnels à partir du 2e ; « | » ou « — » comme séparateur).
 */
export interface NotificationItem {
  app: string;
  title: string;
  message: string;
  time: string;
  icon: NotificationIcon;
  /** Titre écrit « @Nom » : notification de contact (avatar + badge d'app). */
  contact: boolean;
}

export type NotificationIcon = "chat" | "mail" | "calendar" | "payment" | "team" | "bell" | "letter";

export const NOTIFICATION_MAX = 8;

export const NOTIFICATION_DEFAULT_TEXT = [
  "Messages | Aline Flodern | Ton rendez-vous est confirmé pour demain 10h | maintenant",
  "WhatsApp | @Dario Arden | J'arrive dans cinq minutes | 1 min",
  "Mail | Nouvelle commande | Commande #1042 reçue sur votre boutique | 2 min",
  "Paiement | Paiement reçu | 249,00 € de Studio Nova | 5 min",
].join("\n");

const ICON_RULES: [RegExp, NotificationIcon][] = [
  [/messag|sms|whats|chat|imessage|telegram|signal|messenger/i, "chat"],
  [/mail|gmail|outlook|courriel/i, "mail"],
  [/calend|agenda|rendez|meet|réunion|reunion/i, "calendar"],
  [/pay|paiement|stripe|vente|commande|order|shop|boutique|banque|bank|facture|invoice/i, "payment"],
  [/slack|team|équipe|equipe|discord|notion|linear|jira/i, "team"],
  [/rappel|reminder|alerte|alert|notif/i, "bell"],
];

export function iconFor(app: string): NotificationIcon {
  for (const [re, icon] of ICON_RULES) if (re.test(app)) return icon;
  return "letter";
}

export function parseNotifications(text: string): NotificationItem[] {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, NOTIFICATION_MAX)
    .map((line) => {
      const parts = line.split(/\s*[|]\s*/);
      if (parts.length === 1) {
        return { app: "Notification", title: "", message: parts[0], time: "maintenant", icon: "bell" as const, contact: false };
      }
      const [app, rawTitle = "", message = "", time = ""] = parts;
      const contact = rawTitle.startsWith("@") && rawTitle.length > 1;
      const title = contact ? rawTitle.slice(1).trim() : rawTitle;
      return { app: app || "App", title, message, time, icon: iconFor(app || ""), contact };
    });
}

/** Le fond est-il sombre ? (cartes sombres en conséquence) — couleurs #RRGGBB uniquement. */
export function isDarkColor(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

/** Initiales d'un nom (avatar de contact). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "•";
}
