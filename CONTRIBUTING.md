# Contributing

External contributors should fork the public repository, create a focused branch, and open a pull request. Public visibility does not grant direct write access. By submitting a contribution, you confirm that you have the right to provide it for inclusion in ConsoleHawk.

## Local verification

Use Node.js 20 or newer, then run:

```bash
npm ci
npm ci --prefix demo-react
npm run build:react
npm run check
npm run test:e2e
npm run build
```

The generated React fixture must remain current. Every new trace capability needs a deterministic fixture, evaluator checks, a Node test where practical, and inclusion in the automated browser corpus.

## Product rules

- Never claim causality from timing alone.
- Never collect request bodies, response bodies, cookies, headers, storage, form values, or debugger scopes.
- Preserve local-first behaviour and require explicit review before export.
- Keep trace schema changes backward-compatible or add an explicit migration.
- Keep `package.json`, `package-lock.json`, `manifest.json`, and the README build number synchronized.
