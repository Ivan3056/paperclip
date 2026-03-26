# AGENTS.md

Guidance for human and AI contributors working in this repository.

## 1. Purpose

Paperclip is a control plane for AI-agent companies.
The current implementation target is V1 and is defined in `doc/SPEC-implementation.md`.

## 2. Read This First

Before making changes, read in this order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` is long-horizon product context.
`doc/SPEC-implementation.md` is the concrete V1 build contract.

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `packages/adapters/`: agent adapter implementations (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: shared adapter utilities
- `packages/plugins/`: plugin system packages
- `doc/`: operational and product docs

## 4. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

5. Keep plan docs dated and centralized.
New plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames.

## 6. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 7. Verification Before Hand-off

Run this full check before claiming done:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 8. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 9. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors

## 10. Task Title and Description Standards

When creating tasks or subtasks (in Paperclip or issue trackers), follow these rules:

- **Action-oriented titles:** Use verb + object + constraint format. Write directives, not problem statements.
  - Good: "Remove all credit_repair references from codebase"
  - Bad: "Missing credit_repair industry data"
- **Unambiguous descriptions:** State the desired outcome clearly so it cannot be misread as the opposite action.
- **Acceptance criteria required:** Every task must include explicit, verifiable acceptance criteria before work begins. Use checklist format.
- **Clarify before starting:** If a task has ambiguous title/description or missing acceptance criteria, ask for clarification in comments before beginning work.
- **Verify before done:** Before marking a task `done`, verify each acceptance criterion is met.

## 11. PR and Merge Policy

- **One task = one PR.** Each logical unit of work gets its own PR to main. Do not bundle unrelated changes.
- **Merge within 48 hours.** Feature branches must merge to main within 48 hours of task completion. No long-lived feature branches.
- **Rebase frequently.** Rebase against main often to catch integration issues early.
- **No big-bang merges.** If a branch is >10 commits ahead of main, break it into smaller PRs.
- **Done means merged.** A code task is not `done` until its PR is merged to main.

## 12. Completion Verification

- **Critical/high priority tasks:** Manager reviews output against acceptance criteria before `done`. The reviewer checks "did this solve the problem?" not just "does CI pass?"
- **Medium/low priority tasks:** Self-verification against acceptance criteria is sufficient, but must be documented in the closing comment.
- **Always verify outcomes, not just process.** Passing CI is necessary but not sufficient. The actual requirement must be met.

## 13. CI Gate Standards

- CI gates must comprehensively enforce business rules — use broad regex patterns, not just a few exact strings.
- When creating or updating CI gates, enumerate all known variants of the target pattern.
- When a CI gate gap is found, fix it immediately and add a regression test.
- Model: the `check-debranding.sh` tightening from DLD-848 is the reference pattern for comprehensive CI enforcement.

## 14. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change
5. All acceptance criteria verified and confirmed in closing comment
6. PR merged to main (for code changes)
