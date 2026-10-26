"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MotionGraphic.si]", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 py-24 text-center sm:px-8">
      <CircleAlert className="h-8 w-8 text-accent" aria-hidden="true" />
      <h2 className="mt-4 text-2xl font-bold tracking-tight">Something went wrong</h2>
      <p className="mt-3 max-w-md text-sm text-muted">
        Une erreur est survenue lors du chargement. Si Supabase vient d’être configuré, vérifiez
        l’URL, la clé anon et les tables (voir README).
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-11 cursor-pointer items-center rounded-full bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent/85"
      >
        Réessayer
      </button>
    </div>
  );
}