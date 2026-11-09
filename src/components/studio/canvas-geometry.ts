/**
 * Géométrie du canvas Studio. Un calque est un cadre de taille (scale·W × scale·H)
 * centré sur (x %, y %) de la scène et pivoté de θ autour de son centre. L'échelle
 * agit sur la MISE EN PAGE (pas sur un transform) : le texte est re-rendu à la
 * bonne taille, donc net. Les points « locaux » sont les coordonnées scène (px)
 * du calque non pivoté.
 */

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  /** true si la boîte est tout le cadre du calque (contenu non mesurable : iframe, etc.). */
  full: boolean;
}
export interface Xf {
  x: number; // % (centre du calque)
  y: number;
  scale: number;
  rotation?: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Centre du calque en px de scène. */
export function wrapperCenter(xf: Xf, W: number, H: number): Pt {
  return { x: (xf.x / 100) * W, y: (xf.y / 100) * H };
}

export function localToStage(p: Pt, xf: Xf, W: number, H: number): Pt {
  const c = wrapperCenter(xf, W, H);
  const a = rad(xf.rotation ?? 0);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export function stageToLocal(q: Pt, xf: Xf, W: number, H: number): Pt {
  const c = wrapperCenter(xf, W, H);
  const a = rad(xf.rotation ?? 0);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = q.x - c.x;
  const dy = q.y - c.y;
  return { x: c.x + dx * cos + dy * sin, y: c.y - dx * sin + dy * cos };
}

/**
 * Nouveau centre (x, y en %) du calque pour que le contenu, situé à `v` (px) du
 * centre du calque avant rotation, tombe sur le point de scène `target` après
 * rotation `rotation`.
 */
export function placeContentAt(v: Pt, target: Pt, rotation: number, W: number, H: number): { x: number; y: number } {
  const a = rad(rotation);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: ((target.x - (v.x * cos - v.y * sin)) / W) * 100,
    y: ((target.y - (v.x * sin + v.y * cos)) / H) * 100,
  };
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "DEFS", "LINEARGRADIENT", "RADIALGRADIENT", "STOP", "CLIPPATH", "FILTER"]);
const MEDIA_TAGS = new Set(["IMG", "SVG", "CANVAS", "VIDEO", "PATH", "CIRCLE", "RECT", "ELLIPSE", "POLYGON", "IMAGE"]);

/** Boîte englobante du contenu visible d'un calque, en px du cadre (calque non transformé). */
export function measureContentBox(layer: HTMLElement, stage: HTMLElement): Box {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const full: Box = { l: 0, t: 0, r: W, b: H, full: true };
  const saved = layer.style.transform;
  layer.style.transform = "none";
  try {
    const origin = stage.getBoundingClientRect();
    // Template en code (iframe) : le runtime rapporte la boîte de son contenu (fractions du cadre).
    const frame = layer.querySelector<HTMLIFrameElement>("iframe[data-content-box]");
    if (frame) {
      const parts = (frame.getAttribute("data-content-box") ?? "").split(",").map(Number);
      if (parts.length === 4 && parts.every((v) => Number.isFinite(v))) {
        const fr = frame.getBoundingClientRect();
        const pad = 6;
        return {
          l: fr.left - origin.left + parts[0] * fr.width - pad,
          t: fr.top - origin.top + parts[1] * fr.height - pad,
          r: fr.left - origin.left + parts[2] * fr.width + pad,
          b: fr.top - origin.top + parts[3] * fr.height + pad,
          full: false,
        };
      }
    }
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    const nodes = layer.querySelectorAll<HTMLElement>("*");
    const limit = Math.min(nodes.length, 700);
    for (let i = 0; i < limit; i++) {
      const el = nodes[i];
      if (SKIP_TAGS.has(el.tagName.toUpperCase())) continue;
      const tag = el.tagName.toUpperCase();
      let counts = MEDIA_TAGS.has(tag);
      if (!counts) {
        for (const n of Array.from(el.childNodes)) {
          if (n.nodeType === 3 && (n.textContent ?? "").trim() !== "") {
            counts = true;
            break;
          }
        }
      }
      if (!counts) {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        const hasBg = (bg && bg !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)) || cs.backgroundImage !== "none";
        if (hasBg) counts = true;
      }
      if (!counts) continue;
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w < 1 || h < 1) continue;
      if (w >= W * 0.94 && h >= H * 0.94) continue;
      l = Math.min(l, rect.left - origin.left);
      t = Math.min(t, rect.top - origin.top);
      r = Math.max(r, rect.right - origin.left);
      b = Math.max(b, rect.bottom - origin.top);
    }
    if (!isFinite(l) || !isFinite(t) || r - l < 4 || b - t < 4) return full;
    const pad = 6;
    return { l: Math.max(-W, l - pad), t: Math.max(-H, t - pad), r: Math.min(2 * W, r + pad), b: Math.min(2 * H, b + pad), full: false };
  } finally {
    layer.style.transform = saved;
  }
}

export function boxCenter(box: Box): Pt {
  return { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2 };
}
