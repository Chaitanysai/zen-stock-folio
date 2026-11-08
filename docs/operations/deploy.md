# Deploying to Cloudflare Pages

Status: written 2026-11-08 after the failed production deployment of `a7872e7`
(the PR #6 merge). The application code and `functions/` were correct; the
Pages project's build configuration was not.

## What happened on 2026-11-08

Cloudflare cloned `a7872e7`, found `wrangler.toml`, and read from it:

- `pages_build_output_dir = "dist"`
- Functions directory `/functions`

Then the build log showed:

```
No build command specified. Skipping build step.
```

and Functions bundling failed with `zod` unresolvable in five files (paths
relative to `functions/`): `api/ai.ts`, `api/brokers/_lib/schemas.ts`,
`api/fno-prices.ts`, `api/news.ts`, `api/prices.ts`.

**Root cause.** The `zenfolio` Pages project has no build command in its build
configuration. A Pages `wrangler.toml` can carry the deployment configuration
(output directory, compatibility date, `vars`, bindings) but has no key for a
build command — that is a project setting read from the build configuration
(dashboard: **Settings → Builds & deployments → Build configuration**, or the
Pages API `build_config.build_command`). With no build command configured, the
build system runs neither the install command nor the build command, so the
cloned workspace never gets `node_modules`. Functions bundling still runs —
it is part of deployment, not the build step — and its esbuild pass resolves
imports from the root `node_modules`, which does not exist. Every external
import in `functions/` therefore fails, `zod` first.

`zod` was never the bug. It is a direct production dependency
(`"zod": "^3.25.76"`), pinned as `zod@3.25.76` at `node_modules/zod` in
`package-lock.json`, and the five failing files are exactly the five production
Functions that import it. With dependencies installed, the whole Functions tree
bundles cleanly (verified below).

## Required project configuration (one-time, operator action)

Dashboard → **zenfolio** → Settings → Builds & deployments → Build
configuration:

- **Build command:** `npm ci && npm run build`
  (`npm ci` installs exactly `package-lock.json`; `npm run build` is the
  production Vite build.)
- **Build output directory:** leave as is — while `wrangler.toml` declares
  `pages_build_output_dir = "dist"`, the file wins.

Build environment variables (public Firebase web config, **not secrets** —
access is enforced by Firebase Auth plus `firestore.rules`, never by key
secrecy; `FIREBASE_API_KEY` is already committed in `wrangler.toml` `[vars]`):

| Variable | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | same value as `FIREBASE_API_KEY` in `wrangler.toml` |
| `VITE_FIREBASE_PROJECT_ID` | `zen-stock-folio` |
| `VITE_FIREBASE_APP_ID` | the web app id from Firebase console (also in the operator's `.env.local`) |

Without these three, `npm run build` fails **by design**
(`vite.config.ts` → `assertFirebaseConfig`): a bundle built without them ships
a login screen that can never authenticate. The same three values are set in
`.github/workflows/ci.yml`, so CI proves the build works with exactly what
Pages will be given.

Server-side secrets are unrelated to this failure and stay where they are:
`wrangler pages secret put <NAME>` per environment. Do not move them into the
build configuration.

## Verify a deployment locally

The same sequence CI (`verify` job) runs on every push:

```sh
npm ci                                              # install from the lockfile
npx tsc -p tsconfig.app.json --noEmit               # app types
npx tsc -p tsconfig.node.json --noEmit              # tooling types
npm run typecheck:functions                         # Functions types
npm run test                                        # unit and contract suites
npm run test:functions                              # Functions suites
npm run build                                       # production bundle -> dist/
npx wrangler@4 pages functions build \
  --outdir=.wrangler/tmp/functions-build            # Functions bundling gate
```

The last command is the one that would have caught this failure before merge:
it is the same esbuild pass the deployment performs over `functions/`, driven
by this repo's `wrangler.toml`, and it fails on any import it cannot resolve
from the root `node_modules`. On 2026-11-08 it compiled the full Functions tree
(~410 KB bundle) once `npm ci` had run — confirming the deployment failure was
solely the skipped build step.

## Notes

- A green CI run does not deploy the app; Pages deploys on merge to `main`
  using the build configuration above. Rules and indexes deploy from CI
  (`.github/workflows/ci.yml`), which is separate from the Pages build.
