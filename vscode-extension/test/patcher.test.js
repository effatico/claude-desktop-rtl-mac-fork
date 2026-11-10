'use strict';
// Plain-node tests for lib/patcher.js and uninstall.js.
//   node test/patcher.test.js [path/to/claude-code/webview]
// Works on a temporary COPY of a Claude Code webview folder; the installed
// extension is only read. Defaults to the newest ~/.vscode/extensions
// anthropic.claude-code-* folder.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const patcher = require('../lib/patcher');

const EXT_ROOT = path.join(__dirname, '..');
const assets = patcher.assetPaths(EXT_ROOT);

function findWebview() {
    if (process.argv[2]) return path.resolve(process.argv[2]);
    const root = path.join(os.homedir(), '.vscode', 'extensions');
    const dirs = fs.readdirSync(root).filter((n) => n.startsWith('anthropic.claude-code-')).sort();
    if (!dirs.length) throw new Error('No Claude Code extension found in ' + root);
    return path.join(root, dirs[dirs.length - 1], 'webview');
}

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('PASS ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); }
}

const header = (family) => patcher.buildHeader({ payloadPath: assets.payload, fontsDir: assets.fonts, family: family });
const read = (p) => fs.readFileSync(p);

const src = findWebview();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crtl-test-'));
const ccDir = path.join(tmp, 'anthropic.claude-code-0.0.1');
fs.mkdirSync(ccDir);
execFileSync('cp', ['-R', src, path.join(ccDir, 'webview')]);
const target = patcher.targetOf(ccDir);
const backup = target + patcher.BACKUP_SUFFIX;
// The installed copy may already be patched by this extension: test on the
// original inside it, and drop its backup.
fs.writeFileSync(target, patcher.strip(fs.readFileSync(target, 'utf8')));
try { fs.unlinkSync(backup); } catch (e) { /* none */ }
const original = read(target);
console.log('source: ' + src + '\ncopy:   ' + target + ' (' + original.length + ' bytes)');

function esmCheck(file) {
    const mjs = path.join(tmp, 'check.mjs');
    fs.copyFileSync(file, mjs);
    execFileSync(process.execPath, ['--check', mjs], { stdio: 'pipe' });
    fs.unlinkSync(mjs);
}

test('header: Vazirmatn embeds 2 faces, payload first', () => {
    const h = header('Vazirmatn');
    assert.ok(h.startsWith('// ===') && h.indexOf('CLAUDE RTL PATCH START') < h.indexOf('CLAUDE RTL FONT START'));
    assert.strictEqual((h.match(/\{w:"/g) || []).length, 2);
    assert.ok(h.includes('{w:"400",s:"normal",d:"') && h.includes('{w:"700",s:"normal",d:"'));
    assert.ok(h.includes('unicodeRange:R') && h.includes(patcher.RTL_UNICODE_RANGE));
    assert.ok(h.includes("[role='textbox'][contenteditable]") && !h.includes('.ProseMirror{font'));
    assert.ok(!/data:font|url\(data:/.test(h), 'no data: URI');
});
test('header: Parastoo is one variable face', () => {
    const h = header('Parastoo');
    assert.strictEqual((h.match(/\{w:"/g) || []).length, 1);
    assert.ok(h.includes('{w:"100 900",s:"normal",d:"'));
});
test('header: unknown font falls back to local()', () => {
    assert.ok(header('B Nazanin').includes("l:\"local('B Nazanin')\""));
});
test('header: none / empty has no font block', () => {
    for (const v of ['none', 'NONE', '', '  ']) {
        const h = header(v);
        assert.ok(!h.includes('CLAUDE RTL FONT START') && h.includes('CLAUDE RTL VSCODE STYLE START'));
    }
});
test('header: bad font name rejected', () => {
    assert.throws(() => header('Evil"};alert(1)//'), /unsupported characters/);
});
test('header: syntax ok as classic script and as module', () => {
    const f = path.join(tmp, 'h.js');
    fs.writeFileSync(f, header('Vazirmatn'));
    execFileSync(process.execPath, ['--check', f]);
    esmCheck(f);
});

const hV = header('Vazirmatn');
test('apply: marker, backup = original, ESM syntax ok', () => {
    const r = patcher.apply(target, hV);
    assert.deepStrictEqual(r, { changed: true, reason: 'patched' });
    const s = patcher.status(target);
    assert.ok(s.patched && s.backup && s.hash === patcher.hashOf(hV));
    const txt = fs.readFileSync(target, 'utf8');
    assert.ok(txt.startsWith('// --- CLAUDE RTL VSCODE ' + patcher.hashOf(hV) + ' START ---\n'));
    assert.ok(read(backup).equals(original));
    assert.ok(read(target).subarray(-original.length).equals(original), 'original follows the header');
    esmCheck(target);
});
test('apply again: idempotent, byte-identical', () => {
    const before = read(target);
    assert.deepStrictEqual(patcher.apply(target, hV), { changed: false, reason: 'already patched' });
    assert.ok(read(target).equals(before));
});
test('font change: re-applied from backup with new hash', () => {
    const hP = header('Parastoo');
    assert.deepStrictEqual(patcher.apply(target, hP), { changed: true, reason: 'updated' });
    const s = patcher.status(target);
    assert.strictEqual(s.hash, patcher.hashOf(hP));
    assert.notStrictEqual(s.hash, patcher.hashOf(hV));
    assert.strictEqual(fs.readFileSync(target, 'utf8').split('CLAUDE RTL PATCH START').length, 2, 'one header only');
    assert.ok(read(backup).equals(original));
    esmCheck(target);
});
test('remove: byte-identical original, no backup left', () => {
    assert.deepStrictEqual(patcher.remove(target), { changed: true, reason: 'restored' });
    assert.ok(read(target).equals(original));
    assert.ok(!fs.existsSync(backup));
    assert.strictEqual(patcher.remove(target).changed, false);
});
test('no temp files left in webview dir', () => {
    assert.deepStrictEqual(fs.readdirSync(path.dirname(target)).filter((n) => n.includes('.crtl-')), []);
});
test('remove without backup strips the header', () => {
    patcher.apply(target, hV);
    fs.unlinkSync(backup);
    patcher.remove(target);
    assert.ok(read(target).equals(original));
});
test('stale backup is replaced when the file was rewritten', () => {
    fs.writeFileSync(backup, 'old bundle');
    patcher.apply(target, hV);
    assert.ok(read(backup).equals(original));
    patcher.remove(target);
    assert.ok(read(target).equals(original) && !fs.existsSync(backup));
});
test('backup from another build never overwrites a patched file', () => {
    const hP = header('Parastoo');
    patcher.apply(target, hV);
    fs.writeFileSync(backup, 'old bundle');
    patcher.apply(target, hP);
    assert.ok(read(backup).equals(original));
    fs.writeFileSync(backup, 'old bundle');
    patcher.remove(target);
    assert.ok(read(target).equals(original) && !fs.existsSync(backup));
});
test('stale temp files are removed', () => {
    const t = target + '.crtl-tmp-1-dead';
    fs.writeFileSync(t, 'x');
    patcher.apply(target, hV);
    assert.ok(!fs.existsSync(t));
    patcher.remove(target);
});
test('"use strict" directive stays first', () => {
    const d = path.join(tmp, 'strict', 'webview');
    fs.mkdirSync(d, { recursive: true });
    const f = path.join(d, 'index.js');
    const body = '"use strict";\nexport const x = 1;\n';
    fs.writeFileSync(f, body);
    patcher.apply(f, hV);
    const txt = fs.readFileSync(f, 'utf8');
    assert.ok(txt.startsWith('"use strict";\n// --- CLAUDE RTL VSCODE '));
    assert.ok(patcher.status(f).patched);
    assert.strictEqual(patcher.strip(txt), body);
    patcher.remove(f);
    assert.strictEqual(fs.readFileSync(f, 'utf8'), body);
});
test('symlinked target or dir is refused', () => {
    const d = path.join(tmp, 'link');
    fs.mkdirSync(path.join(d, 'real'), { recursive: true });
    fs.writeFileSync(path.join(d, 'real', 'index.js'), 'x');
    fs.symlinkSync(path.join(d, 'real'), path.join(d, 'webview'));
    assert.throws(() => patcher.apply(path.join(d, 'webview', 'index.js'), hV), /symbolic link/);
    const d2 = path.join(tmp, 'link2', 'webview');
    fs.mkdirSync(d2, { recursive: true });
    fs.symlinkSync(path.join(d, 'real', 'index.js'), path.join(d2, 'index.js'));
    assert.throws(() => patcher.apply(path.join(d2, 'index.js'), hV), /symbolic link/);
    assert.strictEqual(fs.readFileSync(path.join(d, 'real', 'index.js'), 'utf8'), 'x');
});
test('uninstall.js restores every patched copy in a fake extensions dir', () => {
    const home = path.join(tmp, 'home');
    const fake = path.join(tmp, 'fake-exts');
    fs.mkdirSync(home);
    const a = path.join(fake, 'anthropic.claude-code-1.0.0', 'webview');
    const b = path.join(home, '.cursor', 'extensions', 'anthropic.claude-code-2.0.0', 'webview');
    const c = path.join(fake, 'someone.else-1.0.0', 'webview');
    for (const d of [a, b, c]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'index.js'), 'export default 1;\n'); }
    patcher.apply(path.join(a, 'index.js'), hV);
    patcher.apply(path.join(b, 'index.js'), hV);
    patcher.apply(path.join(c, 'index.js'), hV); // not Claude Code: must be left alone
    const out = execFileSync(process.execPath, [path.join(EXT_ROOT, 'uninstall.js')],
        { env: Object.assign({}, process.env, { HOME: home, VSCODE_EXTENSIONS: fake }) }).toString();
    assert.ok(/restored 2 file\(s\)/.test(out), out);
    for (const d of [a, b]) {
        assert.strictEqual(fs.readFileSync(path.join(d, 'index.js'), 'utf8'), 'export default 1;\n');
        assert.ok(!fs.existsSync(path.join(d, 'index.js' + patcher.BACKUP_SUFFIX)));
    }
    assert.ok(patcher.status(path.join(c, 'index.js')).patched);
});

// Header for the browser test.
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'header.js'), hV);
fs.copyFileSync(path.join(src, 'index.css'), path.join(outDir, 'index.css'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
