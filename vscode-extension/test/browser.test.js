'use strict';
// Headless Chrome check of the header against Claude Code's real index.css.
//   node test/patcher.test.js   (writes test/out/header.js and index.css)
//   node test/browser.test.js
// Builds test/out/page.html with markup shaped like Claude Code's chat, runs
// the header in it as a module script (as in the patched webview/index.js),
// then reads back data-crtl* attributes and computed styles. Writes
// test/out/screenshot.png.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = path.join(__dirname, 'out');
const header = fs.readFileSync(path.join(out, 'header.js'), 'utf8');

const probe = `
const ids = ['p-mixed','p-en','p-code','ul','li-fa','li-en','table','th','td-en','pre','prompt','mirror','prompt-wrap'];
document.fonts.ready.then(() => setTimeout(() => {
  const r = {};
  for (const id of ids) {
    const el = document.getElementById(id), cs = getComputedStyle(el);
    r[id] = { dir: el.getAttribute('dir'), crtl: el.getAttribute('data-crtl'), text: el.hasAttribute('data-crtl-text'),
      direction: cs.direction, bidi: cs.unicodeBidi, align: cs.textAlign, font: cs.fontFamily };
  }
  r.fontLoaded = document.fonts.check("16px 'Claude RTL Font'", 'سلام');
  r.fontStatus = Array.from(document.fonts).filter(f => f.family.includes('Claude RTL')).map(f => f.status);
  r.alias = window.__claudeRtlFont || null;
  r.styles = ['claude-rtl-styles','claude-rtl-font','claude-rtl-vscode'].filter(i => document.getElementById(i));
  document.getElementById('results').textContent = JSON.stringify(r);
}, 400));`;

const page = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src file: 'unsafe-inline'; font-src file:; img-src file: data:; script-src 'nonce-crtltest'; worker-src file:;">
<link rel="stylesheet" href="index.css">
<style>:root{--vscode-chat-font-family:-apple-system,BlinkMacSystemFont,sans-serif;--vscode-chat-font-size:14px;--app-monospace-font-family:Menlo,monospace;--app-input-foreground:#ddd}
body{background:#1e1e1e;color:#ddd;padding:12px;display:block}#results{display:none}
.inputContainer{position:relative;border:1px solid #555;margin-top:12px;display:flex}</style>
</head><body>
<div class="root_-a7MRw">
<p id="p-mixed">Claude Code یک ابزار برنامه‌نویسی است که در ترمینال اجرا می‌شود و به شما کمک می‌کند کد بنویسید.</p>
<p id="p-en">This paragraph is English only and must not be touched.</p>
<p id="p-code">برای نصب دستور <code>npm install -g @anthropic-ai/claude-code</code> را اجرا کنید.</p>
<ul id="ul" dir="ltr">
<li id="li-fa">React یک کتابخانه برای ساخت رابط کاربری است</li>
<li>نصب با <code>npm install react</code> انجام می‌شود</li>
<li id="li-en">English only item in a Persian list</li>
</ul>
<table id="table"><thead><tr><th id="th">نام فایل</th><th>توضیح</th></tr></thead>
<tbody><tr><td>extension.js</td><td>ورودی افزونه</td></tr><tr><td id="td-en">lib/patcher.js</td><td>File logic, no vscode import</td></tr></tbody></table>
<pre id="pre"><code>const x = "سلام"; // comment
console.log(x);</code></pre>
</div>
<div class="inputContainer" id="prompt-wrap">
<div id="prompt" class="messageInput_cKsPxg" contenteditable="plaintext-only" role="textbox" aria-label="Message input">سلام، لطفاً فایل README را به‌روز کن</div>
<div id="mirror" class="mentionMirror_cKsPxg" aria-hidden="true">سلام، لطفاً فایل README را به‌روز کن</div>
</div>
<pre id="results"></pre>
<script type="module" nonce="crtltest">${header}
${probe}</script>
</body></html>`;
fs.writeFileSync(path.join(out, 'page.html'), page);

function chrome(args) {
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'crtl-chrome-'));
    try {
        return execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--allow-file-access-from-files', '--user-data-dir=' + prof, '--virtual-time-budget=5000',
            '--window-size=900,900'].concat(args), { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).toString();
    } finally { fs.rmSync(prof, { recursive: true, force: true }); }
}

const url = 'file://' + path.join(out, 'page.html');
const dom = chrome(['--dump-dom', url]);
const m = /<pre id="results">([^<]*)<\/pre>/.exec(dom);
if (!m || !m[1]) { console.log(dom.slice(-2000)); throw new Error('no results in dumped DOM'); }
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log(JSON.stringify(r, null, 1));
const shot = path.join(out, 'screenshot.png');
chrome(['--screenshot=' + shot, url]);

let passed = 0, failed = 0;
function check(name, fn) {
    try { fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
}
const rtlBlock = (o) => o.crtl === 'rtl' && o.direction === 'rtl';
check('mixed paragraph starting with English is rtl', () => assert.ok(rtlBlock(r['p-mixed'])));
check('payload isolate beats index.css plaintext on a marked block', () => assert.strictEqual(r['p-mixed'].bidi, 'isolate'));
check('English paragraph untouched', () => assert.ok(!r['p-en'].crtl && r['p-en'].direction === 'ltr' && r['p-en'].bidi === 'plaintext'));
check('paragraph with inline code is rtl', () => assert.ok(rtlBlock(r['p-code'])));
check('list is rtl despite native dir=ltr', () => assert.ok(rtlBlock(r.ul) && r['li-fa'].direction === 'rtl'));
check('English item in rtl list: data-crtl-text, plaintext, right aligned', () =>
    assert.ok(r['li-en'].text && r['li-en'].bidi === 'plaintext' && r['li-en'].align === 'right'));
check('table with Persian header is rtl', () => assert.ok(rtlBlock(r.table) && r.th.direction === 'rtl'));
check('English cell keeps table side', () => assert.ok(r['td-en'].direction === 'rtl'));
check('pre stays ltr, untouched', () => assert.ok(!r.pre.crtl && r.pre.direction === 'ltr'));
check('prompt not written to, plaintext + start', () =>
    assert.ok(!r.prompt.dir && !r.prompt.crtl && r.prompt.bidi === 'plaintext' && r.prompt.align === 'start'));
check('mirror lays out like the prompt', () =>
    assert.ok(r.mirror.direction === r.prompt.direction && r.mirror.bidi === 'plaintext' && r.mirror.align === 'start' && r.mirror.font === r.prompt.font));
check('prompt font: RTL alias first, then chat font', () => assert.ok(/^"Claude RTL Font", -apple-system/.test(r.prompt.font), r.prompt.font));
check('RTL paragraph font: alias prepended', () => assert.ok(/^"?'?Claude RTL Font/.test(r['p-mixed'].font), r['p-mixed'].font));
check('font faces loaded from bytes (no CSP fetch)', () => assert.ok(r.alias === 'Claude RTL Font' && r.fontStatus.length === 2 && r.fontStatus.every((s) => s === 'loaded')));
check('all three style blocks present', () => assert.strictEqual(r.styles.length, 3));
console.log('\nscreenshot: ' + shot + '\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
