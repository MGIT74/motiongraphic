import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 py-24 text-center sm:px-8">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Page introuvable</h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        Cette page n’existe pas. La galerie d’animations vous attend.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center rounded-full border border-line bg-surface px-6 text-sm font-medium text-ink transition-colors hover:border-accent/50"
      >
        Retour à l’accueil
      </Link>
    </div>
  );
}