# {{NAME}}

{{DESCRIPTION}}

## Stack
{{STACK}}

## Commands
{{COMMANDS}}

## Where things are
Short folder map: `.ai/project-map.md`. Read it instead of listing or exploring the whole repo.

## How to work here (saves tokens)
- Open only the files the task needs. Search (grep/glob) first, then read the matching part.
- Never read build output, vendor folders, lockfiles or generated files.
- After a change, run the narrowest check: one test file or one lint target, not the full suite.
- Run tests, builds and lint through the `test-runner` subagent. It returns only the failures.
- Test and build output is cut to the errors. For the full log, add `| cat` to the command.
- Reply short. Show only changed code or a diff, never whole files. No summary of what you did unless asked.
- If the task is unclear, ask one question instead of exploring.

## Compact instructions
When compacting, keep: the task goal, files changed, failing tests with their errors, and decisions made.
Drop: full file contents, long logs, and search results already used.

## Project notes
- (Add only facts the code does not show: conventions, gotchas, where key logic lives. One line each.)
