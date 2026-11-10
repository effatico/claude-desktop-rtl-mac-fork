// ===========================================================================
// Claude RTL Patch — dominant-language direction for mixed RTL/LTR text
//
// Based on the RTL detection payload by @shraga100
// Source: https://github.com/shraga100/claude-desktop-rtl-patch
//
// Claude Desktop ships its own RTL handling, but it picks the direction of a
// block from its FIRST strong character. That breaks mixed Persian/English
// text: a Persian list whose first item starts with an English word or a
// `code` span renders fully left-to-right. This payload builds on top of the
// native handling and replaces that rule with a dominant-language rule:
//
//   - Each block (paragraph, heading, list, table, line of interface text)
//     gets the direction of the script most of its words are written in.
//     Code, URLs, paths and file names are not counted.
//   - A list or table has ONE direction, so bullets, numbers and columns stay
//     on one side. An item written in the other language keeps the list's
//     side and is ordered from its own first letter. A table with an RTL header
//     row is RTL, so its first column (the row number) is on the right.
//   - Interface layout is never mirrored: only the box that holds the text
//     is given a direction, never a box that lays out other boxes.
//   - Blocks with no RTL text are never touched.
//   - Code blocks, inline code and math always stay left-to-right.
//   - Editors (the prompt box) are never modified from script; only CSS
//     applies there, so the editor's own document model is left alone.
//
// The payload makes no network requests, uses no IPC, storage or eval. It
// only reads text and sets `dir`, a few `data-crtl*` attributes and, unless
// patch.sh ran with --font none, an inline `font-family`.
//
// It is prepended to Electron renderer preload files inside app.asar. It runs
// as an IIFE and only activates when `document` is available.
// ===========================================================================

// --- CLAUDE RTL PATCH START ---
;(function() {
    'use strict';
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (window.__claudeRtlPatch) return;
    window.__claudeRtlPatch = 2;

    try {
        // Attributes written by this payload.
        var A_DIR = 'data-crtl';        // direction decided for the element
        var A_TXT = 'data-crtl-text';   // element's text is ordered per line
        var A_ORIG = 'data-crtl-orig';  // `dir` value the app had set before
        var A_IN = 'data-crtl-in';      // inline wrapper that follows its block
        var A_FONT = 'data-crtl-font';  // RTL font was put first in its stack
        var A_WRAP = 'data-crtl-wrap';  // box around a table, follows the table
        var A_FLIP = 'data-crtl-flip';  // had a fixed left/right alignment

        // Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic, Arabic
        // extended blocks and the Hebrew/Arabic presentation forms.
        var RTL_CH = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
        // A word: letters and marks, plus ZWNJ/ZWJ so that a Persian word such
        // as "می‌کنم" counts once. Digits and punctuation are not words.
        var TOKEN = /[\p{L}\p{M}‌‍]+/gu;

        // Share of RTL words at or above which a block is RTL, and below which
        // it is LTR. In between, the first word decides. The RTL bar is under
        // one half on purpose: a Persian sentence about software is full of
        // English terms, while an English sentence rarely carries this much
        // Persian.
        var RTL_SHARE = 0.4;
        var LTR_SHARE = 0.3;

        // Text inside these never counts and is never given a direction.
        var SKIP_SEL = 'pre,code,kbd,samp,svg,math,script,style,noscript,' +
            'textarea,input,select,[contenteditable]:not([contenteditable="false"]),' +
            '.katex,.katex-display,mjx-container,.cm-editor,.monaco-editor,.xterm';
        var SKIP_TAG = { PRE: 1, CODE: 1, KBD: 1, SAMP: 1, SVG: 1, svg: 1, MATH: 1, math: 1,
            SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1 };
        var SPACED_TAG = /^(P|LI|DIV|TD|TH|TR|H[1-6]|UL|OL|BLOCKQUOTE|DT|DD|TABLE|SECTION|ARTICLE)$/;

        // Elements that own the direction of the text inside them.
        var PROSE_SEL = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dt,dd,summary,figcaption,caption';
        var IN_LIST_SEL = 'p,h1,h2,h3,h4,h5,h6,blockquote,dt,dd,summary';
        var GROUP_SEL = 'ul,ol,table';
        var NEAR_SEL = PROSE_SEL + ',' + GROUP_SEL;
        // Only this much text of a block is read to decide its direction.
        // It bounds the work per block however long a response gets.
        var MAX_TEXT = 4000;
        // And only this many nodes: a block built from thousands of empty
        // elements must not be walked to its end either.
        var MAX_NODES = 8000;
        // The app wraps the text of some blocks (table cells, list items) in
        // an inline element with its own first-strong `dir`.
        var INNER_SEL = 'span[dir],bdi[dir],div[dir]';
        // Inline content that is a box, not text: an icon, an image, a control.
        var ATOMIC_TAG = { SVG: 1, svg: 1, IMG: 1, PICTURE: 1, CANVAS: 1, VIDEO: 1,
            BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1 };

        // -------------------------------------------------------------------
        // Text and direction
        // -------------------------------------------------------------------

        // Visible text of `el` without code, math and form controls. With
        // `skipLists`, nested lists are left out (used for a list item's own
        // text).
        function textOf(el, skipLists) {
            var out = '', left = MAX_NODES;
            (function walk(node) {
                for (var c = node.firstChild; c; c = c.nextSibling) {
                    if (out.length >= MAX_TEXT || --left < 0) return;
                    if (c.nodeType === 3) {
                        // Never copy more than is read: one text node can
                        // hold megabytes.
                        var room = MAX_TEXT - out.length;
                        out += c.data.length > room ? c.data.slice(0, room) : c.data;
                        continue;
                    }
                    if (c.nodeType !== 1) continue;
                    var tag = c.tagName;
                    if (SKIP_TAG[tag]) { out += ' '; continue; }
                    if (skipLists && (tag === 'UL' || tag === 'OL')) continue;
                    // Not `isContentEditable`: that asks the style engine and
                    // climbs every ancestor, once per node read.
                    var ce = c.getAttribute('contenteditable');
                    if (ce !== null && ce !== 'false') continue;
                    var cl = c.classList;
                    if (cl && (cl.contains('katex') || cl.contains('katex-display'))) continue;
                    if (tag === 'BR') { out += '\n'; continue; }
                    walk(c);
                    if (SPACED_TAG.test(tag)) out += ' ';
                }
            })(el);
            return out;
        }

        // A chunk of text between spaces that is Latin by nature and says
        // nothing about the language of the sentence around it: a URL, an
        // e-mail address, a path, a file name or a dotted identifier. Every
        // test here is a plain scan, so a very long chunk (a hash, base64)
        // costs time in proportion to its length and no more.
        function isTechnical(chunk) {
            return chunk.indexOf('/') !== -1 || chunk.indexOf('\\') !== -1 ||
                chunk.indexOf('@') !== -1 || /\w\.\w/.test(chunk);
        }

        // 'rtl', 'ltr', or null when the text has no RTL words at all.
        function decide(text) {
            if (!text) return null;
            if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
            if (!RTL_CH.test(text)) return null;
            var rtl = 0, ltr = 0, first = null, m;
            var chunks = text.split(/\s+/);
            for (var i = 0; i < chunks.length; i++) {
                var chunk = chunks[i];
                if (!chunk) continue;
                var hasRtl = RTL_CH.test(chunk);
                // Once per chunk: a chunk without spaces can hold thousands
                // of words, and this test reads the whole chunk.
                var technical = isTechnical(chunk);
                if (!hasRtl && technical) continue;
                TOKEN.lastIndex = 0;
                while ((m = TOKEN.exec(chunk))) {
                    if (RTL_CH.test(m[0])) { rtl++; if (!first) first = 'rtl'; }
                    else if (!technical) { ltr++; if (!first) first = 'ltr'; }
                }
            }
            if (!rtl) return null;
            var share = rtl / (rtl + ltr);
            if (share >= RTL_SHARE) return 'rtl';
            if (share < LTR_SHARE) return 'ltr';
            return first;
        }

        function isMonoFamily(family) {
            family = family || '';
            return /mono|courier|menlo|consolas|code/i.test(family.split(',')[0]) ||
                /(^|,)\s*monospace\s*(,|$)/i.test(family);
        }

        function isMono(el) {
            return isMonoFamily(getComputedStyle(el).fontFamily);
        }

        // Optional RTL font. patch.sh's font injector defines the font face
        // and stores its family name in `window.__claudeRtlFont`; without
        // --font the global is unset and nothing happens here. The face only
        // covers RTL code points, so putting it first in an element's own
        // font stack changes RTL text and nothing else.
        //
        // The stack is written as an inline style, which would outlive a
        // change of the element's own font (a reused element that becomes
        // tool output in a monospace font). So the inline value the element
        // had is remembered, `dropFont` puts it back, and `collect` drops and
        // re-applies the font each time it scans an element.
        var fontPrev = new WeakMap();

        function applyFont(el) {
            var family = window.__claudeRtlFont;
            if (!family || el.hasAttribute(A_FONT)) return;
            var current = getComputedStyle(el).fontFamily;
            if (!current || isMonoFamily(current)) return;
            fontPrev.set(el, {
                value: el.style.getPropertyValue('font-family'),
                priority: el.style.getPropertyPriority('font-family')
            });
            el.style.setProperty('font-family', "'" + family + "', " + current);
            el.setAttribute(A_FONT, '');
        }

        function dropFont(el) {
            if (!el.hasAttribute(A_FONT)) return;
            var family = window.__claudeRtlFont;
            var prev = fontPrev.get(el);
            // If the app wrote a font of its own since, that one stays.
            if (!family || el.style.getPropertyValue('font-family').indexOf(family) !== -1) {
                if (prev && prev.value) el.style.setProperty('font-family', prev.value, prev.priority);
                else el.style.removeProperty('font-family');
            }
            fontPrev.delete(el);
            el.removeAttribute(A_FONT);
        }

        function isField(el) {
            return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
        }

        // -------------------------------------------------------------------
        // Marking
        // -------------------------------------------------------------------

        function mark(el, dir, perLine) {
            // Remember the app's own `dir`, also when the app changed it after
            // this element was first marked.
            var current = el.getAttribute('dir') || '';
            if (!el.hasAttribute(A_DIR) || current !== el.getAttribute(A_DIR)) {
                el.setAttribute(A_ORIG, current);
            }
            if (current !== dir) el.setAttribute('dir', dir);
            if (el.getAttribute(A_DIR) !== dir) el.setAttribute(A_DIR, dir);
            if (perLine) {
                if (!el.hasAttribute(A_TXT)) el.setAttribute(A_TXT, '');
            } else if (el.hasAttribute(A_TXT)) {
                el.removeAttribute(A_TXT);
            }
        }

        function unmark(el) {
            if (!el.hasAttribute(A_DIR)) return;
            var orig = el.getAttribute(A_ORIG);
            if (el.getAttribute('dir') === el.getAttribute(A_DIR)) {
                if (orig) el.setAttribute('dir', orig); else el.removeAttribute('dir');
            }
            el.removeAttribute(A_DIR);
            el.removeAttribute(A_TXT);
            el.removeAttribute(A_ORIG);
            el.removeAttribute(A_IN);
            el.removeAttribute(A_WRAP);
            el.removeAttribute(A_FLIP);
        }

        // Inline wrappers that belong to `el` itself, not to a block or group
        // nested inside it.
        // The walk stops at those, so a block is read once however deep the
        // lists inside it are nested.
        function innerOf(el, sel) {
            var out = [];
            (function walk(node) {
                for (var c = node.firstElementChild; c; c = c.nextElementSibling) {
                    if (c.matches(SKIP_SEL) || c.matches(NEAR_SEL)) continue;
                    if (c.matches(sel)) out.push(c);
                    walk(c);
                }
            })(el);
            return out;
        }

        // Make the app's inline `dir` wrappers follow the direction decided
        // for the text of `el`; left alone, they would override it.
        function syncInner(el, dir) {
            var inner = innerOf(el, INNER_SEL);
            for (var i = 0; i < inner.length; i++) {
                mark(inner[i], dir, false);
                inner[i].setAttribute(A_IN, '');
            }
        }

        function clear(el) {
            var inner = innerOf(el, '[' + A_IN + ']');
            for (var i = 0; i < inner.length; i++) unmark(inner[i]);
            unmark(el);
        }

        // A block of its own: direction follows its dominant language. Text
        // that keeps its line breaks (a multi-line user message) is ordered
        // line by line, because each line may be in a different language.
        function processBlock(el) {
            if (!el.isConnected) return;
            if (isMono(el)) { clear(el); return; }
            var raw = textOf(el, false);
            var dir = decide(raw);
            if (!dir) { clear(el); return; }
            var perLine = raw.indexOf('\n') !== -1 &&
                /^pre/.test(getComputedStyle(el).whiteSpace);
            // Interface labels are often pinned to the left whatever their
            // text (a session title in the sidebar). A label pinned to the
            // side its text now ends on is moved to the side it starts on.
            // Centred text stays centred.
            var changed = el.getAttribute(A_DIR) !== dir;
            if (changed) el.removeAttribute(A_FLIP);
            if (!perLine && !el.hasAttribute(A_FLIP)) {
                var align = getComputedStyle(el).textAlign;
                if ((dir === 'rtl' && align === 'left') || (dir === 'ltr' && align === 'right')) {
                    el.setAttribute(A_FLIP, '');
                }
            }
            mark(el, dir, perLine);
            if (perLine) innerOf(el, '[' + A_IN + ']').forEach(unmark);
            else syncInner(el, dir);
        }

        // A child of a list or table: it takes the group's direction so that
        // markers and columns stay on one side. If its own language differs,
        // its text is ordered per line and aligned to the group's side.
        // A monospace child (a cell of tool output) is not written to.
        function markChild(el, groupDir, text) {
            if (el.closest(SKIP_SEL) || isMono(el)) { clear(el); return; }
            var own = decide(text) || 'ltr';
            mark(el, groupDir, own !== groupDir);
            syncInner(el, own);
        }

        // What belongs to `list` itself: the text blocks in its items and
        // the lists directly nested in it. The walk does not go into a nested
        // list or table, so each list reads only its own part of the tree.
        function partsOf(list) {
            var own = [], nested = [];
            (function walk(node) {
                for (var c = node.firstElementChild; c; c = c.nextElementSibling) {
                    var tag = c.tagName;
                    if (tag === 'UL' || tag === 'OL') { nested.push(c); continue; }
                    if (tag === 'TABLE' || c.matches(SKIP_SEL)) continue;
                    if (c.matches(IN_LIST_SEL)) own.push(c);
                    walk(c);
                }
            })(list);
            return { own: own, nested: nested };
        }

        // `inherited` is the direction of the list around a nested list that
        // has no RTL text of its own: it keeps its markers on the same side.
        // `done` holds the lists already handled in this run; a nested list is
        // reached from the list around it and must not be walked again.
        // `noText` says the caller already found no RTL text in the list.
        function processList(list, inherited, done, noText) {
            if (!list.isConnected || done.has(list)) return;
            done.add(list);
            var i, items = list.children, parts = partsOf(list);
            var dir = isMono(list) ? null :
                ((noText ? null : decide(textOf(list, false))) || inherited || null);
            if (!dir) {
                unmark(list);
                for (i = 0; i < items.length; i++) clear(items[i]);
                for (i = 0; i < parts.own.length; i++) clear(parts.own[i]);
                // Nested lists that had taken this list's direction.
                for (i = 0; i < parts.nested.length; i++) {
                    if (parts.nested[i].hasAttribute(A_DIR) &&
                        !decide(textOf(parts.nested[i], false))) processList(parts.nested[i], null, done, true);
                }
                return;
            }
            mark(list, dir, false);
            for (i = 0; i < items.length; i++) {
                if (items[i].tagName === 'LI') markChild(items[i], dir, textOf(items[i], true));
            }
            for (i = 0; i < parts.own.length; i++) {
                markChild(parts.own[i], dir, textOf(parts.own[i], true));
            }
            // Nested lists with RTL text are processed on their own.
            for (i = 0; i < parts.nested.length; i++) {
                if (!decide(textOf(parts.nested[i], false))) processList(parts.nested[i], dir, done, true);
            }
        }

        function processTable(table) {
            if (!table.isConnected) return;
            // `rows`, `cells` and `tHead` list this table's own parts, never
            // those of a table nested in one of its cells.
            var i, j, cells = [], rows = table.rows;
            if (table.caption) cells.push(table.caption);
            for (i = 0; i < rows.length; i++) {
                for (j = 0; j < rows[i].cells.length; j++) cells.push(rows[i].cells[j]);
            }
            var dir = null;
            if (!isMono(table)) {
                // A table with an RTL header row is an RTL table even when its
                // cells are mostly numbers, code or English terms.
                var head = table.tHead || rows[0];
                if (head && decide(textOf(head, false)) === 'rtl') dir = 'rtl';
                else dir = decide(textOf(table, false));
            }
            for (i = 0; i < cells.length; i++) {
                if (dir) markChild(cells[i], dir, textOf(cells[i], false));
                else clear(cells[i]);
            }
            if (dir) mark(table, dir, false); else unmark(table);

            // The app puts a table in a box of its own (it scrolls sideways
            // when the table is wide). That box follows the table, so an RTL
            // table starts at the right edge and scrolls from the right.
            var wrap = table.parentElement;
            if (wrap && wrap !== document.body && wrap.children.length === 1 &&
                !wrap.closest(SKIP_SEL) && !wrap.matches(PROSE_SEL)) {
                if (dir) { mark(wrap, dir, false); wrap.setAttribute(A_WRAP, ''); }
                else if (wrap.hasAttribute(A_WRAP)) unmark(wrap);
            }
        }

        // -------------------------------------------------------------------
        // Finding what to process
        // -------------------------------------------------------------------

        // A list the app draws with bullets or numbers. Lists without markers
        // are interface (a sidebar, a menu) and are not treated as text.
        function isProseGroup(group) {
            if (group.tagName === 'TABLE') return true;
            if (getComputedStyle(group).listStyleType !== 'none') return true;
            var item = group.firstElementChild;
            return !!item && getComputedStyle(item).listStyleType !== 'none';
        }

        // A flex or grid box with element children places those children;
        // giving it a direction would reorder them. With text only, there is
        // nothing to reorder.
        function laysOutBoxes(el) {
            return !!el.firstElementChild && /flex|grid/.test(getComputedStyle(el).display);
        }

        // What the direct children of `el` are: `text` when it holds text of
        // its own, `atomic` for the number of inline boxes that are not text
        // (icons, images, inline-blocks), `block` when a child is a block.
        // Kept for one run: many text nodes share the same ancestors.
        var shapes = null;

        function isAtomic(el, display) {
            return display !== 'inline' || !!ATOMIC_TAG[el.tagName];
        }

        function shapeOf(el) {
            var s = shapes && shapes.get(el);
            if (s) return s;
            s = { text: false, atomic: 0, block: false };
            for (var c = el.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3) {
                    if (!s.text && /\S/.test(c.data)) s.text = true;
                    continue;
                }
                if (c.nodeType !== 1) continue;
                var d = getComputedStyle(c).display;
                if (d === 'none' || d === 'contents') continue;
                if (!/^inline/.test(d)) s.block = true;
                else if (isAtomic(c, d)) s.atomic++;
            }
            if (shapes) shapes.set(el, s);
            return s;
        }

        // `el` has no text of its own and places `from` next to another
        // inline box: a button with an icon and a label. A direction on `el`
        // would swap the two, so the label is the box to mark.
        function arrangesBoxes(el, from) {
            var s = shapeOf(el);
            if (s.text) return false;
            var d = getComputedStyle(from).display;
            var own = /^inline/.test(d) && isAtomic(from, d) ? 1 : 0;
            return s.atomic - own > 0;
        }

        // The element that owns the direction of a text node, or null when
        // the text must be left alone.
        function ownerOf(el) {
            if (!el || el.closest(SKIP_SEL)) return null;
            var owner = el.closest(PROSE_SEL);
            if (owner && !laysOutBoxes(owner)) {
                var group = owner.closest(GROUP_SEL);
                if (!group || isProseGroup(group)) return owner;
            }
            // Interface text, or prose markup used for layout: the nearest box
            // that lays the text itself out.
            var n = el, from = null;
            while (n && n !== document.body) {
                if (from && arrangesBoxes(n, from)) return from;
                var display = getComputedStyle(n).display;
                // An inline-block that is the only child of its parent is a
                // wrapper around the text (used to measure or clip it), not a
                // box of its own: the parent is the one that places the text.
                var passThrough = display === 'inline' || display === 'contents' ||
                    (display === 'inline-block' && n.parentElement &&
                        n.parentElement.children.length === 1);
                if (!passThrough) break;
                from = n;
                n = n.parentElement;
            }
            if (!n || n === document.body || n === document.documentElement) return null;
            // A box that also lays out other boxes is a layout container.
            // Flipping it would reorder the interface, so leave it alone.
            if (laysOutBoxes(n) || shapeOf(n).block) return null;
            return n;
        }

        function collect(root, sets, seenParents) {
            if (!root || root.nodeType !== 1 || !root.isConnected) return;

            // Groups are queued outermost first, so a list is always handled
            // before the lists nested in it. The climb stops at a group that
            // is queued already: the groups around it were queued with it.
            function add(el) {
                var group = el.closest(GROUP_SEL);
                if (!group || !isProseGroup(group)) { sets.blocks.add(el); return; }
                var chain = [];
                while (group && !sets.groups.has(group)) {
                    chain.push(group);
                    // The group is part of the text of every list around it.
                    group = group.parentElement && group.parentElement.closest(GROUP_SEL);
                    if (group && !isProseGroup(group)) group = null;
                }
                for (var k = chain.length - 1; k >= 0; k--) sets.groups.add(chain[k]);
            }

            // Elements marked earlier: their text may have changed or gone.
            // An inline wrapper is re-checked through the block it follows.
            // One that now sits inside code or an editor (the app moved it)
            // is given back as it was. Text fields belong to `onInput`.
            function recheck(el) {
                if (isField(el)) return;
                if (el.closest(SKIP_SEL)) { clear(el); return; }
                if (el.hasAttribute(A_WRAP)) {
                    var only = el.firstElementChild;
                    if (only && only.tagName === 'TABLE' && el.children.length === 1) el = only;
                    else { unmark(el); return; }
                }
                if (el.hasAttribute(A_IN)) {
                    el = el.parentElement &&
                        el.parentElement.closest('[' + A_DIR + ']:not([' + A_IN + '])');
                }
                if (el) add(el);
            }
            var marked = root.querySelectorAll('[' + A_DIR + ']');
            for (var i = 0; i < marked.length; i++) recheck(marked[i]);
            var above = root.closest('[' + A_DIR + ']');
            if (above) recheck(above);

            // The font is taken off and, below, put back where RTL text still
            // sits in a font that is not monospace and outside code.
            var fonted = root.querySelectorAll('[' + A_FONT + ']');
            for (i = 0; i < fonted.length; i++) {
                if (!isField(fonted[i])) dropFont(fonted[i]);
            }
            if (!isField(root)) dropFont(root);

            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            var node;
            while ((node = walker.nextNode())) {
                if (!RTL_CH.test(node.data)) continue;
                var parent = node.parentElement;
                if (!parent || seenParents.has(parent)) continue;
                seenParents.add(parent);
                if (!parent.closest(SKIP_SEL)) applyFont(parent);
                var owner = ownerOf(parent);
                if (owner) add(owner);
            }
        }

        function run(roots) {
            var sets = { blocks: new Set(), groups: new Set() };
            var seenParents = new Set(), done = new Set();
            shapes = new Map();
            try {
                for (var i = 0; i < roots.length; i++) collect(roots[i], sets, seenParents);
            } finally { shapes = null; }
            sets.blocks.forEach(processBlock);
            sets.groups.forEach(function(group) {
                if (group.tagName === 'TABLE') processTable(group);
                else processList(group, null, done);
            });
        }

        // -------------------------------------------------------------------
        // Plain text fields. Rich editors are handled by CSS only.
        // -------------------------------------------------------------------

        function onInput(e) {
            var t = e.target;
            if (!t || t.nodeType !== 1) return;
            var textField = t.tagName === 'TEXTAREA' ||
                (t.tagName === 'INPUT' && /^(text|search)?$/.test(t.getAttribute('type') || ''));
            if (!textField) return;
            var dir = decide(t.value);
            if (dir) { mark(t, dir, false); applyFont(t); } else { unmark(t); dropFont(t); }
        }

        // -------------------------------------------------------------------
        // Styles
        // -------------------------------------------------------------------

        function injectStyles() {
            if (document.getElementById('claude-rtl-styles')) return;
            var parent = document.head || document.documentElement;
            if (!parent) return;
            var s = document.createElement('style');
            s.id = 'claude-rtl-styles';
            s.textContent = [
                // Code and math are always left-to-right.
                'pre,.code-block__code{unicode-bidi:isolate!important;direction:ltr!important;text-align:left!important}',
                'code,kbd,samp{unicode-bidi:isolate!important;direction:ltr!important}',
                '.katex,.katex-display,mjx-container,math{direction:ltr!important;unicode-bidi:isolate!important}',
                // Decided direction. !important keeps it if the app rewrites `dir`.
                '[' + A_DIR + '="rtl"]{direction:rtl!important}',
                '[' + A_DIR + '="ltr"]{direction:ltr!important}',
                '[' + A_DIR + ']:not([' + A_TXT + ']){unicode-bidi:isolate!important}',
                '[' + A_DIR + '="rtl"][' + A_FLIP + ']{text-align:right!important}',
                '[' + A_DIR + '="ltr"][' + A_FLIP + ']{text-align:left!important}',
                // A table narrower than its box sits on the side it starts from.
                'table[' + A_DIR + '="rtl"]{margin-left:auto!important;margin-right:0!important}',
                // Per-line ordering, aligned to the side of the decided direction.
                '[' + A_DIR + '][' + A_TXT + ']{unicode-bidi:plaintext!important}',
                // Not for cells with an alignment of their own (a centred column).
                '[' + A_DIR + '="rtl"][' + A_TXT + ']:not([align]):not([style*="text-align"]){text-align:right!important}',
                '[' + A_DIR + '="ltr"][' + A_TXT + ']:not([align]):not([style*="text-align"]){text-align:left!important}',
                // Rich editors: direction per paragraph from its own text.
                '[contenteditable="true"] :is(p,li,h1,h2,h3,h4,blockquote):not([dir]){unicode-bidi:plaintext;text-align:start}'
            ].join('');
            parent.appendChild(s);
        }

        // -------------------------------------------------------------------
        // Scheduling
        // -------------------------------------------------------------------

        var pending = new Set();
        var timer = 0;
        var MAX_ROOTS = 60;

        function flush() {
            timer = 0;
            var roots = Array.from(pending);
            pending.clear();
            if (!document.body) return;
            try {
                injectStyles();
                run(coalesce(roots));
            } catch (e) { console.error('[Claude RTL]', e); }
        }

        // Drop roots that sit inside another root, so no subtree is scanned
        // twice. Only a flood of unrelated roots (a page change) falls back
        // to one scan of the whole page.
        function coalesce(roots) {
            var set = new Set(roots), out = [];
            for (var i = 0; i < roots.length; i++) {
                var r = roots[i], inside = false;
                if (!r.isConnected) continue;
                for (var p = r.parentElement; p; p = p.parentElement) {
                    if (set.has(p)) { inside = true; break; }
                }
                if (!inside) out.push(r);
            }
            return out.length > MAX_ROOTS ? [document.body] : out;
        }

        function schedule(node) {
            pending.add(node);
            if (!timer) timer = setTimeout(flush, 80);
        }

        function init() {
            if (!document.body) return;
            injectStyles();
            schedule(document.body);
            document.addEventListener('input', onInput, true);

            var obs = new MutationObserver(function(muts) {
                for (var i = 0; i < muts.length; i++) {
                    var m = muts[i];
                    if (m.type === 'characterData') {
                        if (m.target.parentElement) schedule(m.target.parentElement);
                    } else {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var n = m.addedNodes[j];
                            if (n.nodeType === 1) schedule(n);
                            else if (n.nodeType === 3 && n.parentElement) schedule(n.parentElement);
                        }
                        // Removed text can change the dominant language.
                        if (m.removedNodes.length && m.target.nodeType === 1) schedule(m.target);
                    }
                }
            });
            // Attributes are not observed, so this payload's own writes never
            // re-trigger it.
            obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else { init(); }
    } catch (e) { console.error('[Claude RTL]', e); }
})();
// --- CLAUDE RTL PATCH END ---
