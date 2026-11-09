// MotionGraphic — « Headline Pro » (contrat timeline : déterministe)
// Texte : mots révélés un à un (masque), mots-clés entre *étoiles* en couleur d'accent
// avec soulignement qui se trace. Taille de police ajustée automatiquement au cadre
// (16:9, 9:16, 1:1). Exemple : "Un site n'est plus une *vitrine*, c'est un *commercial*."
window.__MGS_TIMELINE__ = {
  duration: 4,
  outAt: 3.3,
  renderAt: function (time, params) {
    var text = String(params.text || "Votre *message* ici");
    var ink = params.primaryColor || "#F5F5F7";
    var accent = params.accentColor || "#FF6B2C";
    var bg = params.backgroundColor || "transparent";
    var out = this.outAt;
    var fs = Number(params.fontSize) || 1, lh = Number(params.lineHeight) || 1;
    var ls = Number(params.letterSpacing) || 0, wsp = Number(params.wordSpacing) || 0;
    var al = params.align || "center";

    var stage = document.getElementById("hp-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "hp-stage";
      stage.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;";
      document.body.appendChild(stage);
    }
    stage.style.background = bg;

    var W = window.innerWidth, H = window.innerHeight;
    var key = [text, ink, accent, W, H, lh, ls, wsp, al].join("|");
    var box = stage.firstChild;
    if (!box || box.getAttribute("data-key") !== key) {
      stage.innerHTML = "";
      box = document.createElement("div");
      box.setAttribute("data-key", key);
      box.style.cssText = "width:84%;text-align:" + al + ";font-family:'Helvetica Neue',Inter,Arial,sans-serif;font-weight:800;line-height:" + (1.08 * lh) + ";letter-spacing:" + (-0.01 + ls) + "em;word-spacing:" + wsp + "em;color:" + ink + ";";
      stage.appendChild(box);
      var parts = text.split(/(\*[^*]+\*[.,;:!?…»)]*|\s+)/).filter(function (s) { return s && !/^\s+$/.test(s); });
      parts.forEach(function (raw, i) {
        var isAccent = raw.charAt(0) === "*";
        var close = isAccent ? raw.lastIndexOf("*") : -1;
        var label = isAccent ? raw.slice(1, close) : raw;
        var trail = isAccent ? raw.slice(close + 1) : "";
        var word = document.createElement("span");
        word.className = "hp-word";
        word.style.cssText = "display:inline-block;position:relative;margin:0 0.14em;";
        var mask = document.createElement("span");
        mask.style.cssText = "display:inline-block;overflow:hidden;vertical-align:bottom;padding:0.06em 0 0.14em;";
        var inner = document.createElement("span");
        inner.className = "hp-inner";
        inner.style.cssText = "display:inline-block;will-change:transform;" + (isAccent ? "color:" + accent + ";" : "");
        inner.textContent = label;
        if (trail) {
          var tr = document.createElement("span");
          tr.textContent = trail;
          tr.style.color = ink;
          inner.appendChild(tr);
        }
        mask.appendChild(inner);
        word.appendChild(mask);
        if (isAccent) {
          var bar = document.createElement("span");
          bar.className = "hp-bar";
          bar.style.cssText = "position:absolute;left:0;right:" + (trail.length * 0.3) + "em;bottom:0.02em;height:0.07em;border-radius:0.04em;background:" + accent + ";transform-origin:left center;transform:scaleX(0);";
          word.appendChild(bar);
        }
        word.setAttribute("data-i", String(i));
        box.appendChild(word);
      });
      // Taille de base : tient dans ~60% du cadre (marge pour agrandir la police depuis le Studio).
      var lo = 10, hi = Math.min(W, H) * 0.3, mid = lo;
      for (var it = 0; it < 14; it++) {
        mid = (lo + hi) / 2;
        box.style.fontSize = mid + "px";
        var widest = 0;
        var ws = box.querySelectorAll(".hp-word");
        for (var k = 0; k < ws.length; k++) widest = Math.max(widest, ws[k].offsetWidth);
        if (box.scrollHeight <= H * 0.5 && widest <= box.clientWidth * 0.72) lo = mid; else hi = mid;
      }
      box.style.fontSize = lo + "px";
      box.setAttribute("data-base", String(lo));
    }
    // La taille de police se règle à chaque rendu (sans reconstruire le DOM : curseur fluide).
    box.style.fontSize = (parseFloat(box.getAttribute("data-base")) * fs) + "px";

    function clamp(x) { return Math.max(0, Math.min(1, x)); }
    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
    function easeIn(x) { return x * x * x; }
    var words = box.querySelectorAll(".hp-word");
    var n = words.length;
    for (var i = 0; i < n; i++) {
      var w = words[i];
      var inner = w.querySelector(".hp-inner");
      var bar = w.querySelector(".hp-bar");
      var start = 0.08 + i * 0.09;
      var p = easeOut(clamp((time - start) / 0.55));
      var ex = easeIn(clamp((time - (out + (n - 1 - i) * 0.04)) / 0.4));
      var y = (1 - p) * 115 - ex * 60;
      inner.style.transform = "translateY(" + y + "%)";
      inner.style.opacity = String(Math.max(0, 1 - ex));
      if (bar) {
        var bp = easeOut(clamp((time - start - 0.35) / 0.45));
        bar.style.transform = "scaleX(" + bp + ")";
        bar.style.opacity = String(Math.max(0, 1 - ex));
      }
    }
  },
};
