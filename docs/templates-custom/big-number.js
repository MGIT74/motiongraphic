// MotionGraphic — « Big Number » (contrat timeline : déterministe)
// Texte : "+250% | leads qualifiés en 90 jours"  → préfixe/nombre/suffixe comptés,
// libellé après le « | ». Sans « | », le premier nombre du texte est compté.
window.__MGS_TIMELINE__ = {
  duration: 4,
  outAt: 3.3,
  renderAt: function (time, params) {
    var raw = String(params.text || "+250% | leads qualifiés");
    var ink = params.primaryColor || "#F5F5F7";
    var accent = params.accentColor || "#FF6B2C";
    var bg = params.backgroundColor || "transparent";
    var out = this.outAt;
    var fs = Number(params.fontSize) || 1, lh = Number(params.lineHeight) || 1;
    var ls = Number(params.letterSpacing) || 0, wsp = Number(params.wordSpacing) || 0;
    var al = params.align || "center";

    var sep = raw.indexOf("|");
    var head = sep >= 0 ? raw.slice(0, sep).trim() : raw.trim();
    var label = sep >= 0 ? raw.slice(sep + 1).trim() : "";
    var m = /^(\D*?)(\d[\d\s.,]*)(.*)$/.exec(head) || ["", "", "0", head];
    var prefix = m[1], numStr = m[2].replace(/\s+/g, ""), suffix = m[3];
    var decimals = /[.,](\d+)$/.test(numStr) ? RegExp.$1.length : 0;
    var target = parseFloat(numStr.replace(",", ".")) || 0;

    var W = window.innerWidth, H = window.innerHeight;
    var stage = document.getElementById("bn-stage");
    var key = [raw, ink, accent, W, H, fs, lh, ls, wsp, al].join("|");
    if (!stage || stage.getAttribute("data-key") !== key) {
      if (stage) stage.remove();
      stage = document.createElement("div");
      stage.id = "bn-stage";
      stage.setAttribute("data-key", key);
      stage.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:" + (al === "left" ? "flex-start" : al === "right" ? "flex-end" : al === "justify" ? "stretch" : "center") + ";justify-content:center;gap:" + (2.2 * lh) + "vmin;padding:0 " + (al === "left" || al === "right" ? "7vmin" : "0") + ";overflow:hidden;font-family:'Helvetica Neue',Inter,Arial,sans-serif;text-align:" + (al === "justify" ? "justify" : al) + ";word-spacing:" + wsp + "em;";
      var big = document.createElement("div");
      big.id = "bn-big";
      big.style.cssText = "font-weight:900;line-height:" + lh + ";letter-spacing:" + (-0.03 + ls) + "em;white-space:nowrap;font-variant-numeric:tabular-nums;color:" + accent + ";";
      var rule = document.createElement("div");
      rule.id = "bn-rule";
      rule.style.cssText = "height:0.9vmin;width:16vmin;border-radius:1vmin;background:" + accent + ";transform-origin:" + (al === "left" ? "left" : al === "right" ? "right" : "center") + " center;transform:scaleX(0);";
      var lab = document.createElement("div");
      lab.id = "bn-label";
      lab.style.cssText = "font-weight:600;line-height:" + (1.15 * lh) + ";letter-spacing:" + ls + "em;max-width:80%;color:" + ink + ";font-size:" + (Math.min(W * 0.055, H * 0.07) * fs) + "px;";
      lab.textContent = label;
      stage.appendChild(big); stage.appendChild(rule); stage.appendChild(lab);
      document.body.appendChild(stage);
      // Taille de base : 64% de la largeur (marge pour agrandir la police depuis le Studio).
      big.textContent = prefix + target.toFixed(decimals) + suffix;
      var lo = 20, hi = Math.min(W * 0.4, H * 0.5), mid;
      for (var it = 0; it < 14; it++) {
        mid = (lo + hi) / 2;
        big.style.fontSize = mid + "px";
        if (big.scrollWidth <= W * 0.64) lo = mid; else hi = mid;
      }
      big.style.fontSize = (lo * fs) + "px";
    }
    stage.style.background = bg;

    function clamp(x) { return Math.max(0, Math.min(1, x)); }
    function easeOutExpo(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); }
    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
    var count = easeOutExpo(clamp((time - 0.15) / 1.6));
    var ex = clamp((time - out) / 0.45);
    var big2 = stage.querySelector("#bn-big");
    var rule2 = stage.querySelector("#bn-rule");
    var lab2 = stage.querySelector("#bn-label");
    big2.textContent = prefix + (target * count).toFixed(decimals) + suffix;
    var pop = 1 + 0.06 * (1 - easeOut(clamp((time - 0.15) / 0.5)));
    big2.style.transform = "scale(" + pop + ") translateY(" + (-ex * 30) + "px)";
    big2.style.opacity = String(1 - ex);
    rule2.style.transform = "scaleX(" + easeOut(clamp((time - 1.2) / 0.5)) + ")";
    rule2.style.opacity = String(1 - ex);
    var lp = easeOut(clamp((time - 1.4) / 0.6));
    lab2.style.opacity = String(lp * (1 - ex));
    lab2.style.transform = "translateY(" + ((1 - lp) * 24 - ex * 20) + "px)";
  },
};
