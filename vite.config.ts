import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api → local Worker (wrangler dev --port 8787) so FreeTier market
// routes work during `npm run dev`. Without wrangler, /api/market/* 404s.
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Vendor chunks (performance-budget.md): framework/deps hash-cache
        // independently of app code, so an app-only change doesn't force
        // users to re-download React/Supabase/icons.
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 3,
            },
            {
              name: "supabase",
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 2,
            },
            {
              name: "icons",
              test: /node_modules[\\/]@phosphor-icons[\\/]/,
              priority: 2,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
