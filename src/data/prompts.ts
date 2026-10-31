import { COMPONENT_REGISTRY } from "@/lib/animations/registry";
import type { ComponentKey } from "@/types/animation";

/**
 * Contenu des prompts de démonstration, un Web et un After Effects par
 * template. Ces textes sont aussi seedés dans la migration SQL `0001_init.sql`
 * (voir le dossier `supabase/`). En mode démo (sans Supabase), ce sont ces
 * textes qui alimentent les boutons de copie.
 */

const base = (key: ComponentKey) => {
  const meta = COMPONENT_REGISTRY[key];
  return {
    name: meta.name,
    technologies: meta.technologies,
  };
};

function webPrompt(
  key: ComponentKey,
  { visuel, easing, boucle }: { visuel: string; easing: string; boucle: string }
): string {
  const { name, technologies } = base(key);
  return [
    `Tu es un développeur créatif expert en motion design web et GSAP, inspiré du template "${name}" (\`${key}\`) de MotionGraphic.si.`,
    "",
    "OBJECTIF",
    "Produire une animation web autonome, dans un seul fichier HTML, reproduisant fidèlement le comportement décrit ci-dessous.",
    "",
    "SPECIFICATIONS VISUELLES",
    visuel,
    "",
    "ANIMATION & EASING",
    easing,
    `Boucle : ${boucle}`,
    "",
    "CONTRAINTES TECHNIQUES",
    "- Un seul fichier index.html autonome (HTML + CSS + JS).",
    "- GSAP via CDN : https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js",
    `- Techniques autorisées : ${technologies.join(", ")}.`,
    "- N'animer que transform / opacity pour garantir 60 fps.",
    "- État initial du DOM = état final de l'animation (utiliser gsap.from()).",
    "- Respecter prefers-reduced-motion : afficher l'état final sans animation.",
    "- Palette : fond #000000, texte #F5F5F7, accent #0A84FF (modifiable en haut du CSS via variables).",
    "",
    "PARAMÈTRE FACILE À PERSONNALISER",
    "- Rendez le texte et les couleurs configurables en haut du script (const CONFIG = {...}).",
    "",
    "CRITÈRES D'ACCEPTATION",
    "- Aucune console d'erreur, aucune dépendance inutile.",
    "- La boucle est parfaitement fluide et sans saut visuel.",
    "- Rendu responsive, centré, premium (dark, minimalist).",
  ].join("\n");
}

function jsxPrompt(
  key: ComponentKey,
  { compo, comportement }: { compo: string; comportement: string }
): string {
  const { name } = base(key);
  return [
    `Tu es un expert en scripts ExtendScript (JSX) pour Adobe After Effects, inspiré du template "${name}" (\`${key}\`) de MotionGraphic.si.`,
    "",
    "MISSION",
    "Écris un script JSX complet et autonome qui construit la composition décrite ci-dessous, prête à être exécutée via File > Scripts > Run Script File.",
    "",
    "COMPOSITION",
    compo,
    "",
    "COMPORTEMENT ANIMÉ",
    comportement,
    "",
    "STRUCTURE DU SCRIPT",
    "- Fonction main() appelée en fin de script, avec vérification que l'application est After Effects.",
    "- Idempotent : supprimer d'abord les éléments existants portant le même nom avant de recréer.",
    "- Sous-fonctions dédiées (création de compo, création des calques, pose des keyframes).",
    "- Nommages explicites avec le préfixe « MGSI_ » pour tous les éléments créés.",
    "",
    "ANIMATION",
    "- Utiliser les keyframes native After Effects (position, échelle, opacité, masques, tracés).",
    "- Easings équivalents aux courbes GSAP indiquées (interpolation ease-out, répartition des keyframes).",
    "- Aucun plugin tiers, compatible After Effects 2022+.",
    "- Commentaires en français, un par bloc logique.",
    "",
    "LIVRABLE",
    "- Un seul fichier .jsx complet, copiable-collable, prêt à l'exécution.",
    "- Aucun appel réseau, aucun fichier externe requis.",
  ].join("\n");
}

const PROMPTS = {
  "kinetic-type-01": {
    web: webPrompt("kinetic-type-01", {
      visuel:
        "- Fond #000000. Le mot « MOTION » centré, lettres majuscules très grasses.\n- Chaque lettre apparaît en glissant depuis le bas, masquée par un wrapper overflow:hidden, décalage de 70 ms entre les lettres.\n- Un point d'accent violet (#0A84FF) apparaît après la dernière lettre avec un pop (back.out(3)).",
      easing:
        "power3.out pour l'entrée des lettres (0.55 s chacune, stagger 0.07), légère montée en yPercent 118 -> 0.",
      boucle:
        "après 1 s de tenue, les lettres ressortent vers le haut (yPercent -40, power2.in, stagger inversé) et le point se rétracte ; pause 0.9 s puis redémarrage.",
    }),
    after_effects: jsxPrompt("kinetic-type-01", {
      compo:
        "- Compo « MGSI_KineticType », 1920×1080, 30 fps, durée 6 s, fond #000000.\n- Un calque texte « MOTION » en gras, centré, taille 220 px, blédi #F5F5F7.",
      comportement:
        "Le mot est divisé en sous-calques du texte (une lettre par index) ; chaque lettre entre de bas en haut avec un masque (alpha inverted) décalé de 2 frames, puis un point violet apparaît en pop, puis sortie inversée vers le haut pour boucler.",
    }),
  },
  "text-reveal-01": {
    web: webPrompt("text-reveal-01", {
      visuel:
        "- Fond #000000, deux lignes centrées « CRÉER » / « EN CODE ».\n- Révélation par masque vertical (overflow hidden par ligne), chaque ligne monte de bas en haut.\n- Balayage lumineux violet/cyan (mix-blend-mode: screen, blur) traversant le texte pendant la révélation.",
      easing:
        "power4.out sur la révélation des lignes (stagger 0.12), balayage en power2.inOut.",
      boucle:
        "après tenue, les lignes ressortent vers le haut derrière le masque, pause 0.9 s, redémarrage.",
    }),
    after_effects: jsxPrompt("text-reveal-01", {
      compo:
        "- Compo « MGSI_TextReveal », 1920×1080, 30 fps, 6 s, fond #000000.\n- Deux calques texte centrés, « CRÉER » / « EN CODE », gras, #F5F5F7.",
      comportement:
        "Chaque ligne est révélée avec un masque de course (setMask / track matte) montant de bas en haut, décalées entre elles ; un calque dégradé lumineux passe en mode Tramage léger (additive) devant le texte, puis sortie vers le haut pour boucler.",
    }),
  },
  "elastic-text-01": {
    web: webPrompt("elastic-text-01", {
      visuel:
        "- Fond #000000, mot « BOUNCE » centré, lettres toutes les 4 en accent (#64D2FF).\n- Les lettres apparaissent depuis le bas en grossissant puis rebondissent (effet élastique, transform-origin bas).",
      easing:
        "elastic.out(1, 0.42) par lettre, 0.9 s chacune, stagger 0.06.",
      boucle:
        "les lettres se rétractent vers le haut en power2.in (stagger inversé), pause 1 s, redémarrage.",
    }),
    after_effects: jsxPrompt("elastic-text-01", {
      compo:
        "- Compo « MGSI_ElasticText », 1920×1080, 30 fps, 6 s, fond #000000.\n- Calque texte « BOUNCE » gras, centré, #F5F5F7 avec lettres altérnées en #64D2FF (colorations par index).",
      comportement:
        "Lettres (texte en sous-calques) animées en échelle et position avec une courbe élastique (ease « Out Elastic », interpolation avec overshoot), décalées de 2 frames, puis rétracté vers le haut pour boucler.",
    }),
  },
  "shape-morph-01": {
    web: webPrompt("shape-morph-01", {
      visuel:
        "- Fond #000000, au centre une forme lumineuse en dégradé (#64D2FF vers transparent) avec un halo flou derrière.\n- La forme se morphe en continu : carré -> octogone -> étoile 4 branches -> carré (interpolation de clip-path polygon à 8 sommets).",
      easing:
        "sine.inOut sur chaque morph (durée = durée/3), rotation continue linéaire sur le cycle complet.",
      boucle:
        "répétition continue de la séquence de morphing, halo pulsant en yoyo.",
    }),
    after_effects: jsxPrompt("shape-morph-01", {
      compo:
        "- Compo « MGSI_ShapeMorph », 1080×1080, 30 fps, 8 s, fond #000000.\n- Un calque forme (polystar) lumineux + un calque halo Gaussien.",
      comportement:
        "Le calque forme passe successivement de polygone régulier à étoile en animant le type de polystar / les keyframes de tracé via des calques de forme ; halo pulsant, rotation lente continue pour boucler.",
    }),
  },
  "staggered-cards-01": {
    web: webPrompt("staggered-cards-01", {
      visuel:
        "- Fond #000000, 3 cartes vitrées (rgba blanc translucide, bordure douce, ombre portée) avec pastille colorée et lignes de contenu.\n- La carte du centre est mise en avant (pastille et trait d'accent violet #0A84FF).\n- Un label « UI MOTION » en majuscules espacées au-dessus.",
      easing:
        "back.out(1.7) sur l'entrée des cartes (montée 44 px, légère rotation -6° -> 0), stagger 0.16 ; barres internes en scaleX depuis la gauche.",
      boucle:
        "les cartes ressortent vers le haut en cascade inversée, pause 0.8 s, redémarrage.",
    }),
    after_effects: jsxPrompt("staggered-cards-01", {
      compo:
        "- Compo « MGSI_StaggeredCards », 1920×1080, 30 fps, 7 s, fond #000000.\n- Trois calque rectangles (arrondis 24 px) semi-transparents avec pastille et barres internes, plus calque texte de label.",
      comportement:
        "Les cartes entrent en cascade (montée + légère rotation, ease back) décalées de 5 frames, les barres internes s'étendent en X, puis sortie inversée vers le haut pour boucler.",
    }),
  },
  "logo-reveal-01": {
    web: webPrompt("logo-reveal-01", {
      visuel:
        "- Fond #000000, cercle SVG r=46 dont le trait cyan (#64D2FF) se dessine progressivement (stroke-dashoffset).\n- Un triangle/forme abstraite apparaît en pop au centre (back.out(2.4)), un cercle pulsé (halo) s'échappe du cœur, le mot-symbole « STUDIO » apparaît dessous.",
      easing:
        "power2.inOut sur le tracé (0.8 s), back.out sur le cœur, power2.out sur le pulse (0.7 s), power3.out sur le mot-symbole.",
      boucle:
        "après tenue, tout s'estompe légèrement (0.94 scale, power2.in), pause 0.9 s, redémarrage.",
    }),
    after_effects: jsxPrompt("logo-reveal-01", {
      compo:
        "- Compo « MGSI_LogoReveal », 1080×1080, 30 fps, 6 s, fond #000000.\n- Calque forme (ellipse tracé vide, sans fond) cyan, un triangle/étoile au centre, un calque texte « STUDIO ».",
      comportement:
        "Le cercle se dessine via des keyframes de tracé (Trim Paths), le cœur apparaît en scale avec pop, un halo (calque solide animé en scale/opacité, flou gaussien) s'échappe, puis le mot-symbole apparaît ; tenue, léger recadrage, boucle.",
    }),
  },
  "minimal-saas-ui-01": {
    web: webPrompt("minimal-saas-ui-01", {
      visuel: "- Interface SaaS minimaliste claire avec lecteur audio, graphique analytics, recherche et bouton d'action.\n- Cartes blanches arrondies, fond gris très clair, accent rose.",
      easing: "Entrées progressives des cartes, transition fluide de la courbe et micro-interactions sur les contrôles.",
      boucle: "Présenter successivement le lecteur, les analytics, la recherche et l'action, puis recommencer.",
    }),
    after_effects: jsxPrompt("minimal-saas-ui-01", {
      compo: "- Composition 1920×1080, 30 fps, interface SaaS épurée en quatre scènes.",
      comportement: "Animer l'apparition des cartes, le tracé du graphique, la recherche et le bouton avec des interpolations douces.",
    }),
  },
} as const satisfies Record<ComponentKey, { web: string; after_effects: string }>;

export const DEMO_PROMPTS = PROMPTS;
export { webPrompt, jsxPrompt };