# Templates en code (Template Lab)

Sources des templates collés dans le Template Lab (admin). Contrat : `window.__MGS_TIMELINE__ = { duration, outAt, renderAt(time, params) }`, déterministe (pas de timer/random/CSS animation).

`params` = la config de l'élément : `text`, `primaryColor`, `accentColor`, `backgroundColor`, et les réglages du Studio `align` (left|center|right|justify), `fontSize`, `lineHeight` (multiplicateurs), `letterSpacing`, `wordSpacing` (em).

- `headline-pro.js` : titre mot à mot, `*mot*` = accent + soulignement.
- `big-number.js` : `+250% | libellé`, compteur animé.
- `typewriter.js` : machine à écrire, `*mot*` en accent.

Pour mettre à jour un template publié : coller le nouveau code dans le Template Lab puis republier.
