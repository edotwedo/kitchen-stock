# Kitchen Stock (web app): notes for AI agents

## Working with other AI models (Phil's team rules)

Several AI models (Claude, Codex/ChatGPT, others) work on this repo. The full rules are in the
`edotwedo/workshop` repo: GOALS.md, TEAM.md, backlog.md, and your job in `handoffs/`. If you can't
read that repo, these are the rules that matter:

- Work on your own branch (`codex/…`, `chatgpt/…`, `gemini/…`, `claude/…`). Never push to main. Never merge your own work.
- Run the checks below before pushing and report exactly what passed and failed.
- Never spend money, sign in, create accounts, or message anyone as Phil.
- Never commit keys, `.env` files, or customer data.
- Change only what the job needs; don't reformat other code. Label your own ideas as yours.

## Checks

```bash
npm ci
npm test            # Vitest. Tests on Phil's private kitchen-seed-data.json skip when it isn't there (it never goes on GitHub)
npm run typecheck   # tsc -b
```

## Things to know

- The phone app (`kitchen-stock-app`) copies shared rules from this repo's `src/` (logic, types, receipt,
  shoppingText and others) with its `tools/sync-shared.mjs`. Change shared rules here first.
- Database changes are SQL files in `supabase/migrations/`; Phil runs them by hand. Never assume one has run.
- Deploying is Phil's command (`npm run deploy`); don't deploy.
