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

## Project rules & docs

We are standardizing how this app is built so the experience stays
**consistent across every feature**. Before writing or changing UI, **always
read the relevant rule/doc files first** and follow them:

- **`.cursor/rules/components.mdc`** — reusable component contracts (what is
  locked and must not be restyled), the app-shell scroll model, header
  responsive behavior, and per-viewport card scrolling rules.
- **`design-system.md`** — design tokens, color, spacing, and styling rules.
- **`product-voice.md`** — copy, tone, and content rules.
- **`.cursor/rules/git-workflow.mdc`** — branch-per-change git workflow
  (`feature/*`, `bug/*`, `chore/*`; never commit straight to `main`).
- **`.cursor/rules/*.mdc`** — any other scoped rule docs that apply to the
  files you're touching.

Working agreement:

1. **Check the rules before you build.** Read the component rules and design
   system docs (and any other rule docs that match the files in scope) before
   creating a feature or editing a component.
2. **Reuse, don't re-style.** Shared components are stable. Don't restructure
   or restyle them as a side effect of an unrelated task — only change what is
   explicitly requested.
3. **When you establish a new pattern, write it down.** New features that
   introduce reusable behavior should add or update a rule doc (a new
   `.cursor/rules/*.mdc` or a section in the docs above) so it becomes the
   standard going forward.
4. **Keep docs and code in sync.** If a change alters documented behavior
   (e.g. a breakpoint, a scroll model, a component contract), update the rule
   doc in the same change.
