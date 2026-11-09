/**
 * Géométrie du canvas Studio : boîte englobante du contenu d'un calque et
 * conversions entre coordonnées « cadre » (px, avant transformation) et
 * coordonnées « scène » (px, après translate + scale + rotate).
 *
 * Transformation CSS d'un calque : translate(T) scale(S) rotate(θ), origine au
 * centre du cadre C :  scène = C + T + S·R(θ)·(local − C).
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
  /** true si la boîte est le cadre entier (contenu non mesurable : iframe, etc.). */
  full: boolean;
}
export interface Xf {
  x: number; // % (50 = centré)
  y: number;
  scale: number;
  rotation?: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function localToStage(p: Pt, xf: Xf, W: number, H: number): Pt {
  const a = rad(xf.rotation ?? 0);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - W / 2;
  const dy = p.y - H / 2;
  return {
    x: W / 2 + ((xf.x - 50) / 100) * W + xf.scale * (dx * cos - dy * sin),
    y: H / 2 + ((xf.y - 50) / 100) * H + xf.scale * (dx * sin + dy * cos),
  };
}

export function stageToLocal(q: Pt, xf: Xf, W: number, H: number): Pt {
  const a = rad(xf.rotation ?? 0);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const ux = (q.x - W / 2 - ((xf.x - 50) / 100) * W) / xf.scale;
  const uy = (q.y - H / 2 - ((xf.y - 50) / 100) * H) / xf.scale;
  return {
    x: W / 2 + (ux * cos + uy * sin),
    y: H / 2 + (-ux * sin + uy * cos),
  };
}

/**
 * Nouveau (x, y) en % pour que le point local `b` tombe sur le point de scène
 * `target` avec l'échelle et la rotation données (manipulation « autour du contenu »).
 */
export function placeLocalPointAt(b: Pt, target: Pt, scale: number, rotation: number, W: number, H: number): { x: number; y: number } {
  const a = rad(rotation);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = b.x - W / 2;
  const dy = b.y - H / 2;
  const tx = target.x - W / 2 - scale * (dx * cos - dy * sin);
  const ty = target.y - H / 2 - scale * (dx * sin + dy * cos);
  return { x: 50 + (tx / W) * 100, y: 50 + (ty / H) * 100 };
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
