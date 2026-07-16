# Skulls and Trading

Modern React app (Vite + TypeScript) with a Cloudflare Worker for FreeTier
market proxies and invite-only Beta accounts on Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill VITE_SUPABASE_* 
npm run dev
```

For **live market data**, also run the Worker (Vite proxies `/api` → `:8787`):

```bash
# Terminal 1 — SPA
npm run dev

# Terminal 2 — Worker
npx wrangler dev --config wrangler.jsonc --port 8787
```

Worker `.dev.vars` (git-ignored):

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=...
MARKET_AUTH_REQUIRED=false   # open market proxy while iterating locally
# Optional: FINNHUB_API_KEY, FRED_API_KEY
```

### Supabase (required for Beta sign-in / saves)

1. Create a free Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Insert invite codes, e.g.  
   `insert into public.invite_codes (code, note) values ('BETA-YOURCODE', 'pilot');`
4. After your first signup, promote Admin:  
   `update public.profiles set role = 'admin' where email = 'you@example.com';`
5. Put URL + anon key in `.env.local` and Worker secrets/vars.

Local and Cloudflare should use the **same** Supabase project so saves appear in both.

## Deploy to Cloudflare

`VITE_SUPABASE_*` is baked into the SPA at **build** time. Worker secrets
`SUPABASE_*` are runtime-only for `/api/market/*` — they do **not** fix the
login screen. Always deploy through:

```bash
npm run deploy   # loads .env.local, refuses if VITE_SUPABASE_* missing
```

One-time Worker secrets (runtime):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
# Do not set ENABLE_DEMO_GATE unless you intentionally re-open Demo Captain
```

If **Workers Builds** (Git auto-deploy on push to `main`) is enabled, add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Build variables and
secrets** in the Cloudflare dashboard. A push-triggered build without those
vars will overwrite a good local deploy and show “Beta sign-in is not
configured.”

## Beta accounts (not Demo Captain)

- **Invite-only** signup (one-time code) → email/password login.
- Home + Strategy Forge edits persist per user (Postgres RLS).
- Default strategies stay; bodies locked (duplicate/create to edit).
- Demo seed portfolios are **not** loaded for Beta users.
- Legal disclaimer acknowledgment once per login.
- Market Weather Market/Sector/Industry works with an empty watch.

See `data-architecture.md` and `.cursor/rules/security-hardening.mdc`.

## Project rules & docs

- **`.cursor/rules/components.mdc`** — reusable component contracts
- **`design-system.md`** / **`product-voice.md`**
- **`data-architecture.md`** (+ **`.cursor/rules/data-architecture.mdc`**)
- **`.cursor/rules/git-workflow.mdc`**
