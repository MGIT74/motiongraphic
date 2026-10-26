import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Modèle de cache classique : compatible avec les Server Components qui
  // lisent les cookies Supabase au runtime (phase 1). Une migration vers
  // cacheComponents se fera via <Suspense> + "use cache" plus tard.
  cacheComponents: false,
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