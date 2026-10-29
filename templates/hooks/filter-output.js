#!/usr/bin/env node
// token-optimize output filter for Claude Code. Zero dependencies.
//
// Hook mode (no args): a PreToolUse hook on Bash. When Claude runs a plain test, build,
// lint or type-check command, it rewrites the command to run through this file.
// Run mode (--run <base64 command>): runs the command, keeps short output as is, and cuts
// long output down to the error lines plus the final summary. The exit code is kept.
//
// To see the full output, add a pipe, e.g. `npm test | cat`. Piped commands are never touched.
'use strict';

const { spawnSync } = require('child_process');

const RUNNERS = [
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|typecheck|type-check|check)\b/,
  /^(npx|bunx|pnpm\s+exec|pnpm\s+dlx|yarn)\s+(jest|vitest|tsc|eslint|next\s+build|playwright\s+test)\b/,
  /^(jest|vitest|tsc|eslint)\b/,
  /^((uv|poetry)\s+run\s+)?(python3?\s+-m\s+)?pytest\b/,
  /^go\s+(test|build|vet)\b/,
  /^cargo\s+(test|build|check|clippy)\b/,
  /^(mvn|\.\/mvnw|gradle|\.\/gradlew)\b/,
  /^dotnet\s+(test|build)\b/,
  /^(vendor\/bin\/)?phpunit\b/,
  /^(bundle\s+exec\s+)?(rspec|rails\s+test)\b/,
  /^bin\/rails\s+test\b/,
  /^flutter\s+(test|analyze)\b/,
];
const UNSAFE = /[|;&<>`\n]|\$\(/; // pipes, chains, redirects, subshells: leave alone
const ENV_PREFIX = /^(\w+=\S*\s+)*/;

const KEEP_ALL_UNDER = 60; // lines
const MAX_ERROR_LINES = 150;
const TAIL = 15;
const ERROR = /(FAIL|ERROR|Error|error[\s:[]|✗|✕|×|failed|panicked|Traceback|Exception|AssertionError|warning TS)/;

function shouldFilter(cmd) {
  const c = cmd.trim();
  if (!c || UNSAFE.test(c) || c.includes('filter-output.js')) return false;
  const bare = c.replace(ENV_PREFIX, '');
  return RUNNERS.some((r) => r.test(bare));
}

function hook() {
  let raw = '';
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { return console.log('{}'); }
    const cmd = input.tool_input && input.tool_input.command;
    if (typeof cmd !== 'string' || !shouldFilter(cmd)) return console.log('{}');
    const self = __filename.split('\\').join('/');
    const command = `node "${self}" --run ${Buffer.from(cmd).toString('base64')}`;
    console.log(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...input.tool_input, command } },
    }));
  });
}

function shorten(text) {
  const lines = text.replace(/\s+$/, '').split(/\r?\n/);
  if (lines.length <= KEEP_ALL_UNDER) return lines.join('\n');
  const keep = new Set();
  lines.forEach((l, i) => {
    if (!ERROR.test(l)) return;
    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 4); j++) keep.add(j);
  });
  const tailStart = lines.length - TAIL;
  const picked = [...keep].filter((i) => i < tailStart).sort((a, b) => a - b).slice(0, MAX_ERROR_LINES);
  const out = [];
  let last = -1;
  for (const i of picked) {
    if (i !== last + 1) out.push('...');
    out.push(lines[i]);
    last = i;
  }
  const hidden = lines.length - picked.length - TAIL;
  out.push(`... [token-optimize: ${hidden} of ${lines.length} lines hidden. Only if the lines shown are not enough, rerun with \`| cat\` for the full log.]`);
  out.push(...lines.slice(tailStart));
  return out.join('\n');
}

function run(encoded) {
  const cmd = Buffer.from(encoded, 'base64').toString('utf8');
  const res = spawnSync(`${cmd} 2>&1`, { shell: true, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (res.error) {
    console.error(res.error.message);
    process.exit(1);
  }
  process.stdout.write(shorten(res.stdout || '') + '\n');
  process.exit(res.status === null ? 1 : res.status);
}

const i = process.argv.indexOf('--run');
if (i >= 0) run(process.argv[i + 1] || '');
else hook();
