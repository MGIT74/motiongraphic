"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, Loader2, RefreshCw, ShieldAlert, X, XCircle } from "lucide-react";
import { friendlyError } from "@/lib/studio/errors";

/* ------------------------------------------------------------------ */
/* Panneau « Accès MCP » — jetons personnels (PR 38 : backend dormant)  */
/*                                                                      */
/* Contrat (Claude implémente côté serveur, en parallèle) :             */
/*   GET    /api/settings/mcp-tokens → { tokens: [...] }                */
/*   POST   /api/settings/mcp-tokens { name, expiresInDays, scopes }    */
/*            → { token: "<clair, UNE fois>", item: {...} }             */
/*   POST   /api/settings/mcp-tokens/{id}/rotate → idem création        */
/*   DELETE /api/settings/mcp-tokens?id={id} → { ok: true }             */
/*   GET    /api/admin/mcp-tokens → { tokens: [{…, owner…}] } (admin)   */
/*   DELETE /api/admin/mcp-tokens?id={id} → { ok: true } (admin)        */
/* Codes : 503 désactivée · 401 non connecté · 403 non admin ·          */
/*         423 compte suspendu → messages clairs (jamais bruts).        */
/* Le token en clair n'apparaît JAMAIS en localStorage ni URL ; il est   */
/* affiché une seule fois (création/renouvellement) et perdu à la       */
/* fermeture du panneau de révélation.                                  */
/* ------------------------------------------------------------------ */

type Scope = "read" | "write" | "export";

interface TokenItem {
  id: string;
  name: string;
  scopes: Scope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface AdminTokenItem extends TokenItem {
  ownerId: string;
  ownerEmail: string | null;
  ownerStatus: string | null;
}

type FetchState = "loading" | "ready" | "disabled" | "suspended" | "need-login" | "error";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

/**
 * Statut affiché : actif / expiré / révoqué — horodatage figé au chargement
 * (aucun appel à Date.now() pendant le rendu).
 */
function tokenStatus(item: TokenItem, nowMs: number): "active" | "expired" | "revoked" {
  if (item.revokedAt) return "revoked";
  if (item.expiresAt && new Date(item.expiresAt).getTime() <= nowMs) return "expired";
  return "active";
}

const STATUS_LABEL: Record<"active" | "expired" | "revoked", string> = {
  active: "Actif",
  expired: "Expiré",
  revoked: "Révoqué",
};

const SCOPE_LABEL: Record<Scope, string> = {
  read: "Lecture",
  write: "Écriture",
  export: "Export",
};

/** Messages dédiés par code HTTP (jamais de texte technique brut). */
function messageForStatus(status: number): string | null {
  if (status === 503) return "La gestion des jetons MCP n'est pas encore activée sur ce site. L'architecture est prête ; l'activation se fera après validation de la PR #38 sur main.";
  if (status === 401) return "Session expirée : reconnectez-vous (page Connexion), puis revenez sur cette page.";
  if (status === 403) return "Accès réservé aux administrateurs : cette action a été refusée par le serveur.";
  if (status === 423) return "Ce compte est suspendu : contactez un administrateur pour réactiver l'accès.";
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function toErrorMessage(status: number, payload: unknown): unknown {
  const errors = (payload as { errors?: string[] } | null)?.errors;
  if (Array.isArray(errors) && errors.length > 0) return errors.join(" ");
  return `Erreur ${status}`;
}

export default function McpTokensPanel({ isAdmin }: { isAdmin: boolean }) {
  const [state, setState] = useState<FetchState>("loading");
  const [serverOrigin, setServerOrigin] = useState("");
  useEffect(() => {
    // L'origine réelle de l'instance (le serveur MCP à mentionner dans
    // l'aide) : dérivée du navigateur — rien de codé en dur.
    const timer = setTimeout(() => setServerOrigin(window.location.origin), 0);
    return () => clearTimeout(timer);
  }, []);
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [error, setError] = useState<{ title: string; hint: string; detail?: string; retryable: boolean } | null>(null);
  const [adminTokens, setAdminTokens] = useState<AdminTokenItem[] | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDays, setFormDays] = useState(90);
  const [formScopes, setFormScopes] = useState<Scope[]>(["read"]);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; value: string; expiresAt: string | null } | null>(null);
  const [copied, setCopied] = useState<"ok" | "selected" | "failed" | null>(null);
  const revealCloseRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    await Promise.resolve(); // aucun setState synchrone dans l'effet
    setError(null);
    let response: Response;
    try {
      response = await fetch("/api/settings/mcp-tokens", { cache: "no-store" });
    } catch (caught) {
      setState("error");
      setError(friendlyError(caught, "generic"));
      setNowMs(Date.now());
      return;
    }
    setNowMs(Date.now());
    const payload = await readJson(response);
    const statusMessage = messageForStatus(response.status);
    if (response.status === 503) {
      setState("disabled");
      setError({ title: "Fonctionnalité pas encore activée", hint: statusMessage ?? "", retryable: true });
      return;
    }
    if (response.status === 423) {
      setState("suspended");
      setError({ title: "Compte suspendu", hint: statusMessage ?? "", retryable: false });
      return;
    }
    if (response.status === 401) {
      setState("need-login");
      setError({ title: "Connexion requise", hint: statusMessage ?? "", retryable: false });
      return;
    }
    if (!response.ok) {
      setState("error");
      setError(friendlyError(toErrorMessage(response.status, payload), "generic"));
      return;
    }
    const data = payload as { tokens?: TokenItem[] | null };
    if (!Array.isArray(data.tokens)) {
      setState("error");
      setError({ title: "Réponse inattendue du serveur", hint: "La liste des jetons n'a pas pu être lue.", detail: JSON.stringify(payload).slice(0, 120), retryable: true });
      return;
    }
    setTokens(data.tokens);
    setState("ready");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => {
      setCopied(null);
      revealCloseRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [revealed]);

  async function copyToken(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("ok");
      return;
    } catch {
      // API Clipboard indisponible (navigateur/contexte restreint) :
      // on sélectionne le jeton pour la copie manuelle (Ctrl/Cmd+C).
      const element = document.querySelector("[data-token-value]");
      const selection = window.getSelection();
      if (element && selection) {
        selection.selectAllChildren(element);
        setCopied("selected");
        return;
      }
      setCopied("failed");
    }
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/mcp-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: formName, expiresInDays: formDays, scopes: formScopes }),
      });
      const payload = await readJson(response);
      const statusMessage = messageForStatus(response.status);
      if (statusMessage) {
        if (response.status === 403 || response.status === 423) {
          setError({ title: response.status === 403 ? "Accès refusé" : "Compte suspendu", hint: statusMessage, retryable: false });
        } else if (response.status === 401) {
          setError({ title: "Connexion requise", hint: statusMessage, retryable: false });
        }
        return;
      }
      const data = payload as { token?: string; item?: TokenItem } | null;
      if (!response.ok) {
        setError(friendlyError(toErrorMessage(response.status, payload), "generic"));
        return;
      }
      if (typeof data?.token !== "string" || !data.item) {
        setError({ title: "Réponse inattendue du serveur", hint: "Le jeton n'a pas pu être révélé.", retryable: true });
        return;
      }
      setTokens((list) => [...list.filter((t) => t.id !== data.item!.id), data.item!]);
      setFormOpen(false);
      setFormName("");
      setFormScopes(["read"]);
      setRevealed({ name: data.item.name, value: data.token, expiresAt: data.item.expiresAt });
    } catch (caught) {
      setError(friendlyError(caught, "generic"));
    } finally {
      setBusy(false);
    }
  }

  async function rotate(item: TokenItem) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/mcp-tokens/${encodeURIComponent(item.id)}/rotate`, { method: "POST" });
      const payload = await readJson(response);
      const statusMessage = messageForStatus(response.status);
      if (statusMessage) {
        setError({ title: "Renouvellement impossible", hint: statusMessage, retryable: false });
        return;
      }
      const data = payload as { token?: string; item?: TokenItem } | null;
      if (!response.ok) {
        setError(friendlyError(toErrorMessage(response.status, payload), "generic"));
        return;
      }
      if (typeof data?.token !== "string" || !data.item) {
        setError({ title: "Réponse inattendue du serveur", hint: "Le nouveau jeton n'a pas été révélé.", retryable: true });
        return;
      }
      setTokens((list) => list.map((t) => (t.id === item.id ? data.item! : t)).filter((t) => !t.revokedAt || t.id === item.id));
      setRevealed({ name: data.item.name, value: data.token, expiresAt: data.item.expiresAt });
    } catch (caught) {
      setError(friendlyError(caught, "generic"));
    } finally {
      setBusy(false);
    }
  }

  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function revoke(item: TokenItem) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/mcp-tokens?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = await readJson(response);
      const statusMessage = messageForStatus(response.status);
      if (statusMessage) {
        setError({ title: "Révocation impossible", hint: statusMessage, retryable: false });
        return;
      }
      if (!response.ok) {
        setError(friendlyError(toErrorMessage(response.status, payload), "generic"));
        return;
      }
      setTokens((list) => list.map((t) => (t.id === item.id ? { ...t, revokedAt: new Date(nowMs).toISOString() } : t)));
      setConfirmId(null);
    } catch (caught) {
      setError(friendlyError(caught, "generic"));
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------- section admin ------------------------- */

  async function loadAdmin() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/mcp-tokens", { cache: "no-store" });
      const payload = await readJson(response);
      const statusMessage = messageForStatus(response.status);
      if (statusMessage) {
        setError({ title: "Liste d'administration indisponible", hint: statusMessage, retryable: false });
        setAdminTokens(null);
        return;
      }
      const data = payload as { tokens?: AdminTokenItem[] } | null;
      if (!response.ok || !Array.isArray(data?.tokens)) {
        setError(friendlyError(toErrorMessage(response.status, payload), "generic"));
        setAdminTokens(null);
        return;
      }
      setAdminTokens(data.tokens);
    } catch (caught) {
      setError({ ...friendlyError(caught, "generic"), retryable: true });
    } finally {
      setBusy(false);
    }
  }

  async function adminRevoke(item: AdminTokenItem) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/mcp-tokens?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = await readJson(response);
      if (!response.ok) {
        setError(friendlyError(toErrorMessage(response.status, payload), "generic"));
        return;
      }
      setAdminTokens((list) => (list ?? []).map((t) => (t.id === item.id ? { ...t, revokedAt: new Date(nowMs).toISOString() } : t)));
    } catch (caught) {
      setError(friendlyError(caught, "generic"));
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------- */

  return (
    <div className="mt-8 space-y-6" data-mcp-tokens-panel>
      {/* État : chargement */}
      {state === "loading" && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-sm text-muted" data-mcp-loading>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement de vos jetons…
        </div>
      )}

      {/* Bloc de révélation UNIQUE (création / renouvellement) */}
      {revealed && (
        <div
          role="alert"
          aria-live="assertive"
          data-token-reveal
          className="rounded-2xl border-2 border-accent/60 bg-accent/5 p-5"
        >
          <p className="text-sm font-semibold text-ink">
            Jeton « {revealed.name} » créé — visibilité unique
          </p>
          <p className="mt-1 text-xs text-muted">
            <strong className="text-ink">Copiez-le maintenant.</strong> Il ne sera plus jamais affiché
            (stocké uniquement sous forme hachée côté serveur). Il arrive à échéance{" "}
            {revealed.expiresAt ? DAY_FMT.format(new Date(revealed.expiresAt)) : "—"}.
          </p>
          <code
            data-token-value
            className="mt-3 block select-all break-all rounded-xl border border-line bg-canvas p-3 font-mono text-xs text-ink"
          >
            {revealed.value}
          </code>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void copyToken(revealed.value)}
              aria-label={copied === "ok" ? "Jeton copié" : "Copier le jeton"}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/85"
            >
              {copied === "ok" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied === "ok" ? "Copié" : copied === "selected" ? "Sélectionné" : "Copier"}
            </button>
            <button
              ref={revealCloseRef}
              type="button"
              onClick={() => setRevealed(null)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink hover:border-accent/50"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Fermer (le jeton ne sera plus visible)
            </button>
          </div>
        </div>
      )}

      {/* Erreurs / états bloquants */}
      {error && !revealed && (
        <div
          role="alert"
          data-mcp-error
          className="rounded-2xl border p-5"
          style={{ borderColor: state === "disabled" ? "var(--line)" : undefined }}
        >
          <div className={`flex items-start gap-3 ${state === "disabled" ? "text-info" : "text-danger-red"}`}>
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-ink">{error.title}</p>
              <p className="mt-1 text-xs text-muted">{error.hint}</p>
              {error.detail && <p className="mt-2 font-mono text-[10px] text-muted">{error.detail}</p>}
            </div>
          </div>
          {error.retryable && (
            <button type="button" onClick={() => void load()} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-ink">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
            </button>
          )}
          {state === "need-login" && (
            <Link href="/login" className="mt-3 block text-sm text-accent underline">Aller à la page Connexion</Link>
          )}
        </div>
      )}

      {/* Liste des jetons personnels */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Mes jetons MCP</h2>
          <button
            type="button"
            aria-expanded={formOpen}
            aria-controls="mcp-token-form"
            data-mcp-create-toggle
            onClick={() => setFormOpen((open) => !open)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/85"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Créer un jeton
          </button>
        </div>
        {state === "disabled" && (
          <p data-mcp-disabled-note className="mt-4 rounded-xl border border-line bg-canvas p-3 text-xs text-muted">
            Les jetons personnels sont désactivés tant que la fonctionnalité n&apos;est pas activée côté serveur.
          </p>
        )}
        {state === "ready" && tokens.length === 0 && (
          <p data-mcp-empty className="mt-4 rounded-xl border border-dashed border-line bg-canvas p-4 text-sm text-muted">
            Aucun jeton pour le moment. Créez-en un pour connecter Claude à VOS projets.
          </p>
        )}
        <ul className="mt-4 space-y-3" data-mcp-tokens-list>
          {tokens.map((item) => {
            const status = tokenStatus(item, nowMs);
            return (
              <li key={item.id} className="rounded-xl border border-line bg-canvas p-4" data-mcp-token-row>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{item.name}</span>
                  <span data-mcp-token-status className="rounded-full border px-2 py-0.5 text-xs text-muted">
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-ink/80">Permissions :</dt>
                    <dd className="flex flex-wrap gap-1" data-mcp-token-scopes>
                      {item.scopes.map((scope) => (
                        <span key={scope} className="rounded-md border border-line px-1.5 py-0.5 text-[10px]">{SCOPE_LABEL[scope]}</span>
                      ))}
                    </dd>
                  </div>
                  <div><dt className="inline text-ink/80">Créé :</dt>{" "}<dd className="inline">{fmt(item.createdAt)}</dd></div>
                  <div><dt className="inline text-ink/80">Expire :</dt>{" "}<dd className="inline">{fmt(item.expiresAt)}</dd></div>
                  <div><dt className="inline text-ink/80">Dernière utilisation :</dt>{" "}<dd className="inline">{fmt(item.lastUsedAt)}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || status !== "active"}
                    onClick={() => void rotate(item)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs text-ink disabled:opacity-40"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" /> Renouveler
                  </button>
                  {status === "active" && confirmId !== item.id ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmId(item.id)}
                      data-mcp-token-revoke
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs text-ink disabled:opacity-40"
                    >
                      <XCircle className="h-3 w-3" aria-hidden="true" /> Révoquer
                    </button>
                  ) : confirmId === item.id && status === "active" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        data-mcp-token-revoke-confirm
                        onClick={() => void revoke(item)}
                        className="inline-flex h-8 items-center rounded-full bg-red-600 px-3 text-xs font-semibold text-white"
                      >
                        Confirmer la révocation ?
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-xs text-ink">
                        Annuler
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Création */}
        {formOpen && (
          <form
            id="mcp-token-form"
            data-mcp-token-form
            onSubmit={submitCreate}
            className="mt-4 space-y-4 rounded-xl border border-line bg-canvas p-4"
          >
            <div>
              <label htmlFor="mcp-token-name" className="block text-xs font-medium text-ink">Nom du jeton</label>
              <input
                id="mcp-token-name"
                type="text"
                required
                minLength={1}
                maxLength={60}
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Claude — mon poste"
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label htmlFor="mcp-token-duration" className="block text-xs font-medium text-ink">Durée de validité</label>
              <select
                id="mcp-token-duration"
                value={formDays}
                onChange={(event) => setFormDays(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink sm:w-48"
              >
                <option value={30}>30 jours</option>
                <option value={90}>90 jours</option>
                <option value={365}>1 an</option>
              </select>
            </div>
            <fieldset>
              <legend className="block text-xs font-medium text-ink">Permissions</legend>
              <div className="mt-1.5 flex flex-wrap gap-4">
                {(["read", "write", "export"] as Scope[]).map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={formScopes.includes(scope)}
                      onChange={(event) => {
                        setFormScopes((scopes) => event.target.checked ? Array.from(new Set([...scopes, scope])) : scopes.filter((s) => s !== scope));
                      }}
                      name="mcp-scopes"
                      value={scope}
                    />
                    {SCOPE_LABEL[scope]}
                    <span className="text-xs text-muted">{scope === "read" ? "(lire les projets)" : scope === "write" ? "(créer/modifier)" : "(exporter MP4)"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={busy || formScopes.length === 0}
              data-mcp-token-submit
              className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "… En cours" : "Créer le jeton"}
            </button>
          </form>
        )}
      </section>

      {/* Aide : brancher un assistant IA (jamais de vrai token) */}
      <section className="rounded-2xl border border-line bg-surface p-5" data-mcp-help>
        <h2 className="text-lg font-semibold">Brancher Claude (ou un autre assistant) à vos projets</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Créez un jeton ci-dessus (permissions minimales : Lecture, puis Export si vous exportez).</li>
          <li>Copiez-le lorsqu&apos;il s&apos;affiche — il n&apos;est plus visible ensuite.</li>
          <li>
            Dans la configuration MCP de votre assistant, ajoutez{" "}
            <code className="font-mono text-xs text-ink">{serverOrigin}/api/mcp</code> comme URL de serveur.
          </li>
          <li>
            Ajoutez l&#39;en-tête d&#39;authentification :{" "}
            <code className="font-mono text-xs text-ink">Authorization: Bearer &lt;votre-jeton-personnel&gt;</code>.
          </li>
          <li>Votre assistant n&#39;accède qu&#39;à VOS projets (isolation appliquée par le serveur).</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          Aucun jeton n&#39;est stocké dans le navigateur ni dans l&#39;URL. Révoquez un jeton en un clic s&#39;il vous semble utilisé par un tiers.
        </p>
      </section>

      {/* Section admin (visible seulement si l'utilisateur est administrateur) */}
      {isAdmin && (
        <section className="rounded-2xl border border-line bg-surface p-5" data-mcp-admin-section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Administration — tous les jetons</h2>
            <button
              type="button"
              data-mcp-admin-load
              onClick={() => {
                const next = !adminOpen;
                setAdminOpen(next);
                if (next) void loadAdmin();
              }}
              aria-expanded={adminOpen}
              className="inline-flex h-9 items-center rounded-full border border-line bg-canvas px-4 text-sm text-ink"
            >
              {adminOpen ? "Masquer" : "Afficher tous les jetons"}
            </button>
          </div>
          {adminOpen && adminTokens === null && busy && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Chargement…</p>
          )}
          {adminOpen && adminTokens !== null && (
            <ul className="mt-4 space-y-3">
              {adminTokens.length === 0 && <li className="text-sm text-muted">Aucun jeton émis sur le site.</li>}
              {adminTokens.map((item) => (
                <li key={item.id} className="rounded-xl border border-line bg-canvas p-4" data-mcp-admin-token-row>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{item.name}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{STATUS_LABEL[tokenStatus(item, nowMs)]}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                      {item.ownerStatus === "suspended" ? "Propriétaire suspendu" : `Propriétaire : ${item.ownerEmail ?? item.ownerId.slice(0, 8) + "…"}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Créé {fmt(item.createdAt)} · Expire {fmt(item.expiresAt)} · Dernière utilisation {fmt(item.lastUsedAt)}</p>
                  {!item.revokedAt && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        data-mcp-admin-token-revoke
                        onClick={() => void adminRevoke(item)}
                        className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-xs text-ink"
                      >
                        Révoquer
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
