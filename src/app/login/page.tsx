"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleAlert, Lock } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
      const client = createSupabaseBrowserClient();
      if (!client) {
        setError("Supabase n’est pas configuré : renseignez les variables d’environnement d’abord.");
        setBusy(false);
        return;
      }
      const { error: authError } = await client.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setBusy(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Erreur inattendue pendant la connexion.");
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-svh items-center justify-center px-5 py-16 pt-32 sm:px-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface/70">
            <Lock className="h-5 w-5 text-accent" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Espace administration</h1>
          <p className="mt-2 text-sm text-muted">Réservé aux administrateurs MotionGraphic.si.</p>
        </div>

        {!configured ? (
          <div className="rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-5 text-sm leading-relaxed text-muted">
            Supabase n’est pas configuré. Le mode démo est actif pour le site public, mais
            l’authentification (et donc l’administration) requiert Supabase.
            <br />
            <br />
            Voir <code className="font-mono text-xs text-ink">.env.example</code> et le README pour
            connecter votre projet Supabase.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface/60 p-6"
          >
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-background px-3.5 text-sm text-ink transition-colors focus:border-accent/60 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-background px-3.5 text-sm text-ink transition-colors focus:border-accent/60 focus:outline-none"
              />
            </div>
            {error ? (
              <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="h-11 cursor-pointer rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent/85 disabled:opacity-60"
            >
              {busy ? "Connexion…" : "Se connecter"}
            </button>
            <Link href="/" className="text-center text-xs text-muted transition-colors hover:text-ink">
              ← Retour au site
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}