import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Protection SSRF : le serveur ne doit jamais aller chercher (import par URL,
 * capture d'écran) une adresse de son réseau interne (localhost, réseau privé,
 * métadonnées cloud…).
 */
function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // lien local / métadonnées cloud
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Tests locaux uniquement : MEDIA_ALLOW_PRIVATE_HOSTS=1 désactive le filtre (jamais en production). */
const allowPrivate = () => process.env.MEDIA_ALLOW_PRIVATE_HOSTS === "1";

/** Vérifie qu'une URL est publique (http/https, hôte résolu hors réseau privé). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL invalide.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Seules les URL http(s) sont acceptées.");
  if (url.username || url.password) throw new Error("URL avec identifiants refusée.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!allowPrivate() && (addresses.length === 0 || addresses.some(isPrivateAddress))) {
    throw new Error("Adresse refusée : le serveur ne contacte pas les réseaux privés ou locaux.");
  }
  return url;
}

/** Variante booléenne avec cache (filtrage des requêtes d'une page capturée). */
const cache = new Map<string, boolean>();
export async function isPublicHost(hostname: string): Promise<boolean> {
  if (cache.has(hostname)) return cache.get(hostname) as boolean;
  try {
    await assertPublicUrl(`https://${hostname}/`);
    cache.set(hostname, true);
    return true;
  } catch {
    cache.set(hostname, false);
    return false;
  }
}
