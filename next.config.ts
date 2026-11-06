import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Modèle de cache classique : compatible avec les Server Components qui
  // lisent les cookies Supabase au runtime (phase 1). Une migration vers
  // cacheComponents se fera via <Suspense> + "use cache" plus tard.
  cacheComponents: false,
  // Studio privé : empêcher l'indexation de toutes les réponses, y compris /login.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }];
  },
  // Rendu vidéo : modules natifs/binaires chargés tels quels côté serveur.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium", "ffmpeg-static"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;