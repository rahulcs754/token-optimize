#!/usr/bin/env node
// token-optimize: set up any project so Claude Code, Claude chat and GitHub Copilot
// read less and answer shorter. Zero dependencies.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TEMPLATES = path.join(__dirname, '..', 'templates');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY = flag('dry-run');
const FORCE = flag('force');
const ONLY = opt('only'); // claude | copilot

// Folders and files that waste tokens in every stack.
const COMMON_IGNORE = {
  dirs: ['.git', 'coverage', 'logs', 'tmp', '.idea', '.cache'],
  files: ['*.log', '*.map', '*.min.js', '*.min.css', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.ico',
    '*.webp', '*.pdf', '*.zip', '*.tar.gz', '*.mp4', '*.woff', '*.woff2', '*.ttf', '.env', '.env.*'],
};

const STACKS = [
  {
    id: 'node', label: 'Node.js / JavaScript / TypeScript', markers: ['package.json'],
    dirs: ['node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', '.output', 'storybook-static'],
    files: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', '*.tsbuildinfo'],
    commands: nodeCommands,
  },
  {
    id: 'python', label: 'Python', markers: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'],
    dirs: ['.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', 'dist', 'build', '*.egg-info'],
    files: ['*.pyc', 'poetry.lock', 'uv.lock', 'Pipfile.lock'],
    commands: () => ['- Test one file: `pytest path/to/test_file.py -q`', '- Lint: `ruff check <changed files>` (if ruff is used)'],
  },
  {
    id: 'go', label: 'Go', markers: ['go.mod'],
    dirs: ['vendor', 'bin'], files: ['go.sum'],
    commands: () => ['- Build: `go build ./...`', '- Test one package: `go test ./path/to/pkg`'],
  },
  {
    id: 'rust', label: 'Rust', markers: ['Cargo.toml'],
    dirs: ['target'], files: ['Cargo.lock'],
    commands: () => ['- Check: `cargo check`', '- Test one: `cargo test <name>`', '- Lint: `cargo clippy`'],
  },
  {
    id: 'java', label: 'Java / Kotlin (Maven or Gradle)', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    dirs: ['target', 'build', '.gradle', 'out'], files: ['*.class', '*.jar'],
    commands: () => exists('pom.xml')
      ? ['- Build: `mvn -q compile`', '- Test one: `mvn -q test -Dtest=ClassName`']
      : ['- Build: `./gradlew build -x test`', '- Test one: `./gradlew test --tests ClassName`'],
  },
  {
    id: 'dotnet', label: '.NET / C#', markers: ['*.sln', '*.csproj'],
    dirs: ['bin', 'obj'], files: [],
    commands: () => ['- Build: `dotnet build`', '- Test one: `dotnet test --filter Name`'],
  },
  {
    id: 'php', label: 'PHP', markers: ['composer.json'],
    dirs: ['vendor'], files: ['composer.lock'],
    commands: () => ['- Test one: `vendor/bin/phpunit path/to/Test.php`'],
  },
  {
    id: 'ruby', label: 'Ruby', markers: ['Gemfile'],
    dirs: ['vendor/bundle', '.bundle'], files: ['Gemfile.lock'],
    commands: () => ['- Test one: `bundle exec rspec path/to/spec.rb` (or `bin/rails test file`)'],
  },
  {
    id: 'dart', label: 'Dart / Flutter', markers: ['pubspec.yaml'],
    dirs: ['.dart_tool', 'build', '.pub-cache'], files: ['pubspec.lock', '*.g.dart', '*.freezed.dart'],
    commands: () => ['- Analyze: `flutter analyze`', '- Test one: `flutter test test/file_test.dart`'],
  },
];

// ---------- helpers ----------

function exists(p) {
  if (p.includes('*')) {
    const re = globToRegex(p);
    return fs.readdirSync(ROOT).some((f) => re.test(f));
  }
  return fs.existsSync(path.join(ROOT, p));
}

function globToRegex(glob) {
  return new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return null; }
}

function write(rel, content, { overwrite = false } = {}) {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full) && !overwrite && !FORCE) {
    console.log(`  skip   ${rel} (already exists, use --force to replace)`);
    return false;
  }
  if (!DRY) {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  console.log(`  write  ${rel}${DRY ? ' (dry run)' : ''}`);
  return true;
}

const tokens = (text) => Math.ceil(text.length / 4); // rough estimate, good enough to compare

// ---------- detection ----------

function detect() {
  const found = STACKS.filter((s) => s.markers.some(exists));
  const ignoreDirs = new Set(COMMON_IGNORE.dirs);
  const ignoreFiles = new Set(COMMON_IGNORE.files);
  for (const s of found) {
    s.dirs.forEach((d) => ignoreDirs.add(d));
    s.files.forEach((f) => ignoreFiles.add(f));
  }
  return { stacks: found, ignoreDirs: [...ignoreDirs], ignoreFiles: [...ignoreFiles] };
}

function nodeCommands() {
  const pkg = readJson('package.json') || {};
  const scripts = pkg.scripts || {};
  const pm = exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn' : exists('bun.lockb') ? 'bun' : 'npm run';
  const wanted = ['dev', 'build', 'test', 'lint', 'typecheck', 'type-check', 'format'];
  const lines = wanted.filter((k) => scripts[k]).map((k) => `- ${k}: \`${pm} ${k}\``);
  return lines.length ? lines : ['- (no npm scripts found)'];
}

function frameworks() {
  const pkg = readJson('package.json');
  if (!pkg) return [];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const known = { next: 'Next.js', react: 'React', vue: 'Vue', nuxt: 'Nuxt', svelte: 'Svelte', '@angular/core': 'Angular',
    express: 'Express', '@nestjs/core': 'NestJS', vite: 'Vite', typescript: 'TypeScript', tailwindcss: 'Tailwind',
    jest: 'Jest', vitest: 'Vitest', '@playwright/test': 'Playwright', 'react-native': 'React Native', expo: 'Expo' };
  return Object.keys(known).filter((k) => deps[k]).map((k) => known[k]);
}

// ---------- project map ----------

function buildMap(ignoreDirs, ignoreFiles) {
  const dirRes = ignoreDirs.map(globToRegex);
  const fileRes = ignoreFiles.map(globToRegex);
  const skipDir = (n) => dirRes.some((r) => r.test(n));
  const skipFile = (n) => fileRes.some((r) => r.test(n));
  const lines = [];
  const MAX_LINES = 80;

  function walk(dir, depth, prefix) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
    for (const e of entries) {
      if (lines.length >= MAX_LINES) return;
      if (e.name === '.ai') continue;
      if (e.isDirectory()) {
        if (skipDir(e.name)) continue;
        const count = countFiles(path.join(dir, e.name), skipDir, skipFile);
        lines.push(`${prefix}${e.name}/ (${count} files)`);
        if (depth < 2) walk(path.join(dir, e.name), depth + 1, prefix + '  ');
      } else if (depth === 0 && !skipFile(e.name)) {
        lines.push(`${prefix}${e.name}`);
      }
    }
  }
  walk(ROOT, 0, '');
  if (lines.length >= MAX_LINES) lines.push('... (cut to keep this file small)');

  return [
    '# Project map',
    '',
    'Auto-generated by token-optimize. Refresh with `npx github:rahulcs754/token-optimize --map`.',
    'Top-level files, and folders 3 levels deep with file counts. Build output and vendor folders are left out.',
    '',
    '```',
    ...lines,
    '```',
    '',
  ].join('\n');
}

function countFiles(dir, skipDir, skipFile, limit = 5000) {
  let n = 0;
  const stack = [dir];
  while (stack.length && n < limit) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!skipDir(e.name)) stack.push(path.join(current, e.name)); }
      else if (!skipFile(e.name)) n++;
    }
  }
  return n;
}

// ---------- writers ----------

function fill(template, vars) {
  return fs.readFileSync(path.join(TEMPLATES, template), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function templateVars(info) {
  const pkg = readJson('package.json') || {};
  const name = pkg.name || path.basename(ROOT);
  const fw = frameworks();
  const stackLines = info.stacks.length
    ? info.stacks.map((s) => `- ${s.label}${s.id === 'node' && fw.length ? ` (${fw.join(', ')})` : ''}`)
    : ['- (not detected, fill in)'];
  const commands = info.stacks.flatMap((s) => s.commands());
  return {
    NAME: name,
    DESCRIPTION: pkg.description || '(One line: what this project does.)',
    STACK: stackLines.join('\n'),
    STACK_INLINE: stackLines.map((l) => l.slice(2)).join('; '),
    COMMANDS: commands.length ? commands.join('\n') : '- (add build/test commands here)',
  };
}

function claudeSettings(info) {
  const rel = '.claude/settings.json';
  const existing = readJson(rel) || {};
  const deny = new Set((existing.permissions && existing.permissions.deny) || []);
  info.ignoreDirs.forEach((d) => deny.add(`Read(./**/${d}/**)`));
  info.ignoreFiles.forEach((f) => deny.add(`Read(./**/${f})`));
  const next = { ...existing, permissions: { ...(existing.permissions || {}), deny: [...deny] } };
  // Merging is safe, so always write this one.
  write(rel, JSON.stringify(next, null, 2) + '\n', { overwrite: true });
}

// PreToolUse hook that cuts long test/build output down to the errors.
function claudeHook() {
  write('.claude/hooks/filter-output.js', fs.readFileSync(path.join(TEMPLATES, 'hooks', 'filter-output.js'), 'utf8'));
  const rel = '.claude/settings.json';
  const settings = readJson(rel) || {};
  const hooks = settings.hooks || {};
  const pre = hooks.PreToolUse || [];
  if (JSON.stringify(pre).includes('filter-output.js')) return;
  pre.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/filter-output.js"' }] });
  const next = { ...settings, hooks: { ...hooks, PreToolUse: pre } };
  if (!DRY) fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(next, null, 2) + '\n');
  console.log(`  update ${rel} (output filter hook)${DRY ? ' (dry run)' : ''}`);
}

// Older CLAUDE.md files (or ones the user wrote) get the compact section added once.
function ensureCompactSection() {
  const full = path.join(ROOT, 'CLAUDE.md');
  if (!fs.existsSync(full)) return;
  const current = fs.readFileSync(full, 'utf8');
  if (/^#+\s*Compact instructions/mi.test(current)) return;
  const section = fs.readFileSync(path.join(TEMPLATES, 'CLAUDE.md'), 'utf8').match(/## Compact instructions\n[\s\S]*?(?=\n## )/)[0];
  if (!DRY) fs.writeFileSync(full, `${current.replace(/\s*$/, '')}\n\n${section}`);
  console.log(`  update CLAUDE.md (add compact instructions)${DRY ? ' (dry run)' : ''}`);
}

// ---------- path-scoped rules ----------

const TEST_GLOBS = {
  node: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
  python: ['**/test_*.py', '**/*_test.py', '**/tests/**'],
  go: ['**/*_test.go'],
  rust: ['tests/**'],
  java: ['src/test/**'],
  dotnet: ['**/*Tests/**', '**/*.Tests/**'],
  php: ['tests/**'],
  ruby: ['spec/**', 'test/**'],
  dart: ['test/**'],
};

// Rules that only load when the AI works on matching files, so they cost nothing the rest of the time.
function scopedRules(info) {
  const fw = frameworks();
  const testGlobs = [...new Set(info.stacks.flatMap((s) => TEST_GLOBS[s.id] || []))];
  const rules = [{
    name: 'tests', title: 'Test files',
    globs: testGlobs.length ? testGlobs : ['**/test/**', '**/tests/**'],
    lines: [
      'Run only the test file you changed, not the whole suite.',
      'Reuse existing helpers, fixtures and mocks. Read one similar test, not the whole test folder.',
      'Keep each test small: one behavior per test.',
    ],
  }];
  const ui = { React: ['**/*.tsx', '**/*.jsx'], 'React Native': ['**/*.tsx', '**/*.jsx'], Vue: ['**/*.vue'], Nuxt: ['**/*.vue'],
    Svelte: ['**/*.svelte'], Angular: ['**/*.component.ts', '**/*.component.html'] };
  const uiGlobs = [...new Set(fw.flatMap((f) => ui[f] || []))];
  if (uiGlobs.length) {
    rules.push({
      name: 'ui-components', title: 'UI components', globs: uiGlobs,
      lines: [
        'Copy the pattern of one nearby component. Do not scan the whole components folder.',
        `Reuse existing components and styles${fw.includes('Tailwind') ? ' (Tailwind classes)' : ''} before writing new ones.`,
        'Show only the changed part of a component, not the whole file.',
      ],
    });
  }
  const appDirs = ['app', 'src/app'].filter(exists);
  if (fw.includes('Next.js') && appDirs.length) {
    rules.push({
      name: 'nextjs-app-router', title: 'Next.js App Router', globs: appDirs.map((d) => `${d}/**`),
      lines: [
        'Server Components by default. Add "use client" only for state, effects or browser APIs.',
        'Fetch data in Server Components or route handlers, not in client effects.',
        'Read the nearest layout.tsx only when the change depends on it.',
      ],
    });
  }
  return rules;
}

function writeRules(info) {
  const footer = '- (Add rules that apply only to these files. One line each.)';
  for (const r of scopedRules(info)) {
    const body = `# ${r.title}\n\n${r.lines.map((l) => `- ${l}`).join('\n')}\n${footer}\n`;
    if (ONLY !== 'copilot') {
      write(`.claude/rules/${r.name}.md`, `---\npaths:\n${r.globs.map((g) => `  - "${g}"`).join('\n')}\n---\n\n${body}`);
    }
    if (ONLY !== 'claude') {
      write(`.github/instructions/${r.name}.instructions.md`, `---\napplyTo: "${r.globs.join(',')}"\n---\n\n${body}`);
    }
  }
}

function ensureGitignore() {
  const rel = '.gitignore';
  const full = path.join(ROOT, rel);
  const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (current.split(/\r?\n/).includes('CLAUDE.local.md')) return;
  if (!DRY) fs.appendFileSync(full, `${current && !current.endsWith('\n') ? '\n' : ''}CLAUDE.local.md\n`);
  console.log(`  update ${rel} (ignore CLAUDE.local.md)${DRY ? ' (dry run)' : ''}`);
}

// ---------- audit ----------

// Walk the repo and add up what an AI tool could open. Only .git is always skipped.
function readableSize(skipDirs, skipFiles) {
  const dirRes = ['.git', ...skipDirs].map(globToRegex);
  const fileRes = skipFiles.map(globToRegex);
  const result = { files: 0, tokens: 0, large: [], byTop: {} };
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!dirRes.some((r) => r.test(e.name))) stack.push(full); }
      else if (e.isFile() && !fileRes.some((r) => r.test(e.name))) {
        const size = fs.statSync(full).size;
        result.files++;
        result.tokens += Math.ceil(size / 4);
        const top = path.relative(ROOT, full).split(path.sep)[0];
        result.byTop[top] = (result.byTop[top] || 0) + Math.ceil(size / 4);
        if (size > 40_000) result.large.push({ path: path.relative(ROOT, full), tokens: Math.ceil(size / 4) });
      }
    }
  }
  result.large.sort((a, b) => b.tokens - a.tokens);
  result.large = result.large.slice(0, 10);
  return result;
}

function auditReport(info) {
  const instructionFiles = {};
  for (const f of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.github/copilot-instructions.md']) {
    if (exists(f)) instructionFiles[f] = tokens(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  }
  const settings = readJson('.claude/settings.json');
  const mcp = readJson('.mcp.json');
  const without = readableSize([], []);
  const withIt = readableSize(info.ignoreDirs, info.ignoreFiles);
  return {
    tool: 'token-optimize',
    project: (readJson('package.json') || {}).name || path.basename(ROOT),
    stacks: info.stacks.map((s) => s.label),
    measuredAt: new Date().toISOString(),
    instructions: { files: instructionFiles, tokens: Object.values(instructionFiles).reduce((a, b) => a + b, 0) },
    readable: {
      without: { files: without.files, tokens: without.tokens },
      with: { files: withIt.files, tokens: withIt.tokens },
    },
    // Top-level folders/files that the deny rules hide, biggest first.
    blocked: Object.entries(without.byTop)
      .map(([name, t]) => ({ path: name, tokens: t - (withIt.byTop[name] || 0) }))
      .filter((b) => b.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 8),
    denyRules: settings?.permissions?.deny?.length || 0,
    mcpServers: mcp?.mcpServers ? Object.keys(mcp.mcpServers).length : 0,
    largeFiles: withIt.large,
  };
}

function audit(info) {
  const r = auditReport(info);
  if (flag('json')) return console.log(JSON.stringify(r, null, 2));

  console.log('\nToken audit (rough estimate: 4 characters = 1 token)\n');
  for (const [f, t] of Object.entries(r.instructions.files)) {
    const warn = t > 1500 ? '  <- too big, aim for under 1,000' : '';
    console.log(`  ${f.padEnd(34)} ~${t} tokens${warn}`);
  }
  console.log(`  ${'Total (each tool loads its own)'.padEnd(34)} ~${r.instructions.tokens} tokens`);

  const k = (n) => `~${Math.round(n / 1000).toLocaleString()}k tokens`;
  const saved = r.readable.without.tokens - r.readable.with.tokens;
  console.log(`\n  Readable by the AI without token-optimize: ${r.readable.without.files} files, ${k(r.readable.without.tokens)}`);
  console.log(`  Readable by the AI with token-optimize:    ${r.readable.with.files} files, ${k(r.readable.with.tokens)}`);
  if (saved > 0) console.log(`  Blocked: ${k(saved)} (${Math.round((saved / r.readable.without.tokens) * 100)}%)`);

  console.log(`\n  Claude read-deny rules: ${r.denyRules}${r.denyRules ? '' : '  <- none yet, run setup to block the files above'}`);
  if (r.mcpServers) console.log(`  MCP servers in .mcp.json: ${r.mcpServers} (each adds tool definitions to context; remove unused ones)`);

  if (r.largeFiles.length) {
    console.log('\n  Large files the AI can still read (consider splitting or blocking):');
    r.largeFiles.forEach((f) => console.log(`    ${k(f.tokens).padStart(16)}  ${f.path}`));
  } else {
    console.log('\n  No large unblocked files. Good.');
  }
  console.log('\n  Tip: --audit --json > token-report.json, then load it on the website to see a chart.\n');
}

// ---------- main ----------

function help() {
  console.log(`token-optimize: make Claude Code, Claude chat and GitHub Copilot use fewer tokens.

Run inside your project folder:
  npx github:rahulcs754/token-optimize            set up everything
  npx github:rahulcs754/token-optimize --audit    show what costs tokens now (changes nothing)
  npx github:rahulcs754/token-optimize --audit --json   same, as JSON for the website widget
  npx github:rahulcs754/token-optimize --map      only refresh .ai/project-map.md

Options:
  --only claude|copilot   set up one tool only
  --dry-run               show what would change, write nothing
  --force                 replace existing CLAUDE.md / copilot-instructions.md`);
}

function main() {
  if (flag('help') || flag('h')) return help();
  const info = detect();

  if (flag('audit')) return audit(info);

  console.log(`\ntoken-optimize in ${ROOT}`);
  console.log(`Detected: ${info.stacks.map((s) => s.label).join(', ') || 'no known stack (using generic setup)'}\n`);

  write('.ai/project-map.md', buildMap(info.ignoreDirs, info.ignoreFiles), { overwrite: true });
  if (flag('map')) return;

  const vars = templateVars(info);
  if (ONLY !== 'copilot') {
    write('CLAUDE.md', fill('CLAUDE.md', vars));
    ensureCompactSection();
    claudeSettings(info);
    claudeHook();
    write('.claude/agents/test-runner.md', fs.readFileSync(path.join(TEMPLATES, 'agents', 'test-runner.md'), 'utf8'));
    ensureGitignore();
  }
  if (ONLY !== 'claude') {
    write('.github/copilot-instructions.md', fill('copilot-instructions.md', vars));
  }
  writeRules(info);

  console.log(`
Done. Next:
  1. Open CLAUDE.md and fill the "(...)" lines. Keep it short.
  2. Commit the new files so your whole team gets the savings.
  3. Run with --audit any time to check token cost.
Prompt tips for chat: https://github.com/rahulcs754/token-optimize/blob/main/docs/PROMPTS.md
`);
}

main();
