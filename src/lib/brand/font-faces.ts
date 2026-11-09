import { BRAND_FONTS } from "@/lib/brand/fonts";

/**
 * CSS @font-face (polices embarquées en data:) d'une police de marque, pour les
 * templates en code qui tournent dans un iframe sandboxé sans accès réseau.
 * Lit les règles déjà chargées par le Studio (@fontsource) : sous-ensemble latin uniquement.
 */
const cache = new Map<string, Promise<{ css: string; families: string[] }>>();

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function collectRules(sheet: CSSStyleSheet, out: CSSFontFaceRule[], depth = 0): void {
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return;
  }
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSFontFaceRule) out.push(rule);
    else if (rule instanceof CSSImportRule && rule.styleSheet && depth < 4) collectRules(rule.styleSheet, out, depth + 1);
  }
}

export function getFontFaces(fontId: string | undefined): Promise<{ css: string; families: string[] }> {
  const font = BRAND_FONTS.find((f) => f.id === fontId);
  if (!font || font.id === "system" || typeof document === "undefined") return Promise.resolve({ css: "", families: [] });
  const hit = cache.get(font.id);
  if (hit) return hit;
  const families = Array.from(font.css.matchAll(/'([^']+)'/g)).map((m) => m[1]);
  const promise = (async () => {
    const rules: CSSFontFaceRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) collectRules(sheet, rules);
    const mine = rules.filter((r) => {
      const fam = r.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
      if (!families.includes(fam)) return false;
      const range = r.style.getPropertyValue("unicode-range");
      return !range || /U\+0000-00FF/i.test(range);
    });
    const parts: string[] = [];
    for (const r of mine) {
      const src = r.style.getPropertyValue("src");
      const url = /url\(["']?([^"')]+\.woff2[^"')]*)["']?\)/.exec(src)?.[1];
      if (!url) continue;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = toBase64(await res.arrayBuffer());
        const fam = r.style.getPropertyValue("font-family");
        const weight = r.style.getPropertyValue("font-weight") || "400";
        const style = r.style.getPropertyValue("font-style") || "normal";
        parts.push(`@font-face{font-family:${fam};font-style:${style};font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");}`);
      } catch {
        /* police indisponible : le template garde sa police de secours */
      }
    }
    return { css: parts.join("\n"), families };
  })();
  cache.set(font.id, promise);
  return promise;
}
