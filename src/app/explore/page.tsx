import { redirect } from "next/navigation";

/** Ancienne galerie de prompts : les modèles sont désormais dans le Studio privé. */
export default function ExplorePage() {
  redirect("/studio");
}
