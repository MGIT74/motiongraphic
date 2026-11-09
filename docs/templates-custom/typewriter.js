// MotionGraphic — « Typewriter » (contrat timeline : déterministe)
// Machine à écrire : le texte se tape lettre par lettre, curseur clignotant qui suit la frappe,
// mots-clés entre *étoiles* en couleur d'accent. Vitesse calée pour finir de taper vers 2,7 s,
// quelle que soit la longueur. Exemple : "Un beau site tout seul n'a jamais ramené *un client*."
window.__MGS_TIMELINE__ = {
  duration: 4,
  outAt: 3.4,
  renderAt: function (time, params) {
    var text = String(params.text || "Votre *message* ici");
    var ink = params.primaryColor || "#F5F5F7";
    var accent = params.accentColor || "#FF6B2C";
    var bg = params.backgroundColor || "transparent";
    var out = this.outAt;
    var fs = Number(params.fontSize) || 1, lh = Number(params.lineHeight) || 1;
    var ls = Number(params.letterSpacing) || 0, wsp = Number(params.wordSpacing) || 0;
    var al = params.align || "center";

    var stage = document.getElementById("tw-stage");
    if (!stage) {
      stage = document.createElement("div");
      stage.id = "tw-stage";
      stage.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;";
      document.body.appendChild(stage);
    }
    stage.style.background = bg;

    var W = window.innerWidth, H = window.innerHeight;
    // Reconstruit seulement si le texte ou le format (ratio) change : couleurs, interligne, espacements,
    // alignement et taille de police sont appliqués à chaque rendu, sans rebuild (curseur et sélection fluides).
    var key = [text, Math.round((W / H) * 40)].join("|");
    var box = stage.firstChild;
    var chars;
    if (!box || box.getAttribute("data-key") !== key) {
      stage.innerHTML = "";
      box = document.createElement("div");
      box.setAttribute("data-key", key);
      box.style.cssText = "max-width:84%;font-family:ui-monospace,'SF Mono',Menlo,Consolas,'Courier New',monospace;font-weight:700;line-height:1.28;";
      stage.appendChild(box);
      var parts = text.split(/(\*[^*]+\*[.,;:!?…»)]*)/).filter(function (s) { return s; });
      var wordEl = null;
      function flush() { wordEl = null; }
      parts.forEach(function (part) {
        var isAccent = part.charAt(0) === "*";
        var body = part;
        if (isAccent) {
          var close = part.lastIndexOf("*");
          body = part.slice(1, close) + part.slice(close + 1);
        }
        var accentLen = isAccent ? part.lastIndexOf("*") - 1 : 0;
        for (var i = 0; i < body.length; i++) {
          var ch = body.charAt(i);
          if (ch === " " || ch === "\n") {
            flush();
            var sp = document.createTextNode(" ");
            box.appendChild(sp);
            // espace : span invisible pour compter la frappe
            var spc = document.createElement("span");
            spc.className = "tw-c";
            spc.style.cssText = "display:none;";
            box.appendChild(spc);
            continue;
          }
          if (!wordEl) {
            wordEl = document.createElement("span");
            wordEl.style.cssText = "display:inline-block;white-space:nowrap;";
            box.appendChild(wordEl);
          }
          var c = document.createElement("span");
          c.className = "tw-c";
          c.textContent = ch;
          c.style.cssText = "visibility:hidden;";
          if (isAccent && i < accentLen) c.setAttribute("data-ac", "1");
          wordEl.appendChild(c);
        }
      });
      // Taille de base : tient dans ~50% de la hauteur (marge pour agrandir la police depuis le Studio).
      var all = box.querySelectorAll(".tw-c");
      for (var v = 0; v < all.length; v++) if (all[v].textContent) all[v].style.visibility = "hidden";
      var lo = 10, hi = Math.min(W, H) * 0.22, mid;
      for (var it = 0; it < 14; it++) {
        mid = (lo + hi) / 2;
        box.style.fontSize = mid + "px";
        if (box.scrollHeight <= H * 0.5 && box.scrollWidth <= box.clientWidth + 1) lo = mid; else hi = mid;
      }
      box.style.fontSize = lo + "px";
      box.setAttribute("data-ratio", String(lo / H));
    }
    // La taille de police se règle à chaque rendu (sans reconstruire le DOM : curseur fluide).
    box.style.fontSize = (parseFloat(box.getAttribute("data-ratio")) * H * fs) + "px";
    box.style.lineHeight = String(1.28 * lh);
    box.style.letterSpacing = ls + "em";
    box.style.wordSpacing = wsp + "em";
    box.style.textAlign = al;
    box.style.color = ink;

    chars = box.querySelectorAll(".tw-c");
    var visibleChars = [];
    for (var a = 0; a < chars.length; a++) if (chars[a].textContent) visibleChars.push(chars[a]);
    var n = visibleChars.length;
    var typeStart = 0.35, typeEnd = 2.7;
    var rate = Math.max(8, n / (typeEnd - typeStart));
    var shown = Math.max(0, Math.min(n, Math.floor((time - typeStart) * rate)));
    var done = shown >= n;
    var ex = Math.max(0, Math.min(1, (time - out) / 0.45));
    var blinkOn = done ? (Math.floor(time * 2.2) % 2 === 0) : true;
    var caretAlpha = ex > 0 ? 0 : (blinkOn ? 1 : 0);

    for (var k = 0; k < n; k++) {
      var el = visibleChars[k];
      el.style.visibility = k < shown ? "visible" : "hidden";
      el.style.opacity = String(1 - ex);
      el.style.boxShadow = "none";
      el.style.marginRight = "0";
      el.style.color = el.getAttribute("data-ac") ? accent : "";
    }
    var caretColor = accent;
    var rgba = caretAlpha;
    if (n > 0) {
      if (shown === 0) {
        visibleChars[0].style.visibility = "visible";
        visibleChars[0].style.opacity = "0";
        visibleChars[0].style.boxShadow = "inset 0.09em 0 0 " + caretColor;
        visibleChars[0].style.opacity = String(rgba);
        visibleChars[0].style.color = "transparent";
      } else {
        var last = visibleChars[shown - 1];
        last.style.boxShadow = rgba > 0 ? "0.1em 0 0 " + caretColor : "none";
      }
    }
  },
};
