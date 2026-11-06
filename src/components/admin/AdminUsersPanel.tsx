"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* Panneau d'administration des utilisateurs                            */
/* Liste + invitations + rôles + suspension. Toutes les actions passent */
/* par /api/admin/users/* (contrôles serveur ; secret jamais envoyé).   */
/* ------------------------------------------------------------------ */

interface AdminUser {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  auth_banned: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  invited_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

function statusBadge(user: AdminUser): { label: string; cls: string } {
  if (user.auth_banned || user.status === "suspended") return { label: "Suspendu", cls: "bg-red-900/40 text-red-300 border-red-800" };
  if (user.status === "active") return { label: "Actif", cls: "bg-emerald-900/30 text-emerald-300 border-emerald-800" };
  return { label: user.status ?? "?", cls: "bg-zinc-900 text-zinc-400 border-zinc-700" };
}

export default function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  const load = useCallback(async () => {
    // Attendre un micro-tâche : aucun setState synchrone dans l'effet.
    await Promise.resolve();
    setError(null);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; users?: AdminUser[]; invitations?: Invitation[]; errors?: string[] };
    if (!response.ok || !payload.ok) {
      setError((payload.errors ?? [`Lecture impossible (${response.status}).`]).join(" "));
      setLoaded(true);
      return;
    }
    setUsers(payload.users ?? []);
    setInvitations(payload.invitations ?? []);
    setLoaded(true);
    // Horodatage figé à la lecture : le filtrage au rendu reste pur.
    setNowMs(Date.now());
  }, []);

  useEffect(() => {
    // Lecture différée au tick suivant : aucun rendu cascades au montage.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function post(url: string, body?: unknown, method = "POST"): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; resent?: boolean; errors?: string[] };
      if (!response.ok || !payload.ok) {
        setError((payload.errors ?? [`Échec (${response.status}).`]).join(" "));
        return false;
      }
      setNotice(payload.resent ? "Invitation déjà active : email ré-envoyé." : "Opération enregistrée.");
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    if (await post("/api/admin/users/invite", { email: email.trim(), role })) {
      setEmail("");
    }
  }

  const now = nowMs ?? 0;
  const pendingInvitations = invitations.filter((i) => !i.used_at && !i.revoked_at && new Date(i.expires_at).getTime() > now);
  const expiredOrRevoked = invitations.filter((i) => i.used_at || i.revoked_at || new Date(i.expires_at).getTime() <= now);

  return (
    <div className="mt-8 space-y-10">
      {/* ---------- Liste des utilisateurs ---------- */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Utilisateurs ({users.length})</h2>
          <button type="button" onClick={() => void load()} disabled={busy}
            className="text-xs text-muted hover:text-ink">Rafraîchir</button>
        </div>
        {error && <p className="mt-3 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">{error}</p>}
        {!loaded && <p className="mt-4 text-sm text-muted">Chargement…</p>}
        {loaded && users.length === 0 && !error && (
          <p className="mt-4 text-sm text-muted">Aucun utilisateur (vérifiez Supabase/Auth).</p>
        )}
        <div className="mt-4 space-y-3">
          {users.map((user) => {
            const badge = statusBadge(user);
            return (
              <div key={user.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.email ?? user.id}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Inscrit {fmtDate(user.created_at)} · Dernière connexion {fmtDate(user.last_sign_in_at)}
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span>
                <span className="rounded-full border border-blue-800 bg-blue-900/30 px-2.5 py-0.5 text-xs text-blue-300">
                  {user.role === "admin" ? "Admin" : "Utilisateur"}
                </span>
                <select
                  aria-label={`Rôle de ${user.email ?? user.id}`}
                  value={user.role === "admin" ? "admin" : "user"}
                  disabled={busy}
                  onChange={(event) => void post(`/api/admin/users/${user.id}`, { role: event.target.value }, "PATCH")}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink"
                >
                  <option value="user">Utilisateur</option>
                  <option value="admin">Admin</option>
                </select>
                {user.role !== "admin" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post(`/api/admin/users/${user.id}`, { status: user.auth_banned || user.status === "suspended" ? "active" : "suspended" }, "PATCH")}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${user.auth_banned || user.status === "suspended"
                      ? "border-emerald-700 text-emerald-300 hover:bg-emerald-900/30"
                      : "border-red-800 text-red-300 hover:bg-red-900/30"}`}
                  >
                    {user.auth_banned || user.status === "suspended" ? "Réactiver" : "Suspendre"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Invitation ---------- */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Inviter par email</h2>
        <form onSubmit={invite} className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="utilisateur@exemple.com"
            className="min-w-64 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
          />
          <select value={role} onChange={(event) => setRole(event.target.value)}
            disabled={busy}
            className="rounded-lg border border-line bg-canvas px-2 py-2 text-sm text-ink">
            <option value="user">Utilisateur</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={busy}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-canvas disabled:opacity-50">
            Envoyer l&apos;invitation
          </button>
        </form>
        {(notice || error) && (
          <p className={`mt-3 rounded-lg border p-3 text-sm ${error ? "border-red-800 bg-red-900/30 text-red-300" : "border-emerald-800 bg-emerald-900/30 text-emerald-300"}`}>
            {error ?? notice}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          L&apos;invitation expire au bout de 14 jours pour cet email. Les comptes existants ne sont jamais ré-invités.
        </p>

        <h3 className="mt-6 text-sm font-semibold">Invitations en attente ({pendingInvitations.length})</h3>
        <div className="mt-2 space-y-2">
          {pendingInvitations.length === 0 && <p className="text-xs text-muted">Aucune invitation en attente.</p>}
          {pendingInvitations.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas p-3 text-sm">
              <span className="flex-1 truncate">{inv.email}</span>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                {inv.role === "admin" ? "Admin" : "Utilisateur"}
              </span>
              <span className="text-xs text-muted">exp. {fmtDate(inv.expires_at)}</span>
              <button type="button" disabled={busy}
                onClick={() => void post(`/api/admin/users/invitations/${inv.id}/revoke`)}
                className="rounded-lg border border-red-800 px-2.5 py-1 text-xs text-red-300 hover:bg-red-900/30">
                Révoquer
              </button>
            </div>
          ))}
        </div>

        <h3 className="mt-6 text-sm font-semibold">Historique (terminées, expirées, révoquées)</h3>
        <div className="mt-2 space-y-2">
          {expiredOrRevoked.length === 0 && <p className="text-xs text-muted">Historique vide.</p>}
          {expiredOrRevoked.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas/60 p-3 text-xs text-muted">
              <span className="flex-1 truncate text-sm">{inv.email}</span>
              <span>
                {inv.used_at ? `acceptée ${fmtDate(inv.used_at)}` : inv.revoked_at ? `révoquée ${fmtDate(inv.revoked_at)}` : "expirée"}
              </span>
              <span>invitée {fmtDate(inv.invited_at)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
