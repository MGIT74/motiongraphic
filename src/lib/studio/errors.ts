/**
 * Messages d'erreur compréhensibles : transforme une erreur technique (réseau,
 * Supabase, ffmpeg, Chromium…) en un titre clair + ce qu'il faut faire. Le
 * texte d'origine reste disponible dans « Détails ».
 */
export type ErrorContext = "export" | "upload" | "save" | "project" | "media" | "generic";

export interface FriendlyError {
  title: string;
  hint: string;
  detail?: string;
  /** L'action peut être relancée telle quelle. */
  retryable: boolean;
}

const RULES: { test: RegExp; title: string; hint: string; retryable?: boolean; contexts?: ErrorContext[] }[] = [
  {
    test: /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|econnreset|socket hang up/i,
    title: "Connexion perdue",
    hint: "Vérifiez votre connexion internet, puis réessayez. Vos modifications restent enregistrées sur ce navigateur.",
    retryable: true,
  },
  {
    test: /connexion requise|connectez-vous|not authenticated|jwt|session|\b401\b/i,
    title: "Session expirée",
    hint: "Reconnectez-vous (page Connexion), puis relancez l'action.",
  },
  {
    test: /réservé aux administrateurs|forbidden|\b403\b|autre utilisateur|permission|row-level security|\brls\b/i,
    title: "Accès refusé",
    hint: "Ce compte n'a pas les droits nécessaires pour cette action. Connectez-vous avec un compte administrateur.",
  },
  {
    test: /trop lourd|too large|payload|maximum allowed size|exceeded the maximum|file_size_limit|\b413\b/i,
    title: "Fichier trop lourd",
    hint: "Maximum 200 Mo (souvent 50 Mo sur un stockage auto-hébergé). Compressez la vidéo ou raccourcissez-la (2 min max), puis réessayez.",
  },
  {
    test: /non pris en charge|format|mime|type de fichier|unsupported|invalid data found|could not find codec|moov atom|aucune piste/i,
    title: "Format non pris en charge",
    hint: "Utilisez une image PNG, JPEG, WebP, GIF ou SVG, une vidéo MP4, MOV ou WebM, ou un son MP3, M4A, WAV ou OGG.",
  },
  {
    test: /réseaux? privés?|adresse refusée|localhost|private network|identifiants refusée|url invalide|http\(s\)/i,
    title: "Adresse non autorisée",
    hint: "Seules les pages et fichiers publics sur internet peuvent être importés ou capturés.",
  },
  {
    test: /timeout|timed out|délai|exceeded \d+ms/i,
    title: "C'est trop long",
    hint: "Le serveur n'a pas répondu à temps. Réessayez dans un instant ; pour un export, une vidéo plus courte va plus vite.",
    retryable: true,
  },
  {
    test: /browser has been closed|target closed|chromium|libnss|playwright|ffmpeg|spawn/i,
    title: "Le moteur de rendu a échoué",
    hint: "Un incident côté serveur a interrompu le rendu. Réessayez ; si cela se répète, signalez-le avec les détails ci-dessous.",
    retryable: true,
  },
  {
    test: /supabase non configuré|not configured/i,
    title: "Sauvegarde cloud indisponible",
    hint: "Le stockage en ligne n'est pas configuré sur ce serveur : le projet reste enregistré sur ce navigateur.",
  },
  {
    test: /introuvable|not found|\b404\b|expiré/i,
    title: "Élément introuvable",
    hint: "Il a peut-être été supprimé ou le lien a expiré. Rechargez la page et réessayez.",
    retryable: true,
  },
  {
    test: /conflit|modifié ailleurs|conflict/i,
    title: "Projet modifié ailleurs",
    hint: "Le projet a changé dans un autre onglet ou via Claude. Choisissez « Recharger » ou « Garder la mienne » en haut.",
  },
  {
    test: /storage|stockage|bucket|dépôt|url d.envoi/i,
    title: "Stockage des fichiers indisponible",
    hint: "Le serveur de fichiers n'a pas accepté l'envoi. Réessayez ; si cela continue, vérifiez l'espace et la taille maximale du stockage Supabase.",
    retryable: true,
  },
  {
    test: /\b5\d\d\b|internal server error|bad gateway|service unavailable/i,
    title: "Le serveur ne répond pas correctement",
    hint: "Réessayez dans un instant. Si le problème continue, le site est peut-être en cours de mise à jour.",
    retryable: true,
  },
];

const CONTEXT_TITLES: Record<ErrorContext, string> = {
  export: "L'export MP4 n'a pas pu aboutir",
  upload: "L'import du fichier a échoué",
  save: "La sauvegarde cloud a échoué",
  project: "Action impossible sur le projet",
  media: "Le média ne peut pas être affiché",
  generic: "Une erreur est survenue",
};

export function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function friendlyError(error: unknown, context: ErrorContext = "generic"): FriendlyError {
  const detail = rawMessage(error).trim();
  for (const rule of RULES) {
    if (rule.contexts && !rule.contexts.includes(context)) continue;
    if (rule.test.test(detail)) {
      return { title: rule.title, hint: rule.hint, detail: detail || undefined, retryable: rule.retryable ?? false };
    }
  }
  return {
    title: CONTEXT_TITLES[context],
    hint: "Réessayez. Si cela se reproduit, notez le message ci-dessous pour le signaler.",
    detail: detail || undefined,
    retryable: true,
  };
}
