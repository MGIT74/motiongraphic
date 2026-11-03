export type ComponentKey =
  | "kinetic-type-01"
  | "text-reveal-01"
  | "elastic-text-01"
  | "shape-morph-01"
  | "staggered-cards-01"
  | "logo-reveal-01"
  | "minimal-saas-ui-01"
  | "notification-stack-01";

export interface AnimationConfig {
  /** Texte principal affiché par l'animation */
  text: string;
  /** Couleur principale de l'animation (format CSS) */
  primaryColor: string;
  /** Couleur d'accent secondaire (format CSS) */
  accentColor: string;
  /** Couleur de fond du cadre d'animation (format CSS) */
  backgroundColor: string;
  /** Durée d'un cycle en secondes (utilisée comme base de timing) */
  duration: number;
  /** Multiplicateur de vitesse (0.25 - 3) */
  speed: number;
  /** Police (identifiant de la liste blanche BRAND_FONTS) — optionnel. */
  fontFamily?: string;
  /** Logo importé (data URL image, ≤ 400 Ko) — utilisé par Logo Reveal. */
  logoUrl?: string;
}

export interface AnimationComponentProps {
  config: AnimationConfig;
}