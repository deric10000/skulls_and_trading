# Skulls and Trading

Modern React starter built with Vite and TypeScript.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Cloudflare

This repo is configured as a Cloudflare Worker with static assets in `dist`.

```bash
npm run build
npx wrangler deploy --config wrangler.jsonc
```
