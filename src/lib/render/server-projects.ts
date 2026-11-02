import "server-only";
import { validateProject, type StudioProject } from "@/lib/studio/project-model";
import { registerCustomStudioTemplates } from "@/lib/studio/template-registry";
import { listPublishedCustomTemplates } from "@/lib/templates/custom-store";
import { customElementKind } from "@/lib/templates/custom-model";
import type { AnimationConfig } from "@/types/animation";

/** Client Supabase service_role (serveur uniquement — jamais exposé au navigateur). */
export async function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface StudioCustomTemplateInput {
  id: string;
  slug: string;
  name: string;
  category: string;
  sourceKind: string;
  componentKey?: string;
  elementKind: string;
  defaultConfig: AnimationConfig;
}

/** Templates custom publiés (source « composant »), au format attendu par le registre Studio. */
export async function publishedStudioCustomTemplates(): Promise<StudioCustomTemplateInput[]> {
  try {
    const published = await listPublishedCustomTemplates();
    return published
      .filter((t) => t.sourceKind === "component" && t.componentKey)
      .map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        category: t.category,
        sourceKind: t.sourceKind,
        componentKey: t.componentKey,
        elementKind: customElementKind(t),
        defaultConfig: t.defaultConfig,
      }));
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
