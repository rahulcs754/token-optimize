# token-optimize

One command that sets up any project so **Claude Code**, **Claude chat** and **GitHub Copilot** read less, answer shorter, and cost less.

```bash
cd your-project
npx github:rahulcs754/token-optimize
```

No install, no dependencies. Needs Node 18+. Works on any stack (it detects Node/Next.js, Python, Go, Rust, Java/Kotlin, .NET, PHP, Ruby, Flutter, and falls back to a generic setup).

## What it does

| File it creates | Tool | How it saves tokens |
|---|---|---|
| `CLAUDE.md` | Claude Code | Short project brief (stack, real commands, working rules) plus a **Compact instructions** section, so `/compact` keeps the task, changed files and errors and drops file dumps and logs. If you already have a `CLAUDE.md`, only that section is added. |
| `.claude/settings.json` | Claude Code | `permissions.deny` rules so Claude **cannot** read `node_modules`, build output, lockfiles, images, `.env`. Merges with your existing settings. |
| `.claude/hooks/filter-output.js` + hook in `.claude/settings.json` | Claude Code | When Claude runs a plain test, build, lint or type-check command (`npm test`, `tsc`, `pytest`, `go test`, `cargo test`, ...), long output is cut to the error lines plus the last 15 lines. Short output and the exit code are kept. Add `\| cat` to any command to see the full log. Same idea as the hook in the [official cost docs](https://code.claude.com/docs/en/costs). |
| `.claude/agents/test-runner.md` | Claude Code | A subagent on the cheap Haiku model that runs tests/builds and returns only the failures (max 15 lines), so long logs never enter the main conversation. |
| `.claude/rules/*.md` and `.github/instructions/*.instructions.md` | Claude Code, Copilot | Path-scoped rules for test files, UI components and the Next.js `app/` folder (only the ones your stack has). They load only when the AI works on matching files, so they cost nothing the rest of the time. |
| `.github/copilot-instructions.md` | Copilot | Same brief and rules, in Copilot's format. |
| `.ai/project-map.md` | All | Small folder map with file counts. The AI reads this instead of listing the whole repo. |
| `.gitignore` line | Claude Code | Ignores `CLAUDE.local.md` for your personal notes. |

It never overwrites an existing `CLAUDE.md`, rule, agent, hook or Copilot file (use `--force` for that). Settings are merged, and the hook is added only once.

## Commands

```bash
npx github:rahulcs754/token-optimize            # set up everything
npx github:rahulcs754/token-optimize --audit    # show what costs tokens now, change nothing
npx github:rahulcs754/token-optimize --map      # refresh the project map only
npx github:rahulcs754/token-optimize --only claude    # or --only copilot
npx github:rahulcs754/token-optimize --dry-run  # preview
```

`--audit` shows the token size of your instruction files, how many tokens the AI can read with and without the deny rules, MCP servers in `.mcp.json`, and the biggest files the AI can still open. Add `--json` to get the same report as JSON.

## Website and widget

Site: https://rahulcs754.github.io/token-optimize/ (from the `docs/` folder).

It has a corner widget that compares tokens with and without token-optimize. The sample is a real measurement of a fresh Next.js 15 app after `npm install` and `npm run build`: **104.1M tokens readable without, 3.9k with** (node_modules, `.next` and the lockfile are blocked). Setup adds a few hundred tokens of always-loaded instructions per session (the generated `CLAUDE.md` is about 300).

- Viewers can hide it with the close button. The choice is remembered in their browser.
- **Load my report** shows your own numbers: run `npx github:rahulcs754/token-optimize --audit --json > token-report.json` and pick the file.
- Embed it on any page:

```html
<script src="https://rahulcs754.github.io/token-optimize/widget.js"
        data-report="/path/to/token-report.json"></script>
```

These numbers are what the AI *could* read (4 characters = 1 token), not a bill. To see real session cost, follow "Measure it on your repo" below.

## After setup

1. Fill the `(...)` lines in `CLAUDE.md` (one-line description, project notes). Keep it under ~60 lines.
2. Commit the files so the whole team benefits.
3. Read [docs/PROMPTS.md](docs/PROMPTS.md) for chat habits (Claude Code, claude.ai, Copilot). Most tokens are spent in chat, not files.

## Research: what already exists (Oct 2026)

**Built into the tools**
- Claude Code: `CLAUDE.md` memory, `permissions.deny` read rules, `/clear`, `/compact`, `/context`, model switching, automatic prompt caching, path-scoped rules in `.claude/rules/`.
- Copilot: `.github/copilot-instructions.md`, path-specific `.github/instructions/*.instructions.md`, `AGENTS.md` support, content exclusion (Business/Enterprise only, set in GitHub settings).
- Note: `.claudeignore` and `.copilotignore` are **not** official features. Many blog posts suggest them, but the real block for Claude Code is `permissions.deny`, which this tool writes.

**Community tools**
- [Repomix](https://github.com/yamadashy/repomix): packs a repo into one file for chat; `--compress` keeps only signatures.
- [Aider](https://aider.chat) repo map: sends a compact map of code symbols instead of whole files.
- [ccusage](https://github.com/ryoppippi/ccusage): reports Claude Code token use from local logs. Good for before/after checks.
- Output filters such as RTK: shrink long build/test logs before the AI reads them.

**The gap this fills:** each tool has its own setup and most people never do it. There was no single command that detects the stack and sets up Claude Code and Copilot together with sane ignore rules, a lean brief and a repo map.

**Biggest wins, in order** (from the sources below): keep always-loaded instructions small, block vendor/build folders, start fresh chats per task, ask for diffs instead of full files, use cheaper models for small work, and disable unused MCP servers.

Sources: [Claude Code token optimization, May 2026](https://dyb.mataroa.blog/claude-code-token-optimization-may-2026/), [23 Claude Code token tips](https://www.analyticsvidhya.com/blog/2026/05/tips-for-claude-code-token-saving/), [Firecrawl: Claude Code token efficiency](https://www.firecrawl.dev/blog/claude-code-token-efficiency), [GitHub Docs: custom instructions](https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions).

## Measure it on your repo

1. Before setup, do one normal task in Claude Code and note the cost (`/cost` or `npx ccusage`).
2. Run `npx github:rahulcs754/token-optimize`, fill `CLAUDE.md`, restart Claude Code.
3. Do a similar task and compare.

## Develop

```bash
npm test   # runs a smoke test on a fake Next.js + Python project
```

License: MIT
