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

assert.strictEqual(again.hooks.PreToolUse.length, 1, 'hook is added once');

// Compact instructions, subagent and path-scoped rules.
assert.match(claude, /## Compact instructions/);
assert.match(fs.readFileSync(path.join(dir, '.claude/agents/test-runner.md'), 'utf8'), /model: haiku/);
const testRule = fs.readFileSync(path.join(dir, '.claude/rules/tests.md'), 'utf8');
assert.match(testRule, /paths:\n {2}- "\*\*\/\*\.test\.\*"/);
assert.match(testRule, /"\*\*\/test_\*\.py"/);
assert.match(fs.readFileSync(path.join(dir, '.github/instructions/ui-components.instructions.md'), 'utf8'), /applyTo: "\*\*\/\*\.tsx,\*\*\/\*\.jsx"/);
assert.match(fs.readFileSync(path.join(dir, '.claude/rules/nextjs-app-router.md'), 'utf8'), /"src\/app\/\*\*"/);

// A CLAUDE.md written by hand gets the compact section once.
fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Mine\n\n- my rule\n');
run();
run();
const own = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
assert.match(own, /my rule/);
assert.strictEqual(own.match(/## Compact instructions/g).length, 1);

// Output filter hook: rewrites plain test/build commands, leaves the rest alone.
const hookFile = path.join(dir, '.claude/hooks/filter-output.js');
const hook = (command) => JSON.parse(execFileSync('node', [hookFile], { input: JSON.stringify({ tool_input: { command, description: 'x' } }), encoding: 'utf8' }));
const rewritten = hook('CI=1 npm test -- src/a.test.ts').hookSpecificOutput.updatedInput;
assert.match(rewritten.command, /filter-output\.js" --run /);
assert.strictEqual(rewritten.description, 'x', 'keeps other tool input fields');
assert.ok(hook('pytest -q').hookSpecificOutput);
assert.deepStrictEqual(hook('ls -la'), {});
assert.deepStrictEqual(hook('npm test | cat'), {}, 'piped commands keep full output');

// Run mode: long output is cut to errors + tail, exit code is kept.
const script = 'for(let i=0;i<500;i++)console.log("ok line "+i);console.log("FAIL src/a.test.ts");console.log("  expected 1 got 2");for(let i=0;i<30;i++)console.log("more "+i);process.exit(3)';
const cmd = `node -e '${script}'`;
let out = '';
let status = 0;
try { execFileSync('node', [hookFile, '--run', Buffer.from(cmd).toString('base64')], { encoding: 'utf8' }); } catch (e) { out = e.stdout; status = e.status; }
assert.strictEqual(status, 3, 'exit code kept');
assert.match(out, /FAIL src\/a\.test\.ts/);
assert.match(out, /expected 1 got 2/);
assert.match(out, /more 29/);
assert.doesNotMatch(out, /ok line 100\n/);
assert.ok(out.split('\n').length < 40, 'long output is cut');
const short = execFileSync('node', [hookFile, '--run', Buffer.from('node -e "console.log(1);console.log(2)"').toString('base64')], { encoding: 'utf8' });
assert.strictEqual(short, '1\n2\n', 'short output is kept as is');

assert.match(run('--audit'), /Total \(each tool loads its own\)/);

const report = JSON.parse(run('--audit', '--json'));
assert.ok(report.readable.without.tokens > report.readable.with.tokens, 'deny rules shrink what the AI can read');
assert.ok(report.instructions.files['CLAUDE.md'] > 0);

fs.rmSync(dir, { recursive: true, force: true });
console.log('All tests passed.');
