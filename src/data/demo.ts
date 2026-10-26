import type { AnimationConfig, ComponentKey } from "@/types/animation";
import type { Category, TemplatePrompt } from "@/types/template";
import { DEMO_PROMPTS } from "@/data/prompts";

/**
 * Données de démonstration — mode "sans Supabase".
 * C'est le même jeu de données que le seed de la migration SQL
 * `supabase/migrations/0001_init.sql` : les identifiants sont volontairement
 * identiques pour que la bascule démo <-> Supabase soit transparente.
 */

const CATEGORY_IDS = {
  typographie: "00000000-0000-4000-8000-000000000001",
  formes: "00000000-0000-4000-8000-000000000002",
  interface: "00000000-0000-4000-8000-000000000003",
  logo: "00000000-0000-4000-8000-000000000004",
} as const;

const ANIM_IDS = {
  kinetic: "00000000-0000-4000-8000-000000000011",
  reveal: "00000000-0000-4000-8000-000000000012",
  elastic: "00000000-0000-4000-8000-000000000013",
  morph: "00000000-0000-4000-8000-000000000014",
  cards: "00000000-0000-4000-8000-000000000015",
  logo: "00000000-0000-4000-8000-000000000016",
} as const;

export const DEMO_CATEGORIES: Category[] = [
  {
    id: CATEGORY_IDS.typographie,
    name: "Typographie",
    slug: "typographie",
    description: "Textes animés, révélations et typographie cinétique.",
    created_at: "2026-10-01T08:00:00.000Z",
  },
  {
    id: CATEGORY_IDS.formes,
    name: "Formes géométriques",
    slug: "formes",
    description: "Morphing, transitions et formes abstraites en mouvement.",
    created_at: "2026-10-01T08:00:00.000Z",
  },
  {
    id: CATEGORY_IDS.interface,
    name: "Interface",
    slug: "interface",
    description: "Composants d'interface mis en scène en motion design.",
    created_at: "2026-10-01T08:00:00.000Z",
  },
  {
    id: CATEGORY_IDS.logo,
    name: "Logo",
    slug: "logo",
    description: "Révélations de logos et de monogrammes animés.",
    created_at: "2026-10-01T08:00:00.000Z",
  },
];

interface DemoTemplateInput {
  id: string;
  title: string;
  slug: string;
  description: string;
  categoryId: keyof typeof CATEGORY_IDS;
  componentKey: ComponentKey;
  config: AnimationConfig;
  duration: number;
}

const TEMPLATES: DemoTemplateInput[] = [
  {
    id: ANIM_IDS.kinetic,
    title: "Kinetic Typography",
    slug: "kinetic-type-01",
    description:
      "Typographie cinétique : chaque lettre glisse depuis un masque bas avec un décalage rythmé, puis un point d'accent vient sceller le mot. Ideal pour des accroches, titres de showreel ou intros de marque.",
    categoryId: "typographie",
    componentKey: "kinetic-type-01",
    config: {
      text: "MOTION",
      primaryColor: "#F5F5F7",
      accentColor: "#7C5CFF",
      backgroundColor: "#0A0A0D",
      duration: 3.2,
      speed: 1,
    },
    duration: 3.2,
  },
  {
    id: ANIM_IDS.reveal,
    title: "Text Reveal — Masque",
    slug: "text-reveal-01",
    description:
      "Révélation de texte par masque vertical, ligne par ligne, traversée par un balayage lumineux. Un classique du motion design revisité en code, parfait pour des slogans en deux lignes.",
    categoryId: "typographie",
    componentKey: "text-reveal-01",
    config: {
      text: "CRÉER\nEN CODE",
      primaryColor: "#F5F5F7",
      accentColor: "#7C5CFF",
      backgroundColor: "#0A0A0D",
      duration: 3.6,
      speed: 1,
    },
    duration: 3.6,
  },
  {
    id: ANIM_IDS.elastic,
    title: "Elastic Text",
    slug: "elastic-text-01",
    description:
      "Le texte rebondit en place avec un easing élastique, lettre par lettre : énergie maximale pour des mots-clés courts, des badges ou des annonces.",
    categoryId: "typographie",
    componentKey: "elastic-text-01",
    config: {
      text: "BOUNCE",
      primaryColor: "#F5F5F7",
      accentColor: "#22D3EE",
      backgroundColor: "#0A0A0D",
      duration: 3,
      speed: 1,
    },
    duration: 3,
  },
  {
    id: ANIM_IDS.morph,
    title: "Shape Morph",
    slug: "shape-morph-01",
    description:
      "Une forme lumineuse se transforme sans interruption : carré, octogone, étoile à quatre branches. Un morphing pur code, fluide à 60 fps, pour des transitions géométriques élégantes.",
    categoryId: "formes",
    componentKey: "shape-morph-01",
    config: {
      text: "MORPH",
      primaryColor: "#F5F5F7",
      accentColor: "#22D3EE",
      backgroundColor: "#0A0A0D",
      duration: 6,
      speed: 1,
    },
    duration: 6,
  },
  {
    id: ANIM_IDS.cards,
    title: "Staggered Cards",
    slug: "staggered-cards-01",
    description:
      "Trois cartes vitrées s'empilent en cascade avec un rebond maîtrisé. La mise en scène idéale pour présenter des étapes, des fonctionnalités ou des maquettes d'interface.",
    categoryId: "interface",
    componentKey: "staggered-cards-01",
    config: {
      text: "UI MOTION",
      primaryColor: "#E7E7EF",
      accentColor: "#7C5CFF",
      backgroundColor: "#0A0A0D",
      duration: 4.2,
      speed: 1,
    },
    duration: 4.2,
  },
  {
    id: ANIM_IDS.logo,
    title: "Logo Reveal",
    slug: "logo-reveal-01",
    description:
      "Un logo abstrait se dessine par la lumière : le trait se trace, le cœur pop, un halo s'échappe et le mot-symbole s'éclaircit. Pensez intros de marque et identités animées.",
    categoryId: "logo",
    componentKey: "logo-reveal-01",
    config: {
      text: "STUDIO",
      primaryColor: "#F5F5F7",
      accentColor: "#22D3EE",
      backgroundColor: "#0A0A0D",
      duration: 4.4,
      speed: 1,
    },
    duration: 4.4,
  },
];

function promptsWithTemplate(): Map<string, TemplatePrompt[]> {
  const map = new Map<string, TemplatePrompt[]>();
  TEMPLATES.forEach((t, i) => {
    const pair = DEMO_PROMPTS[t.componentKey];
    map.set(t.id, [
      {
        id: `00000000-0000-4000-8000-0000000001a${i}`,
        animation_id: t.id,
        type: "web",
        content: pair.web,
        version: 1,
      },
      {
        id: `00000000-0000-4000-8000-0000000001b${i}`,
        animation_id: t.id,
        type: "after_effects",
        content: pair.after_effects,
        version: 1,
      },
    ]);
  });
  return map;
}

const PROMPTS_BY_ANIMATION = promptsWithTemplate();

export const demoStore = {
  categories: DEMO_CATEGORIES,
  templates: TEMPLATES,
  prompts: PROMPTS_BY_ANIMATION,
};