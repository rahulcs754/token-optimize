// Smoke test: run the setup on a fake Next.js + Python project and check the output files.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const bin = path.join(__dirname, '..', 'bin', 'token-optimize.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-optimize-'));
const put = (rel, content) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
};

put('package.json', JSON.stringify({
  name: 'demo-app', description: 'Demo shop',
  scripts: { dev: 'next dev', build: 'next build', test: 'vitest' },
  dependencies: { next: '15', react: '19' },
}));
put('pnpm-lock.yaml', '');
put('requirements.txt', 'fastapi\n');
put('src/app/page.tsx', 'export default () => null;\n');
put('node_modules/react/index.js', 'x');
put('.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'], deny: ['Read(./secret.txt)'] } }));

const run = (...args) => execFileSync('node', [bin, ...args], { cwd: dir, encoding: 'utf8' });
run();

const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
assert.match(claude, /# demo-app/);
assert.match(claude, /Next\.js, React/);
assert.match(claude, /`pnpm dev`/);
assert.match(claude, /Python/);

const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
assert.deepStrictEqual(settings.permissions.allow, ['Bash(ls)'], 'keeps existing allow rules');
assert.ok(settings.permissions.deny.includes('Read(./secret.txt)'), 'keeps existing deny rules');
assert.ok(settings.permissions.deny.includes('Read(./**/node_modules/**)'));
assert.ok(settings.permissions.deny.includes('Read(./**/.venv/**)'));

const map = fs.readFileSync(path.join(dir, '.ai/project-map.md'), 'utf8');
assert.match(map, /src\/ \(1 files\)/);
assert.doesNotMatch(map, /node_modules/);

assert.ok(fs.existsSync(path.join(dir, '.github/copilot-instructions.md')));
assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /CLAUDE\.local\.md/);

// Second run must not overwrite the user's edited CLAUDE.md or duplicate rules.
fs.appendFileSync(path.join(dir, 'CLAUDE.md'), '- my note\n');
run();
assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /my note/);
const again = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
assert.strictEqual(again.permissions.deny.length, settings.permissions.deny.length);
assert.strictEqual(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').match(/CLAUDE\.local\.md/g).length, 1);

assert.match(run('--audit'), /Total \(each tool loads its own\)/);

const report = JSON.parse(run('--audit', '--json'));
assert.ok(report.readable.without.tokens > report.readable.with.tokens, 'deny rules shrink what the AI can read');
assert.ok(report.instructions.files['CLAUDE.md'] > 0);

fs.rmSync(dir, { recursive: true, force: true });
console.log('All tests passed.');
