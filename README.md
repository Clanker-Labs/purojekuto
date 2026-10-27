<p align="center"><img src="public/icon.svg" width="72" alt=""></p>
<h1 align="center">purojekuto</h1>
<p align="center">Personal projects, from idea to done: lean AI specs, boards, shopping lists and working sessions in your calendar. Self-hosted.</p>

## What it does

- **Capture in a sentence.** "Build a bookshelf for the alcove." Add whatever you know (size, budget, deadline, what tools you have) and a **lean spec** is written in the background: the goal, what's in and out, the approach, milestones with concrete tasks, a priced shopping list, and an honest effort estimate. One page, readable on a phone.
- **Use the plan.** One click copies the spec's milestones (dated from your start date), tasks and purchases into the project. Rewrite the spec with instructions ("cheaper", "two weekends max"); every version is kept.
- **Board.** To do, doing, done. Drag cards on a laptop; on a phone, tap the arrow. Picking up the first task starts the project.
- **Shopping.** A list per project with prices, links and vendors, budget vs spent, and one list across every open project for the trip to the shop.
- **Working sessions.** Block time for a project and it lands in your **khal** calendar, in its own "Projects" calendar. Dated milestones go there too. Mark sessions done and the hours count.
- **People.** Invite someone (Settings → People) and share a project with them: they see and edit the plan, the board and the shopping list, tasks can be given to them, and their sessions go into *their* khal calendar. Everything else stays private.
- **Browse and plan.** Shelves (categories) with counts, status filters, search; a 12-week timeline with milestones; the next two weeks day by day; active projects with nothing planned.
- **Analytics.** Tasks done and hours worked per week, a six-month activity heatmap, projects by status and category, time by project, money vs budget, and what's overdue or stalled.
- **From idea to project.** Ideas from your **jinsen-ideas** inbox (with their research verdict) become projects in one click; the idea is tagged `project` there.
- **Interactive HTML.** Any project as one self-contained page you can open offline, tick through and print.
- **Agents.** An MCP server with 26 tools: LeClanker or Claude Code can create a project from a conversation, write or save specs, move tasks, add purchases, schedule sessions and read the analytics.
- **Passkeys only**, several people per install, an installable phone app, light and dark.

## AI providers

The same way as alfred:

- **Claude Code** (default): the `claude` CLI already signed in on the machine, run with `-p`, the prompt on stdin, JSON out, and every tool denied (project notes are untrusted text). No API key; it uses your subscription. In Docker the CLI and a copy of its credentials are mounted in (chezmoi does this).
- **Anthropic API:** set `ANTHROPIC_API_KEY` and pick it in Settings.

Specs run in a background queue, one at a time, and survive you closing the page. Settings → AI → **Test** makes a real round trip.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000, the first visitor creates the owner account
npm run db:seed-demo   # optional: a demo account with projects at every stage
```

Docker: `docker compose up -d` (port `PUROJEKUTO_PORT`, data in `PUROJEKUTO_DATA`). See `.env.example` for khal, ideas and AI settings.

## Connect an assistant

```bash
# Over HTTP (same port as the app)
claude mcp add --transport http purojekuto http://localhost:3000/api/mcp --header "Authorization: Bearer $PUROJEKUTO_API_TOKEN"

# Or over stdio, straight on the database
claude mcp add purojekuto -- node /path/to/purojekuto/bin/purojekuto-mcp.mjs
```

Then: "start a project to repaint the bedroom, about 200 €, before Christmas", "what should I work on this weekend?", "book two hours on Saturday morning for the bookshelf".

## Development

`npm test`, `npm run typecheck`, `npm run db:generate` after schema changes. Notes for coding agents are in [AGENTS.md](AGENTS.md).
