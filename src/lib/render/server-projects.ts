import "server-only";
import { validateProject, type StudioProject } from "@/lib/studio/project-model";
import { registerCustomStudioTemplates } from "@/lib/studio/template-registry";
import { listStudioCustomTemplates, type StudioCustomTemplateInput } from "@/lib/templates/published-studio";
export type { StudioCustomTemplateInput };

/** Client Supabase service_role (serveur uniquement — jamais exposé au navigateur). */
export async function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Templates custom publiés (composants + codes) au format registre Studio. */
export async function publishedStudioCustomTemplates(): Promise<StudioCustomTemplateInput[]> {
  try {
    return await listStudioCustomTemplates();
  } catch {
    return [];
  }
}

export interface StoredProject {
  project: StudioProject;
  userId: string;
  updatedAt: string;
}

/** Charge un projet (service_role) et le valide, templates custom compris. */
export async function loadStoredProject(projectId: string): Promise<StoredProject | null> {
  registerCustomStudioTemplates(await publishedStudioCustomTemplates());
  const client = await adminSupabase();
  const { data, error } = await client
    .from("studio_projects")
    .select("id, user_id, data, updated_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  const project = validateProject((data as { data: unknown }).data);
  if (!project) return null;
  return { project, userId: (data as { user_id: string }).user_id, updatedAt: (data as { updated_at: string }).updated_at };
}
