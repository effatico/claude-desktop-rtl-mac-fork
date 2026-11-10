'use strict';
// ===========================================================================
// Claude Code RTL — patch logic for the Claude Code VS Code extension.
//
// Claude Code's chat webview only runs scripts that carry its own nonce and
// only loads files from its own extension folder, so another extension cannot
// add a script to it through the VS Code API. The one way in is the bundle the
// webview loads, <claude-code>/webview/index.js. This module prepends the RTL
// header (rtl-payload.js + the font injector) to that file, keeps a copy of
// the original next to it and restores it on remove.
//
// No `vscode` import: the same code runs from extension.js, uninstall.js and
// the tests under plain node. No network, no eval. The only files written are
// index.js, its backup and a temporary file in the same webview folder.
// ===========================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Same values as patch.sh (DEFAULT_RTL_FONT, RTL_FONT_ALIAS, RTL_UNICODE_RANGE).
const DEFAULT_RTL_FONT = 'Vazirmatn';
const RTL_FONT_ALIAS = 'Claude RTL Font';
const RTL_UNICODE_RANGE = 'U+0590-08FF,U+FB1D-FDFF,U+FE70-FEFF,U+200C-200D';

const CLAUDE_CODE_ID = 'anthropic.claude-code';
const MARKER = '// --- CLAUDE RTL VSCODE ';
const END_LINE = '// --- CLAUDE RTL VSCODE END ---\n';
const BACKUP_SUFFIX = '.crtl-orig';
const USE_STRICT = '"use strict";';
// The marker sits on the first line, or on the second after a "use strict"
// directive; nothing further into the 6 MB file needs to be read for it.
const MARKER_RE = /^(?:"use strict";\n)?\/\/ --- CLAUDE RTL VSCODE ([0-9a-f]{64}) START ---\n/;

// ---------------------------------------------------------------------------
// Assets: media/ inside the packaged extension, or the repo root in dev.
// ---------------------------------------------------------------------------

function assetPaths(extRoot) {
    const media = path.join(extRoot, 'media');
    if (fs.existsSync(path.join(media, 'rtl-payload.js'))) {
        return { payload: path.join(media, 'rtl-payload.js'), fonts: path.join(media, 'fonts') };
    }
    const repo = path.join(extRoot, '..');
    return { payload: path.join(repo, 'rtl-payload.js'), fonts: path.join(repo, 'fonts') };
}

// ---------------------------------------------------------------------------
// Font setting
// ---------------------------------------------------------------------------

// "" / "none" (any case) turn the font off. Returns the family, or "".
function normalizeFamily(value) {
    const v = value == null ? '' : String(value).trim();
    if (v === '' || v.toLowerCase() === 'none') return '';
    return v;
}

// The name is written into CSS inside a JS string; allow only characters
// that cannot end either of them (the same rule as patch.sh).
function validateFamily(family) {
    if (family && !/^[A-Za-z0-9 ._-]+$/.test(family)) {
        throw new Error('Font name "' + family + '" has unsupported characters. ' +
            'Use letters, digits, spaces, dots, dashes and underscores.');
    }
    return family;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

// Faces for `family` from the files in fontsDir, matched and weighted the way
// build_font_injector in patch.sh does it.
function fontFaces(family, fontsDir) {
    const key = family.toLowerCase().replace(/[ _]/g, '');
    const faces = [];
    let names = [];
    try { names = fs.readdirSync(fontsDir).sort(); } catch (e) { names = []; }
    // patch.sh globs *.woff2, *.woff, *.ttf, *.otf in that order.
    const exts = ['woff2', 'woff', 'ttf', 'otf'];
    for (const ext of exts) {
        for (const name of names) {
            const lc = name.toLowerCase();
            if (!lc.endsWith('.' + ext)) continue;
            const file = path.join(fontsDir, name);
            let st;
            try { st = fs.statSync(file); } catch (e) { continue; }
            if (!st.isFile()) continue;
            const flat = lc.replace(/[ _]/g, '');
            if (!(flat.startsWith(key + '.') || flat.startsWith(key + '-') || flat.startsWith(key + '['))) continue;

            let weight = '400';
            if (/variable|wght/.test(lc)) weight = '100 900';
            else if (/thin/.test(lc)) weight = '100';
            else if (/extralight|ultralight/.test(lc)) weight = '200';
            else if (/light/.test(lc)) weight = '300';
            else if (/medium/.test(lc)) weight = '500';
            else if (/semibold|demibold/.test(lc)) weight = '600';
            else if (/extrabold|ultrabold/.test(lc)) weight = '800';
            else if (/black|heavy/.test(lc)) weight = '900';
            else if (/bold/.test(lc)) weight = '700';
            const style = /italic|oblique/.test(lc) ? 'italic' : 'normal';

            faces.push('{w:"' + weight + '",s:"' + style + '",d:"' +
                fs.readFileSync(file).toString('base64') + '"},');
        }
    }
    return faces;
}

// JS port of build_font_injector. "" when the font is off.
function fontInjector(family, fontsDir) {
    if (!family) return '';
    validateFamily(family);
    const faces = fontFaces(family, fontsDir);
    // No files to embed: register the alias from an installed font of that name.
    if (!faces.length) faces.push('{w:"100 900",s:"normal",l:"local(\'' + family + '\')"},');

    // The payload never writes inside editors, so the prompt box gets the font
    // from CSS. Claude Code's prompt is a contenteditable role="textbox" with
    // an aria-hidden mirror next to it that draws the visible text; both
    // inherit the font from their parent, so the parent gets it and every
    // child is held to it (the caret then stays on the drawn letters).
    const css =
        ":has(> [role='textbox'][contenteditable]){font-family:'" + RTL_FONT_ALIAS +
        "',var(--vscode-chat-font-family,system-ui),sans-serif!important}" +
        ":has(> [role='textbox'][contenteditable]) > *{font-family:inherit!important}";

    // The faces are registered with the FontFace API from the font's bytes,
    // not with an @font-face rule: the webview's CSP font-src has no "data:",
    // while a font built from bytes already in memory is not a fetch.
    return '\n// --- CLAUDE RTL FONT START ---\n' +
        ';(function(){if(typeof document==="undefined"||typeof window==="undefined"||typeof FontFace==="undefined"||!document.fonts)return;' +
        'var N="' + RTL_FONT_ALIAS + '",R="' + RTL_UNICODE_RANGE + '",F=[' + faces.join('') + '];' +
        'function bytes(b){var s=atob(b),n=s.length,a=new Uint8Array(n);for(var i=0;i<n;i++)a[i]=s.charCodeAt(i);return a.buffer;}' +
        'var ok=0;for(var i=0;i<F.length;i++){try{var f=new FontFace(N,F[i].l||bytes(F[i].d),{weight:F[i].w,style:F[i].s,unicodeRange:R,display:"swap"});document.fonts.add(f);f.load().catch(function(e){console.error("[Claude RTL] font",e);});ok++;}catch(e){console.error("[Claude RTL] font",e);}}' +
        'if(!ok)return;window.__claudeRtlFont=N;' +
        'function add(){if(document.getElementById("claude-rtl-font"))return;if(!document.head&&!document.documentElement)return;var s=document.createElement("style");s.id="claude-rtl-font";s.textContent="' + css + '";(document.head||document.documentElement).appendChild(s);}' +
        'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",add);}else{add();}})();\n' +
        '// --- CLAUDE RTL FONT END ---\n';
}

// Prompt-box direction, with or without a font. The textbox draws its text
// transparent and an aria-hidden mirror beside it draws the visible copy. The
// payload leaves the editor alone but sees the mirror as ordinary text and
// would give it a direction of its own; the mirror must lay out exactly like
// the editor or the caret drifts away from the letters, so both are held to
// per-paragraph direction from their own text.
function promptStyle() {
    const css =
        "[role='textbox'][contenteditable],:has(> [role='textbox'][contenteditable]) > [aria-hidden='true']" +
        "{unicode-bidi:plaintext!important;text-align:start!important}" +
        ":has(> [role='textbox'][contenteditable]) > [aria-hidden='true'][dir]{direction:inherit!important}";
    return '\n// --- CLAUDE RTL VSCODE STYLE START ---\n' +
        ';(function(){if(typeof document==="undefined")return;' +
        'function add(){if(document.getElementById("claude-rtl-vscode"))return;var p=document.head||document.documentElement;if(!p)return;var s=document.createElement("style");s.id="claude-rtl-vscode";s.textContent="' + css + '";p.appendChild(s);}' +
        'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",add);}else{add();}})();\n' +
        '// --- CLAUDE RTL VSCODE STYLE END ---\n';
}

// The header in patch.sh's order: payload first, then the font injector.
function buildHeader(opts) {
    const family = validateFamily(normalizeFamily(opts.family));
    let payload = fs.readFileSync(opts.payloadPath, 'utf8');
    if (payload.indexOf('CLAUDE RTL PATCH START') === -1) {
        throw new Error('rtl-payload.js has no CLAUDE RTL PATCH START marker: ' + opts.payloadPath);
    }
    if (!payload.endsWith('\n')) payload += '\n';
    return payload + fontInjector(family, opts.fontsDir) + promptStyle();
}

function hashOf(header) {
    return crypto.createHash('sha256').update(header, 'utf8').digest('hex');
}

function wrap(header) {
    return MARKER + hashOf(header) + ' START ---\n' + header +
        (header.endsWith('\n') ? '' : '\n') + END_LINE;
}

// ---------------------------------------------------------------------------
// Target file
// ---------------------------------------------------------------------------

function targetOf(claudeCodePath) {
    return path.join(claudeCodePath, 'webview', 'index.js');
}

function isLink(p) {
    try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; }
}

// Refuse anything that would make a write land outside the webview folder.
function checkTarget(target) {
    const dir = path.dirname(target);
    for (const p of [path.dirname(dir), dir, target, target + BACKUP_SUFFIX]) {
        if (isLink(p)) throw new Error('Refusing to patch through a symbolic link: ' + p);
    }
    const st = fs.lstatSync(target);
    if (!st.isFile()) throw new Error('Not a regular file: ' + target);
    return st;
}

function patchHash(content) {
    const m = MARKER_RE.exec(content.slice(0, 200));
    return m ? m[1] : null;
}

// The original from a patched file, without the backup.
function strip(content) {
    const m = MARKER_RE.exec(content.slice(0, 200));
    if (!m) return content;
    const lead = m[0].startsWith(USE_STRICT) ? USE_STRICT.length + 1 : 0;
    const end = content.indexOf(END_LINE, lead);
    if (end === -1) throw new Error('Patched file has no end marker; restore it by reinstalling Claude Code.');
    return content.slice(end + END_LINE.length);
}

function writeAtomic(file, data, mode) {
    const tmp = file + '.crtl-tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
    const fd = fs.openSync(tmp, 'wx', mode & 0o777);
    try {
        fs.writeSync(fd, data);
        fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    try { fs.renameSync(tmp, file); } catch (e) {
        try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        throw e;
    }
}

function readBackup(backup) {
    try { return fs.readFileSync(backup, 'utf8'); } catch (e) { return null; }
}

function status(target) {
    const out = { target: target, exists: false, patched: false, hash: null, backup: false };
    try {
        checkTarget(target);
        out.exists = true;
        const fd = fs.openSync(target, 'r');
        const buf = Buffer.alloc(200);
        const n = fs.readSync(fd, buf, 0, 200, 0);
        fs.closeSync(fd);
        out.hash = patchHash(buf.slice(0, n).toString('utf8'));
        out.patched = !!out.hash;
    } catch (e) { out.error = e.message; }
    out.backup = fs.existsSync(target + BACKUP_SUFFIX);
    return out;
}

// Make `target` carry `header`. Returns { changed, reason }.
function apply(target, header) {
    const st = checkTarget(target);
    const backup = target + BACKUP_SUFFIX;
    const current = fs.readFileSync(target, 'utf8');
    const hash = hashOf(header);
    const curHash = patchHash(current);

    let original;
    if (curHash) {
        if (curHash === hash) return { changed: false, reason: 'already patched' };
        const saved = readBackup(backup);
        original = saved !== null ? saved : strip(current);
        if (saved === null) writeAtomic(backup, original, st.mode);
    } else {
        // Unpatched: this is the original. A backup that differs is from an
        // older file (Claude Code rewrote index.js), so replace it.
        original = current;
        if (readBackup(backup) !== original) writeAtomic(backup, original, st.mode);
    }

    // A file that opens with a "use strict" directive must still open with
    // it, or the code after the header would lose strict mode.
    const lead = original.startsWith(USE_STRICT) ? USE_STRICT + '\n' : '';
    writeAtomic(target, lead + wrap(header) + original, st.mode);
    return { changed: true, reason: curHash ? 'updated' : 'patched' };
}

// Put the original back and drop the backup. Returns { changed, reason }.
function remove(target) {
    const st = checkTarget(target);
    const backup = target + BACKUP_SUFFIX;
    const current = fs.readFileSync(target, 'utf8');
    if (!patchHash(current)) {
        // Not patched; a backup left over belongs to an older file.
        if (fs.existsSync(backup)) { fs.unlinkSync(backup); return { changed: false, reason: 'removed stale backup' }; }
        return { changed: false, reason: 'not patched' };
    }
    const saved = readBackup(backup);
    writeAtomic(target, saved !== null ? saved : strip(current), st.mode);
    if (saved !== null) fs.unlinkSync(backup);
    return { changed: true, reason: 'restored' };
}

module.exports = {
    DEFAULT_RTL_FONT, RTL_FONT_ALIAS, RTL_UNICODE_RANGE, CLAUDE_CODE_ID, BACKUP_SUFFIX,
    assetPaths, normalizeFamily, validateFamily, buildHeader, hashOf, targetOf,
    status, apply, remove, strip
};
