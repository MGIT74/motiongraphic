/** Événement window émis par le panneau droit (« Aligner sur la page »), traité par le canvas qui connaît la géométrie. */
export const ALIGN_EVENT = "mg-align";
export type AlignEdge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export function requestAlign(id: string, edge: AlignEdge): void {
  window.dispatchEvent(new CustomEvent(ALIGN_EVENT, { detail: { id, edge } }));
}
