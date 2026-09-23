# Titanium agent guide

## Project at a glance

Titanium is a mobile-first thought-support note app. Markdown in `notes.markdown`
is the source of truth; sections, embeddings, and salient items are derived data.
The product and architecture decisions live in [`docs/`](./docs/).

## Working conventions

- Start by checking `git status --short --branch`; do not discard or reformat
  existing user changes.
- GitHub Projects is the task record: [Titanium 開発](https://github.com/users/k5trismegistus/projects/5).
  Check related Project items and Issues before work. The Todo / In Progress / Done board is
  intentionally managed by hand; do not bulk import Issues or enable automatic addition.
  Create or change an item only when it is needed for the requested work. Pull requests are
  optional for this solo project.
- Keep changes scoped to the request. Read the closest implementation and its
  tests before changing behavior.
- Use TypeScript with the existing strict compiler settings. Do not add a
  dependency when the current stack can meet the need.
- Run the narrowest relevant checks first. For frontend changes, use
  `npm run lint` and `npm run build`; for Functions changes, use
  `npm --prefix functions run build`. Use `npm run format:check` to verify
  formatting, `npm run format` to apply it, and `npm run lint:all` to see
  migration warnings hidden by the default lint command.
- Update the corresponding document in `docs/` when a user-visible behavior,
  data model, or architectural decision changes.

## Safety and delivery

- Firebase is the default and preferred platform: Auth, Firestore, Storage,
  Functions, Hosting, and Vertex AI in Firebase. Do not add a non-Firebase
  service unless Firebase cannot meet the requirement; document why and obtain
  explicit approval first.
- Treat deploys, Firebase backfills/reindexing, changes to cloud resources,
  and data deletion as external or potentially destructive operations. Explain
  the exact target and obtain approval unless the user explicitly requested it.
- Never commit, push, create a pull request, or change repository settings
  without explicit user authorization.
- Firestore vector search permits at most 2,048 dimensions. Keep all stored
  and queried vectors aligned with `functions/src/vectorConfig.ts`.

## Scoped instructions

- [`src/AGENTS.md`](./src/AGENTS.md) — React editor and UX rules.
- [`functions/AGENTS.md`](./functions/AGENTS.md) — Firebase Functions, auth,
  and derived-data rules.
- [`docs/AGENTS.md`](./docs/AGENTS.md) — product and design documentation.

## Useful commands

```bash
npm run dev
npm run lint
npm run format:check
npm run build
npm --prefix functions run build
```
