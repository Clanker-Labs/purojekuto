<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# purojekuto — notes for coding agents

Self-hosted tracker for PERSONAL projects (home, DIY, side projects, trips, learning). Next.js 16 (App Router) + React 19 + Tailwind v4 + SQLite (better-sqlite3 + drizzle). Same skeleton as khal and wallet (passkeys, MCP, `/api/tools`).

- **Commands:** `npm test` (vitest), `npm run typecheck`, `npm run dev`, `npm run mcp` (stdio MCP), `npm run db:seed-demo` (an "Alex" account with projects at every stage), `npm run auth:link` (one-time sign-in link), `npm run db:generate` after schema changes (commit the generated `drizzle/` files), `npm run icons` after changing the mark.
- **Layers:** `src/lib` is pure (safe in the browser); `src/server/services` holds all domain logic and is the only place that touches the DB; pages (server components), `src/app/actions.ts` (server actions, return `{ ok, error }`), agent tools and API routes all call services.
- **Multi-user:** every row has `userId`; every service takes `uid` first and filters by it. Pages use `requireUser()`, actions `requireUid()`, API routes `apiUser(request)`.
- **Domain:** projects (status idea → planned → active → paused/done/dropped) in user-editable categories; milestones; tasks (todo/doing/done, fractional `sortOrder` so a drag rewrites one row; moving a task to doing starts a planned project); purchases (integer cents per unit, `needed/ordered/bought`); work sessions (UTC ms); an append-only `activity` log that feeds analytics — log through `logActivity`, never compute history from current rows.
- **Specs** (`src/lib/spec.ts`) are structured JSON, capped lists, versioned append-only in `specs`. Generated in the background: `requestSpec` queues an `ai_jobs` row and `kick()` works the queue in-process, one at a time; `recoverJobs()` (instrumentation) fails jobs a restart interrupted. `applySpec` copies milestones (dated from the start date), tasks and purchases into the project, skipping titles that exist — it must stay idempotent.
- **AI** (`src/server/ai/providers.ts`) works the same way as alfred: the local Claude Code CLI (`claude -p`, prompt on stdin, `--output-format json`, every tool denied) or the Anthropic API; the JSON Schema goes in the system prompt and replies are validated with zod. Lean is the product: keep `SPEC_SYSTEM` (`ai/prompt.ts`) strict about short, concrete output.
- **Integrations are optional and must degrade:** khal (`integrations/khal.ts`, its `/api/tools/<name>` with a bearer token) gets sessions and dated milestones in a "Projects" calendar; a khal failure is stored on the session (`khalError`), never thrown away or allowed to lose the row. jinsen-ideas (`integrations/ideas.ts`, REST) is read, and an idea that becomes a project is tagged `project` there — nothing else is written to it. Tests stub `fetch`.
- **Agent tools** live in one registry (`src/server/agent/tools.ts`) shared by `/api/mcp`, the stdio MCP and `/api/tools`. Descriptions are prompts. Projects are referenced by id or by (a unique part of) the title.
- **Export:** `/projects/<id>/export` renders one self-contained interactive HTML page (`server/export-html.ts`, ticks in localStorage, strict CSP); escape all user text.
- **UI:** server components by default, client components for the board, forms and polling. Primitives in `components/ui.tsx` and `components/bits.tsx`; charts are plain server-rendered SVG/CSS in `components/charts.tsx`. Colours are CSS variables in `globals.css`; category colours and chart series come from the `--series-*` ramp (no teal, no green: those mean brand and status), and are shown as washes (`.tint`), never as text.
