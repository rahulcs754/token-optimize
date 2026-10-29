# Token-saving habits and prompts

The setup script handles files. These habits handle the chat itself, which is where most tokens go.

## Claude Code

| Do this | Why it saves tokens |
|---|---|
| `/clear` when you start a new task | Old conversation is re-sent with every message. |
| `/compact` when a long task is half done | Replaces history with a short summary. |
| `/context` to see what fills the window | Shows big files, MCP tools, and memory. |
| Name the file: "fix the bug in `src/cart/total.ts`" | Claude skips searching the repo. |
| Use a cheaper model for simple work (`/model`) | Renames, small edits and questions do not need the biggest model. |
| Turn off MCP servers you are not using (`/mcp`) | Each server adds tool definitions to every request. |
| Put personal notes in `CLAUDE.local.md` | Keeps the shared `CLAUDE.md` small. |
| Use plan mode (Shift+Tab) before big changes | One cheap plan instead of several wrong attempts. |
| "Use test-runner to run the tests" | Logs stay in the Haiku subagent; you get only the failures. |
| `/clear` over `/compact` when the next task is unrelated | `/clear` is free; `/compact` reads the whole chat to summarize it. |

## Claude chat (claude.ai)

1. Put stable docs in a **Project** (knowledge files) instead of pasting them into every chat.
2. Start a new chat per task. Long chats re-read everything on each reply.
3. Paste only the function or file part you need, not the whole file.
4. To share several files at once, pack only the folder you need:
   `npx repomix --compress --include "src/cart/**"`.
5. Paste this into your Project instructions:

```text
Be brief. Answer first, then only needed detail.
For code: show only changed lines or a diff, not full files.
Do not repeat my question or code back to me.
If something is unclear, ask one short question.
```

## GitHub Copilot

1. In Copilot Chat, add context with `#file` (one file) instead of `@workspace` (whole repo) when you know where the code is.
2. Start a new chat thread per task.
3. Keep `.github/copilot-instructions.md` short. It is sent with every chat message.
4. For rules that apply to some files only, use `.github/instructions/NAME.instructions.md` with `applyTo: "src/**/*.tsx"` frontmatter, so they load only for those files.
5. Business/Enterprise plans: add heavy folders to **Content exclusion** in repo settings (Settings, Copilot, Content exclusion).

## Prompt snippets (any tool)

```text
Short answer only. Diff only.
```

```text
Only look at <file/folder>. Do not explore other files.
```

```text
Before writing code, give a 3-line plan and wait for my OK.
```
