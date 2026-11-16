// MotionGraphic — « Letter Reveal — Gradient » (contrat timeline : déterministe)
// Les lettres montent une à une en sortant d'un flou, avec un dégradé accent → violet
// qui traverse tout le texte. Sortie : les lettres s'envolent en se floutant.
// Réglages Studio pris en compte : police, taille, interligne, espacements, alignement,
// couleurs (texte, accent = début du dégradé, fond).
window.__MGS_TIMELINE__ = {
  duration: 4.5,
  outAt: 3.7,
  renderAt: function (time, params) {
    var text = String(params.text || "Motion Design");
    var accent = params.accentColor || "#E22C6C";
    var ink = params.primaryColor || "#15121A";
    var bg = params.backgroundColor || "transparent";
    var fs = Number(params.fontSize) || 1, lh = Number(params.lineHeight) || 1;
    var ls = Number(params.letterSpacing) || 0, wsp = Number(params.wordSpacing) || 0;
    var al = params.align || "center";
    var ff = params.fontCss || "'Helvetica Neue',Inter,Arial,sans-serif";
    var out = this.outAt;

    var W = window.innerWidth, H = window.innerHeight;
    var stage = document.getElementById("lr-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "lr-stage";
      stage.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;";
      document.body.appendChild(stage);
    }
    stage.style.background = bg;

    // Reconstruit seulement si le texte, le format ou la police changent (le reste est appliqué à chaque rendu).
    var key = [text, Math.round((W / H) * 40), ff, document.fonts ? document.fonts.size : 0].join("|");
    var box = stage.firstChild;
    if (!box || box.getAttribute("data-key") !== key) {
      stage.innerHTML = "";
      box = document.createElement("div");
      box.setAttribute("data-key", key);
      box.style.cssText = "max-width:86%;font-weight:800;line-height:1.05;font-family:" + ff + ";";
      stage.appendChild(box);
      var words = text.split(/(\s+)/);
      for (var w = 0; w < words.length; w++) {
        var part = words[w];
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          if (part.indexOf("\n") >= 0) box.appendChild(document.createElement("br"));
          else box.appendChild(document.createTextNode(" "));
          continue;
        }
        var word = document.createElement("span");
        word.style.cssText = "display:inline-block;white-space:nowrap;";
        for (var c = 0; c < part.length; c++) {
          var ch = document.createElement("span");
          ch.className = "lr-c";
          ch.textContent = part.charAt(c);
          ch.style.cssText = "display:inline-block;will-change:transform,filter,opacity;-webkit-background-clip:text;background-clip:text;color:transparent;";
          word.appendChild(ch);
        }
        box.appendChild(word);
      }
      // Taille de base : ~60 % de la largeur (marge pour agrandir la police depuis le Studio).
      var lo = 10, hi = Math.min(W, H) * 0.3, mid;
      for (var it = 0; it < 14; it++) {
        mid = (lo + hi) / 2;
        box.style.fontSize = mid + "px";
        if (box.scrollWidth <= W * 0.6 && box.scrollHeight <= H * 0.55) lo = mid; else hi = mid;
      }
      box.setAttribute("data-ratio", String(lo / H));
    }

    // Réglages appliqués à chaque rendu (curseurs fluides, sans reconstruction).
    box.style.fontSize = (parseFloat(box.getAttribute("data-ratio")) * H * fs) + "px";
    box.style.lineHeight = String(1.05 * lh);
    box.style.letterSpacing = (-0.02 + ls) + "em";
    box.style.wordSpacing = wsp + "em";
    box.style.textAlign = al;

    function clamp(x) { return Math.max(0, Math.min(1, x)); }
    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
    function easeInCubic(x) { return x * x * x; }

    var chars = box.querySelectorAll(".lr-c");
    var n = chars.length;
    // Dégradé continu sur tout le bloc : chaque lettre affiche sa portion.
    var bw = box.offsetWidth || 1;
    var grad = "linear-gradient(90deg," + accent + " 0%,#8B5CF6 55%," + ink + " 140%)";
    var stagger = n > 1 ? Math.min(0.07, 1.1 / (n - 1)) : 0;
    var outStagger = n > 1 ? Math.min(0.03, 0.4 / (n - 1)) : 0;
    for (var i = 0; i < n; i++) {
      var el = chars[i];
      el.style.backgroundImage = grad;
      el.style.backgroundSize = bw + "px 100%";
      // offsetLeft est relatif à la scène (seul ancêtre positionné) : on le ramène au bloc de texte.
      el.style.backgroundPosition = (box.offsetLeft - el.offsetLeft) + "px 0";
      var pIn = easeOutCubic(clamp((time - 0.2 - i * stagger) / 0.7));
      var pOut = easeInCubic(clamp((time - out - i * outStagger) / 0.5));
      var y = (1 - pIn) * 0.55 - pOut * 0.45;
      var blur = (1 - pIn) * 0.18 + pOut * 0.15;
      el.style.transform = "translateY(" + y + "em)";
      el.style.filter = "blur(" + blur + "em)";
      el.style.opacity = String(pIn * (1 - pOut));
    }
  },
};
