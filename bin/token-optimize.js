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

function ensureGitignore() {
  const rel = '.gitignore';
  const full = path.join(ROOT, rel);
  const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  if (current.split(/\r?\n/).includes('CLAUDE.local.md')) return;
  if (!DRY) fs.appendFileSync(full, `${current && !current.endsWith('\n') ? '\n' : ''}CLAUDE.local.md\n`);
  console.log(`  update ${rel} (ignore CLAUDE.local.md)${DRY ? ' (dry run)' : ''}`);
}

// ---------- audit ----------

function audit(info) {
  console.log('\nToken audit (rough estimate: 4 characters = 1 token)\n');
  const alwaysLoaded = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.github/copilot-instructions.md'];
  let total = 0;
  for (const f of alwaysLoaded) {
    if (!exists(f)) continue;
    const t = tokens(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    total += t;
    const warn = t > 1500 ? '  <- too big, aim for under 1,000' : '';
    console.log(`  ${f.padEnd(34)} ~${t} tokens${warn}`);
  }
  console.log(`  ${'Total (each tool loads its own)'.padEnd(34)} ~${total} tokens`);

  const settings = readJson('.claude/settings.json');
  const denyCount = settings?.permissions?.deny?.length || 0;
  console.log(`\n  Claude read-deny rules: ${denyCount}${denyCount ? '' : '  <- none, Claude can read node_modules, build output, lockfiles'}`);

  const mcp = readJson('.mcp.json');
  const servers = mcp?.mcpServers ? Object.keys(mcp.mcpServers).length : 0;
  if (servers) console.log(`  MCP servers in .mcp.json: ${servers} (each adds tool definitions to context; remove unused ones)`);

  // Biggest readable files that are NOT blocked. These are the ones that hurt when the AI opens them.
  const dirRes = info.ignoreDirs.map(globToRegex);
  const fileRes = info.ignoreFiles.map(globToRegex);
  const big = [];
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!dirRes.some((r) => r.test(e.name))) stack.push(full); }
      else if (!fileRes.some((r) => r.test(e.name))) {
        const size = fs.statSync(full).size;
        if (size > 40_000) big.push([path.relative(ROOT, full), size]);
      }
    }
  }
  big.sort((a, b) => b[1] - a[1]);
  if (big.length) {
    console.log('\n  Large files the AI can still read (consider splitting or blocking):');
    big.slice(0, 10).forEach(([f, s]) => console.log(`    ~${Math.round(s / 4 / 1000)}k tokens  ${f}`));
  } else {
    console.log('\n  No large unblocked files. Good.');
  }
  console.log('');
}

// ---------- main ----------

function help() {
  console.log(`token-optimize: make Claude Code, Claude chat and GitHub Copilot use fewer tokens.

Run inside your project folder:
  npx github:rahulcs754/token-optimize            set up everything
  npx github:rahulcs754/token-optimize --audit    show what costs tokens now (changes nothing)
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
    claudeSettings(info);
    ensureGitignore();
  }
  if (ONLY !== 'claude') {
    write('.github/copilot-instructions.md', fill('copilot-instructions.md', vars));
  }

  console.log(`
Done. Next:
  1. Open CLAUDE.md and fill the "(...)" lines. Keep it short.
  2. Commit the new files so your whole team gets the savings.
  3. Run with --audit any time to check token cost.
Prompt tips for chat: https://github.com/rahulcs754/token-optimize/blob/main/docs/PROMPTS.md
`);
}

main();
