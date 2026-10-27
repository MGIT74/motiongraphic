import type { AnimationConfig, ComponentKey } from "@/types/animation";

/**
 * Registre (métadonnées) des composants d'animation compilés dans le code source.
 * Le mapping clé -> composant React vit dans `AnimationPlayer` (client uniquement).
 * Ce fichier reste sûrement importable côté serveur (aucune UI).
 */
export interface ComponentMeta {
  key: ComponentKey;
  name: string;
  description: string;
  technologies: string[];
  defaultConfig: AnimationConfig;
}

const CONFIG = (overrides: Partial<AnimationConfig> = {}): AnimationConfig => ({
  text: "MOTION",
  primaryColor: "#F5F5F7",
  accentColor: "#0A84FF",
  backgroundColor: "#000000",
  duration: 3,
  speed: 1,
  ...overrides,
});

export const COMPONENT_REGISTRY: Record<ComponentKey, ComponentMeta> = {
  "kinetic-type-01": {
    key: "kinetic-type-01",
    name: "Kinetic Typography",
    description:
      "Typographie cinétique : les lettres apparaissent séquentiellement depuis un masque bas, avec un léger décalage et un point d'accent final.",
    technologies: ["React", "GSAP", "SVG"],
    defaultConfig: CONFIG({ text: "MOTION", duration: 3.2 }),
  },
  "text-reveal-01": {
    key: "text-reveal-01",
    name: "Text Reveal (Masque)",
    description:
      "Révélation de texte par masque vertical, par ligne, avec un balayage lumineux et une sortie douce en boucle.",
    technologies: ["React", "GSAP", "CSS"],
    defaultConfig: CONFIG({ text: "CRÉER\nEN CODE", duration: 3.6 }),
  },
  "elastic-text-01": {
    key: "elastic-text-01",
    name: "Elastic Text",
    description:
      "Le texte rebondit en place avec un easing élastique, lettre par lettre, pour un effet énergique et rythmé.",
    technologies: ["React", "GSAP"],
    defaultConfig: CONFIG({ text: "BOUNCE", accentColor: "#64D2FF", duration: 3 }),
  },
  "shape-morph-01": {
    key: "shape-morph-01",
    name: "Shape Morph",
    description:
      "Une forme géométrique se transforme continûment (carré, octogone, étoile) grâce à l'interpolation de clip-path, avec rotation lente.",
    technologies: ["React", "GSAP", "CSS"],
    defaultConfig: CONFIG({ text: "MORPH", accentColor: "#64D2FF", duration: 6 }),
  },
  "staggered-cards-01": {
    key: "staggered-cards-01",
    name: "Staggered Cards",
    description:
      "Trois cartes s'empilent en cascade avec un rebond léger — idéal pour présenter une interface ou des étapes de design.",
    technologies: ["React", "GSAP", "CSS"],
    defaultConfig: CONFIG({ text: "UI MOTION", primaryColor: "#E7E7EF", duration: 4.2 }),
  },
  "logo-reveal-01": {
    key: "logo-reveal-01",
    name: "Logo Reveal",
    description:
      "Un logo abstrait se dessine par la lumière : tracé du trait, halo pulsé, mot-symbole qui s'éclaircit.",
    technologies: ["React", "GSAP", "SVG"],
    defaultConfig: CONFIG({ text: "STUDIO", accentColor: "#64D2FF", duration: 4.4 }),
  },
};

export const COMPONENT_KEYS = Object.keys(COMPONENT_REGISTRY) as ComponentKey[];

export function getComponentMeta(key: ComponentKey): ComponentMeta {
  return COMPONENT_REGISTRY[key];
}

/** Liste des clés valides, pour validation de données (admin/API). */
export function isComponentKey(value: string): value is ComponentKey {
  return value in COMPONENT_REGISTRY;
}