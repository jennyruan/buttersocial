# SocialButter — project rules

Hackathon project. Beta Fund × Evermind "One Person Company", SF 2026-05-30.
Read `README.md` first for the locked one-page design (user / data model /
demo script / scope / time-box).

---

## 0. Canonical deploy: socialbutter.butterbase.dev

**The presenting URL is `https://socialbutter.butterbase.dev/`.** This is
the only link Jenny pastes into the submission, the deck, or the demo.

- **Frontend deploys** → Butterbase app `socialbutter` (`app_3moov7i9bzwb`)
  via `mcp__butterbase__create_frontend_deployment` + `start_deployment`.
- **Backend / API / DB / functions / auth / storage** → same app
  (`app_3moov7i9bzwb`). API URL: `https://api.butterbase.dev/v1/app_3moov7i9bzwb`.
- **All custom domains, OAuth callbacks, CORS allowed origins** must point
  at `socialbutter.butterbase.dev`, not `jenny-sandbox.butterbase.dev`.

`jenny-sandbox.butterbase.dev` (`app_quoz1f3ox8j0`) is a **scratch sandbox
only** — safe to break, do not link from any pitch artifact, do not point
production-ish wiring at it. If you deploy something there for testing,
say so explicitly in `STATUS.md` and don't update README / deck / footer
links to it.

If you have to redeploy the landing page from `/tmp/sb-deploy/`, deploy to
BOTH apps so they don't drift, but **socialbutter is the canonical one**.

---

## 1. Push to main (overrides global Branch Safety)

This is a hackathon repo with multiple Claude terminals + a human all
contributing in parallel for ~3 hours. Branch-and-PR friction is unaffordable.

**Rules:**
- Commit and push directly to `main`. No feature branches. No PRs.
- Print `git diff origin/main --stat` before every push **but do not pause
  for confirmation** — print, push, move on.
- Use the global commit message format (Co-Authored-By trailer included).
- If a push fails because someone else pushed, pull --rebase and retry.

This rule supersedes the global `~/.claude/CLAUDE.md` Branch Safety and
Pre-Push Review sections **for this repo only**.

---

## 2. No mock data — ESPECIALLY no mock user data

**All data must be real.** No fixtures, no hardcoded sample events, no
fake users, no dummy Evermind memories, no Lorem Ipsum.

Why: the demo's wow moment depends on Evermind retrieving Jenny's *actual*
past event feedback on screen. Mock data breaks the story and is obvious to
judges who've seen 50 demos that day.

### 2a. User data — zero tolerance, no exceptions

**NEVER hardcode user-shaped data anywhere in the codebase.** This is the
strictest version of the rule and overrides every other consideration
(scaffold convenience, demo prep, "just for testing", linter happiness).

Forbidden — do not type any of these into a source file, even temporarily:
- A name (real OR invented: "Jane Smith", "Alice", "John Doe")
- An email, phone, X handle, LinkedIn slug, Luma profile URL
- A bio, headline, "About me" snippet, profile photo URL
- A past-event feedback string ("loved the AI infra dinner", etc.)
- A goal sentence ("I want to meet investors")
- An attendee list, RSVP list, contact list
- A draft DM body, intro message, follow-up text
- A persona, avatar, or fictional user record
- An example `events`/`people`/`memories` array in the UI or tests

If you find yourself wanting to write `const sampleUser = { name: "..." }`,
**stop**. The right move is one of:

1. **Fail loud.** Throw or return an explicit error with instructions
   (`"Connect your Luma to see events"`, `"Sign in once via setup script"`).
2. **Empty state.** Render an empty list with a clear call to action.
3. **TODO marker.** `// TODO: wire <real source> here — do NOT add mock data`
4. **Real fetch.** Hit the real API even in dev — that's what env vars are for.

### 2b. Infra smoke tests are the only exception

`scripts/*-smoke.mjs` may write disposable test data IF it uses an
isolated identifier (e.g., `user_id: "buttersocial_demo_user"`) that is
NEVER read back into the product. Smoke tests verify wiring; they do
not seed demo content.

### 2c. Demo dataset

The dataset shown in demo must be Jenny's actual past events / actual
past feedback / actual social profile. Pre-seed Evermind from her real
history (one-shot script she runs herself); do not write a `seedDemoData()`
function in the repo.

**How to apply throughout:**
- Luma fetcher hits the real `lu.ma` site (HTML scrape / JSON-LD / __NEXT_DATA__).
- X / LinkedIn search + person lookup go through the live browser-agent profile.
- Evermind reads/writes go to a real Evermind instance.
- Butterbase persistence goes to a real Butterbase project.
- Calendar conflict detection reads real Apple / Google / Luma subscriptions.
- If a vendor SDK isn't wired up yet, leave the call site as a clearly
  marked `TODO` rather than substituting a fake value.

### 2d. Pre-commit grep self-check

Before committing, ask: would `git grep -E '(@example\.com|Lorem|John Doe|Jane Smith|sampleEvent|mockUser|fakeProfile)'` return anything? If yes, you violated this rule. Remove it before the commit lands.

---

## 3. Design language — mirror AMGINA

Visual language follows `~/code/experiments/amgina/app/globals.css`.

**Tokens (day theme):**
- `--cream` `#F5EFE0` (app bg) · `--paper` `#FBF7EC` (panes) · `--ink` `#2B2B2B` (text/borders)
- `--amber` `#D4A657` (primary accent) · `--coral` `#D46A6A` (warm accent)

**Type:** `LXGW WenKai Screen`, `Noto Sans SC`, system-ui (sans).
`JetBrains Mono` (mono).

**Shape:** 2px ink borders, `border-radius: 0` on cards, square 36×36 icon
buttons, sticky header.

**Class prefix:** use `sb-*` (SocialButter) mirroring AMGINA's `amg-*`.
E.g. `sb-card`, `sb-header`, `sb-fab`, `sb-icon-btn`.

Draft tokens live at `drafts/sb-tokens.css` — merge into `app/globals.css`
when scaffold lands.

---

## 4. Multi-terminal coordination

3 Claude terminals + 1 zsh open in parallel. To avoid collisions:

**Ownership map** (update this section as work shifts):
- **Terminal A (Opus, design + Luma + UI):** `lib/luma.ts`, `drafts/`, README, this file
- **Terminal B (tools + backend):** scaffold (`package.json`, `next.config.ts`, `app/layout.tsx`, `app/globals.css`, `tsconfig.json`), Butterbase MCP wiring, Evermind SDK wiring, `.env.local`
- **Terminal C:** TBD — claim a slice in this file before editing

**Protocol:**
- Before editing any file, `git pull --rebase` + check `git status`.
- After landing a change, `git push` immediately so others see it.
- If you're about to edit a file outside your ownership slice, comment in this
  file or ping in zsh terminal first.

---

## 5. File layout (target post-scaffold)

```
socialbutter/
├── app/
│   ├── layout.tsx              ← Terminal B (scaffold)
│   ├── globals.css             ← Terminal B (merge drafts/sb-tokens.css in)
│   ├── page.tsx                ← landing / dashboard
│   ├── connect/
│   │   └── page.tsx            ← from drafts/connect-page.tsx
│   └── api/
│       └── luma/
│           └── import/
│               └── route.ts    ← from drafts/luma-import-route.ts
├── lib/
│   ├── luma.ts                 ← Luma fetcher (DONE)
│   ├── evermind.ts             ← Terminal B
│   └── butterbase.ts           ← Terminal B
├── drafts/                     ← pre-scaffold staging, delete after migration
├── CLAUDE.md
└── README.md
```

**Post-scaffold migration:**
1. Move `drafts/connect-page.tsx` → `app/connect/page.tsx`
2. Move `drafts/luma-import-route.ts` → `app/api/luma/import/route.ts`
3. Merge `drafts/sb-tokens.css` contents into `app/globals.css`
4. Delete `drafts/`
5. Add LXGW WenKai font (Google Fonts: `https://fonts.googleapis.com/...`
   or self-host) in `app/layout.tsx`

---

## 6. Sync ritual (read this every turn)

3 Claude Code terminals are running in parallel. Conversation context
never crosses terminals; only files + git do. To stay current:

**At the start of every turn in this project, run:**
```bash
bash .claude/sync-hook.sh
```

This script auto-fetches `origin/main`, fast-forwards if you're clean and
behind, then prints `STATUS.md` tail + recent `git log` + any uncommitted
files. Output goes into your context.

**After every meaningful action** (commit, decision, blocker, handoff),
append one line to `STATUS.md` and push immediately:
```
- HH:MM [tag] short description — files or commit short-sha
```

Pick a `tag` at session start (A, B, C, or a topic like "luma", "scaffold")
and keep using it.

**Optional auto-fire:** if Jenny enables the UserPromptSubmit hook
(`docs/sync-protocol.md` has the JSON), the script fires automatically
every prompt — closest to real-time the harness allows.

See `docs/sync-protocol.md` for details and conflict handling.

---

## 7. Submission checklist (4:00pm hard deadline)

- [ ] App running locally and screencast-able
- [ ] Evermind memory retrieval visible in demo flow
- [ ] Butterbase persistence working (event + attendance write)
- [ ] Luma data is real (Jenny's actual profile)
- [ ] 3-slide deck in master Google Slides
- [ ] ≤2-min video demo recorded (OBS) and embedded
- [ ] Submitted via Butterbase MCP
