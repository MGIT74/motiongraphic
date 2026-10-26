import Link from "next/link";

// Année du copyright — mise à jour manuelle (les builds statiques ne
// peuvent pas appeler new Date() au prerender).
const YEAR = "2026";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-6 px-5 py-10 sm:px-8 md:flex-row">
        <div className="text-center md:text-left">
          <p className="text-sm font-bold text-ink">
            MotionGraphic<span className="text-accent">.si</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            Bibliothèque de templates de motion design, animés en direct dans votre navigateur.
          </p>
        </div>

        <nav className="flex items-center gap-6 text-xs text-muted" aria-label="Liens de bas de page">
          <Link href="/explore" className="transition-colors hover:text-ink">
            Explore
          </Link>
          <Link href="/studio" className="transition-colors hover:text-ink">
            Studio <span className="text-[10px] uppercase tracking-wider text-accent">Soon</span>
          </Link>
          <Link href="/login" className="transition-colors hover:text-ink">
            Espace administration
          </Link>
        </nav>

        <p className="text-xs text-muted md:text-right">
          © {YEAR} MotionGraphic.si
        </p>
      </div>
    </footer>
  );
}