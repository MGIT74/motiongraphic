import type { MetadataRoute } from "next";

/** Studio privé : aucune exploration autorisée. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
