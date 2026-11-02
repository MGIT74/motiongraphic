import type { StudioProject } from "./project-model";
import { serializeProject, validateProject } from "./project-model";

/**
 * Store des projets Studio côté navigateur :
 * - localStorage instantané (sauvegarde automatique, toujours actif) ;
 * - Supabase (table `studio_projects`, RLS user = auth.uid()) dès que
 *   l'utilisateur est connecté.
 *
 * Concurrence (Studio ↔ MCP ↔ autre onglet) : chaque écriture vérifie que la
 * version distante (`updated_at`) est celle que le Studio connaît ; sinon elle
 * n'écrase rien et signale un conflit. Le Studio interroge aussi la version
 * distante pour recharger automatiquement les modifications faites ailleurs.
 *
 * La clé "service_role" n'est jamais utilisée ici (client) : uniquement la
 * session utilisateur — les politiques RLS garantissent l'isolation.
 */

export type CloudSaveState = "local" | "synced" | "error" | "conflict";

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface FilterBuilder extends PromiseLike<QueryResult> {
  eq: (col: string, value: string) => FilterBuilder;
}

interface SupabaseLikeMinimal {
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> };
  from: (table: "studio_projects") => {
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => PromiseLike<{ error: { message: string } | null }>;
    select: (sel: string) => FilterBuilder;
  };
}

async function getBrowserClient(): Promise<SupabaseLikeMinimal | null> {
  if (typeof window === "undefined") return null;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    return (createSupabaseBrowserClient() as unknown) as SupabaseLikeMinimal | null;
  } catch {
    return null;
  }
}

export interface CloudSyncResult {
  state: CloudSaveState;
  message?: string;
  /** Version distante après l'écriture (à mémoriser par le Studio). */
  updatedAt?: string;
}

function newer(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b) + 1; // tolérance 1 ms (arrondis Postgres)
}

/**
 * Sauvegarde le projet dans Supabase (session requise, RLS), sans écraser une
 * version distante plus récente que `knownUpdatedAt`.
 */
export async function saveProjectToCloud(project: StudioProject, knownUpdatedAt?: string | null): Promise<CloudSyncResult> {
  const client = await getBrowserClient();
  if (!client) return { state: "local", message: "Supabase non configuré — sauvegarde locale uniquement." };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { state: "local", message: "Connectez-vous pour la sauvegarde cloud." };

  const remote = await fetchCloudVersion(project.id);
  if (remote && knownUpdatedAt !== undefined && newer(remote, knownUpdatedAt)) {
    return { state: "conflict", message: "Le projet a été modifié ailleurs.", updatedAt: remote };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await client.from("studio_projects").upsert(
    {
      id: project.id,
      user_id: user.id,
      name: project.name,
      schema_version: project.schemaVersion,
      fps: project.fps,
      width: project.width,
      height: project.height,
      data: JSON.parse(serializeProject(project)),
      updated_at: updatedAt,
    },
    { onConflict: "id" }
  );
  if (error) return { state: "error", message: error.message };
  return { state: "synced", updatedAt: (await fetchCloudVersion(project.id)) ?? updatedAt };
}

/** Version distante (`updated_at`) d'un projet, ou null s'il n'existe pas dans le cloud. */
export async function fetchCloudVersion(projectId: string): Promise<string | null> {
  const client = await getBrowserClient();
  if (!client) return null;
  const { data, error } = await client.from("studio_projects").select("updated_at").eq("id", projectId);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return (data as { updated_at: string }[])[0]?.updated_at ?? null;
}

export interface CloudProject {
  project: StudioProject;
  updatedAt: string;
}

/** Charge le dernier projet cloud de l'utilisateur connecté (RLS). */
export async function loadLatestCloudProject(): Promise<CloudProject | null> {
  const client = await getBrowserClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("studio_projects")
    .select("id, name, data, updated_at")
    .eq("user_id", user.id);
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const rows = (data as { id: string; name: string; data: unknown; updated_at: string }[])
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const project = validateProject(rows[0]?.data ?? null);
  return project ? { project, updatedAt: rows[0].updated_at } : null;
}

/** Charge un projet cloud précis de l'utilisateur connecté (RLS) — ex. ?project=<id>. */
export async function loadCloudProject(projectId: string): Promise<CloudProject | null> {
  const client = await getBrowserClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("studio_projects")
    .select("id, name, data, updated_at")
    .eq("id", projectId);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = (data as { data: unknown; updated_at: string }[])[0];
  const project = validateProject(row?.data ?? null);
  return project ? { project, updatedAt: row.updated_at } : null;
}
