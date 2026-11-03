/**
 * Polices du kit de marque (liste blanche). Fichiers servis localement via
 * @fontsource (aucun appel réseau à Google Fonts) — importés par le Studio
 * et la page de rendu (`src/app/studio-fonts.css`).
 */
export interface BrandFont {
  id: string;
  label: string;
  /** Valeur CSS font-family. */
  css: string;
}

export const BRAND_FONTS: BrandFont[] = [
  { id: "system", label: "Système (par défaut)", css: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "inter", label: "Inter", css: "'Inter Variable', 'Inter', sans-serif" },
  { id: "manrope", label: "Manrope", css: "'Manrope Variable', 'Manrope', sans-serif" },
  { id: "poppins", label: "Poppins", css: "'Poppins', sans-serif" },
  { id: "montserrat", label: "Montserrat", css: "'Montserrat Variable', 'Montserrat', sans-serif" },
  { id: "space-grotesk", label: "Space Grotesk", css: "'Space Grotesk Variable', 'Space Grotesk', sans-serif" },
  { id: "dm-sans", label: "DM Sans", css: "'DM Sans Variable', 'DM Sans', sans-serif" },
  { id: "playfair", label: "Playfair Display", css: "'Playfair Display Variable', 'Playfair Display', serif" },
];

const BY_ID = new Map(BRAND_FONTS.map((f) => [f.id, f]));

export function isBrandFont(value: unknown): value is string {
  return typeof value === "string" && BY_ID.has(value);
}

/** font-family CSS d'un identifiant (undefined = hériter). */
export function fontCss(id: string | undefined): string | undefined {
  if (!id || id === "system") return undefined;
  return BY_ID.get(id)?.css;
}
