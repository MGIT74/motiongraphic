import { Database } from "lucide-react";

/**
 * Bandeau de transparence affiché quand le mode démonstration est actif
 * (Supabase non configuré). Il ne s’affichera plus jamais une fois les
 * variables d’environnement renseignées.
 */
export default function DemoBanner() {
  return (
    <div className="mt-2 flex items-start gap-3 rounded-2xl border border-dashed border-accent/30 bg-accent/5 px-5 py-4">
      <Database className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-muted sm:text-sm">
        <strong className="font-semibold text-ink">Mode démonstration</strong> — Supabase n’est pas
        encore configuré : cette galerie utilise des données locales de démonstration. Renseignez{" "}
        <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-ink">
          NEXT_PUBLIC_SUPABASE_URL
        </code>{" "}
        et{" "}
        <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-ink">
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </code>{" "}
        dans <code className="font-mono text-[11px] text-ink">.env.local</code> pour connecter la base réelle.
        Voir le README.
      </p>
    </div>
  );
}