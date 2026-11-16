# Phase 1 — assistant foundation and read-only tools

Branch: `feat/assistant-phase-1`, cut from `origin/main` at `fd8a128`.
Scope approved under D7: **foundation + read-only tools + panel. No write path.**

## What ships

A signed-in user can open a panel (launcher button, or ⌘/Ctrl + J), ask a
question in natural language, and get an answer grounded in their own portfolio
and in live market data. The model never sees or produces authoritative numbers:
it picks a tool, the application runs it, and only tool output becomes financial
fact.

Seven read-only tools, registered server-side and mirrored in a client catalog:

| Tool | Answers | Reads |
| --- | --- | --- |
| `get_portfolio_summary` | "how am I doing" | `portfolios/{uid}` snapshot + quotes + FX |
| `get_holdings` | "what do I own" | snapshot stocks, `positionKey()` grouping |
| `get_holding_details` | "tell me about RELIANCE" | one position, FIFO lots, notes |
| `search_stock` | "find Tata Motors" | `/api/search` symbol search |
| `get_stock_price` | "price of TCS" | quote feed, EOD/outage-aware |
| `get_market_status` | "is the market open" | `getMarketStatus()` on IST clock |
| `navigate_to_section` | "open my journal" | `DASHBOARD_SECTION_IDS` allow-list |

`create_trade`, `delete_trade`, `disconnect_broker` and every other mutating
capability are **absent from the registry**, not hidden behind a flag. A registry
test asserts the catalog and the server registry describe the same set and that
no tool takes a path, collection, url or identity argument.

## Architecture

```
AssistantRoot (authenticated shell, src/pages/Index.tsx)
  ├─ AssistantLauncher           launcher button + ⌘/Ctrl+J
  ├─ AssistantPanel (Sheet)      focus trap, Esc, aria-live thread
  │    ├─ AssistantThread        messages, cards, typing state, retry
  │    └─ AssistantComposer      textarea, Enter to send, char cap
  └─ useAssistant(uid)           per-uid thread, request lifecycle, storage

POST /api/assistant/chat  (functions/api/assistant/chat.ts)
  1. kill switch (ASSISTANT_ENABLED)
  2. requireVerifiedIdentity → uid from the Firebase ID token only
  3. checkRateLimit("assistant", uid)  20/min
  4. strict zod body (24KB cap, ≤12 messages, ≤2000 chars each)
  5. registry parity check against the shared catalog
  6. orchestrator: ≤4 model rounds, ≤8 tool calls, 20s/provider, 45s/turn
       ├─ provider chain: Groq → OpenRouter → deterministic fallback
       ├─ executeToolDefinition(id) — tool args validated by a per-tool zod schema
       └─ guard: untrusted text fenced, secrets redacted, mutation claims rewritten
```

Provider keys stay in `Env`; they are read only inside `provider.ts`. The request
body carries no identity, and the schema is `strict`, so a `uid`/`role` in the
body fails the request instead of being ignored.

### Deterministic financial data (condition 2)

- Tool arguments are validated against zod schemas that accept only
  `ticker`, `market`, `section`, `limit`, `includeIndices`, `status` — no numeric
  financial value and no path.
- Prices, quantities, P&L, market status and dates are computed by existing
  application code: `portfolioTotals`, `summariseValuation`, `isValidPrice`,
  `deriveClosedLots`, `getMarketStatus`, `getIstParts`, `/api/search`.
- The model's only output that reaches the user is prose; every number rendered
  in a card comes from a tool result. Unknown values are rendered as `—`, never
  as `0` (asserted in `AssistantPanel.test.tsx`).
- A reply that claims something was changed is caught mechanically
  (`containsMutationClaim`) and replaced with the read-only correction, because
  in this phase any such claim is false by construction.

## Files

Added — server (`functions/api/assistant/`)

- `chat.ts`, `chat.test.ts`
- `_lib/orchestrator.ts`, `_lib/provider.ts` (+test), `_lib/prompt.ts`, `_lib/degraded.ts` (+test)
- `_lib/context.ts`, `_lib/guard.ts` (+test), `_lib/log.ts`
- `_lib/tools/portfolio.ts`, `_lib/tools/market.ts`, `_lib/tools/registry.ts` (+test)

Added — shared and client

- `src/lib/assistant/{schemas,types,toolCatalog,format,storage}.ts` (+`schemas.test.ts`, `storage.test.ts`)
- `src/components/assistant/{AssistantRoot,AssistantLauncher,AssistantPanel,AssistantThread,AssistantComposer,AssistantCards}.tsx`
- `src/components/assistant/useAssistant.ts`
- `src/components/assistant/{AssistantPanel,AssistantRoot}.test.tsx`

Edited (small, additive)

- `src/pages/Index.tsx` — mount `<AssistantRoot />` inside the shell
- `src/lib/navigation/routes.ts` — `DASHBOARD_SECTION_LABELS`
- `functions/api/_lib/ratelimit.ts` — `assistant` budget (20/min)
- `functions/api/_lib/types.ts` — `ASSISTANT_*` env
- `tsconfig.functions.json` — assistant globs + `@/*` path
- `src/hooks/usePortfolioSync.ts` — sweep assistant storage on sign-out
- `src/lib/portfolio/valuation.ts` — `typeof` narrowing for the strict Functions project (behaviour unchanged)
- `.env.example`, `.dev.vars.example` — documented variables

## Verification

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.app.json --noEmit` | clean |
| `npm run typecheck:functions` | clean |
| `npx vitest run --config vitest.functions.config.ts functions/api/assistant` | 43 passed / 5 files |
| `npx vitest run src/lib/assistant src/components/assistant` | 28 passed / 4 files |
| `npm test` | 982 passed, 21 skipped, 0 failed |
| `npm run lint` | no new findings; 39 pre-existing errors in untouched files (`api/news.ts`, `api/ai.ts`, `tailwind.config.ts`, …) |
| `npx wrangler pages functions build` | compiled successfully |
| `npm run build` | **not run locally** — `vite.config.ts` refuses to build without Firebase web config, which CI supplies from `ci.yml`. The equivalent compile path is covered by the type checks, the full vitest run (which transforms every new module) and the Functions bundle. |

Tests worth naming: provider adapter (tool-call parsing, timeout, fallback
chain), registry (catalog parity, no path/query arguments, every tool `read`),
guard (injection fencing, secret redaction, mutation-claim rewrite), route
(auth, rate limit, kill switch, degraded mode, honest tool failure), storage
(corrupt blob, per-uid isolation, quota failure), panel (empty state, cards,
`—` for unknown numbers, error + retry, a11y roles), root (signed-out renders
nothing, account switch drops the previous thread, 401 message, unreadable
response rejected).

## Known gaps (by design in this phase)

- No writes: no trade creation, editing, deletion or broker actions (Phase 2+).
- Concurrent-write/CAS protection (condition 1) is not implemented because there
  is no write path yet; Phase 2 must land `commitSnapshot` CAS, stale-write
  rejection and post-commit reload together with the first write tool.
- Audit trail is `console` records only (`logAssistantEvent`, no prices or
  message text). Firestore `assistantAudit` + rules is deferred to Phase 5 (D4).
- Alerts are still evaluated only while the app is open — the assistant reports
  this rather than implying background monitoring.
- F&O prices remain unavailable without `UPSTOX_ACCESS_TOKEN`; the assistant
  reports the gap instead of guessing.
- Brokerage order placement does not exist and is not exposed anywhere.

## Enabling locally

`GROQ_API_KEY` and/or `OPENROUTER_API_KEY` in `.dev.vars` turns on model answers;
without either, the route returns a deterministic keyword-routed answer built
from the same tools and labels the turn `degraded` in the reply card, so the
feature is usable (and testable) with no provider key at all.
`ASSISTANT_ENABLED=false` removes the capability without a code change.

No merge, no deploy.
