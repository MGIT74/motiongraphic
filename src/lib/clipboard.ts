/**
 * Copie de texte dans le presse-papiers.
 * 1. Clipboard API (`navigator.clipboard`) — navigateurs modernes, HTTPS/localhost.
 * 2. Fallback `execCommand("copy")` via un textarea temporaire.
 * 3. Propage l'erreur au composant pour affichage (échec de copie).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback ci-dessous (permissions refusées, contexte non sécurisé...).
  }

  try {
    if (typeof document === "undefined") return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}