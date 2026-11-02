import type { StudioProject } from "@/lib/studio/project-model";

/**
 * Taille CSS de la scène de rendu : côté long = 1000 px, soit la même mise en
 * page que le canvas du Studio ; le facteur d'échelle donne la résolution finale
 * (1920×1080, 1080×1920 ou 1080×1080).
 */
export function renderStageSize(project: Pick<StudioProject, "width" | "height">) {
  const long = 1000;
  const ratio = project.width / project.height;
  const width = ratio >= 1 ? long : long * ratio;
  const height = ratio >= 1 ? long / ratio : long;
  return { width, height, deviceScaleFactor: project.width / width };
}
