import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api → local Worker (wrangler dev --port 8787) so FreeTier market
// routes work during `npm run dev`. Without wrangler, /api/market/* 404s.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
