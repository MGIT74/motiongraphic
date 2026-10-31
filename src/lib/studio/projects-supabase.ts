import type { StudioProject } from "./project-model";
import { serializeProject, validateProject } from "./project-model";

/**
 * Store des projets Studio côté navigateur :
 * - localStorage instantané (sauvegarde automatique, toujours actif) ;
 * - Supabase (table `studio_projects`, RLS user = auth.uid()) dès que la
 *   migration 0003 est appliquée et que l'utilisateur est connecté.
 *
 * La clé "service_role" n'est jamais utilisée ici (client) : uniquement des
 * lectures/écritures via la session utilisateur — les politiques RLS de la
 * base garantissent que chacun n'accède qu'à ses projets.
 */

export type CloudSaveState = "local" | "synced" | "error";

interface SupabaseLikeMinimal {
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> };
  from: (table: "studio_projects") => {
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => PromiseLike<{ error: { message: string } | null }>;
    select: (sel: string) => {
      eq: (col: string, value: string) => PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
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
}

/** Sauvegarde le projet dans Supabase (session requise, RLS). */
export async function saveProjectToCloud(project: StudioProject): Promise<CloudSyncResult> {
  const client = await getBrowserClient();
  if (!client) return { state: "local", message: "Supabase non configuré — sauvegarde locale uniquement." };

  const { data: { user } } = await client.auth.getUser();
  if (!user) return { state: "local", message: "Connectez-vous pour la sauvegarde cloud." };

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
    },
    { onConflict: "id" }
  );
  if (error) return { state: "error", message: error.message };
  return { state: "synced" };
}

/** Charge le dernier projet cloud de l'utilisateur connecté (RLS). */
export async function loadLatestCloudProject(): Promise<StudioProject | null> {
  const client = await getBrowserClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("studio_projects")
    .select("id, name, data, updated_at")
    .eq("user_id", user.id);
  if (error || !Array.isArray(data) || data.length === 0) return null;

  // Choix du plus récent selon updated_at.
  const rows = (data as { id: string; name: string; data: unknown; updated_at: string }[])
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return validateProject(rows[0]?.data ?? null);
}