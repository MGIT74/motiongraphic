/**
 * Logo officiel MotionGraphic.si : 7 barres arrondies (égaliseur).
 * Version épurée du fichier d'origine (public/brand/motiongraphic-logo-original.svg),
 * en `currentColor` pour s'adapter au fond.
 */
const BARS: [number, number][] = [
  // [x, y] dans une grille 876 × 488 ; largeur 84, bas commun à 488.
  [0, 0],
  [132, 102],
  [264, 201],
  [396, 295],
  [527, 201],
  [659, 102],
  [792, 2],
];

export default function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 876 488" className={className} fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {BARS.map(([x, y]) => (
        <rect key={x} x={x} y={y} width={84} height={488 - y} rx={42} />
      ))}
    </svg>
  );
}
